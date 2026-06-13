# KELBot

Discord bot for osu! tournament operations. It synchronizes tournament data
from Google Sheets into SQLite, monitors Bancho multiplayer lobbies, publishes
match updates, sends staff reminders, and can update Challonge results.

Creator and maintainer: **myksmyks@KELTournaments**

## Features

- Global Discord slash commands for players, match staff, and administrators
- Statlord referee-sheet and Teams-sheet synchronization
- SQLite-backed users, matches, and mappool data
- Bancho IRC live match monitoring and manual result reconstruction
- Staff reminders, weekly availability pings, role sync, and icon upload
- Optional Challonge result updates

## Requirements

- Node.js 20.17 or newer
- A Discord application and bot token
- An osu! account with IRC credentials
- SQLite (provided by the npm dependency)
- Google Sheets, osu! API, and Challonge credentials for the related features

## Setup

```bash
npm ci
cp .env.example .env
cp config.example.json config.json
npm run smoke
npm test
npm start
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
Copy-Item config.example.json config.json
```

Fill in both files before starting the bot. Never commit `.env`, databases, or
service-account JSON. `config.json` is intentionally ignored so production IDs
remain local; `config.example.json` is the public template.

The bot registers global Discord commands at startup. Global command updates can
take time to become visible in Discord.

## Configuration

Public, non-secret settings are loaded from `config.json`:

| Section | Purpose |
| --- | --- |
| `discord` | Application, result-channel, reminder-channel, availability-channel, and role IDs |
| `googleSheets` | Spreadsheet IDs and tab names |
| `challonge.tournamentId` | Public Challonge tournament identifier |
| `runtime` | SQLite path and log level |
| `schedules` | Reminder interval, cron expressions, and timezone |

`discord.applicationId` is required. Other values enable their related
features. `runtime.databasePath` is resolved relative to the repository root.
`runtime.logLevel` accepts `DEBUG`, `INFO`, `WARN`, or `ERROR`.

Set `CONFIG_PATH` only when the bot should load a different JSON file. Legacy
environment names for public settings are still accepted when the matching JSON
field is omitted, easing upgrades from older deployments.

The variables required for the process to start are:

| Variable | Purpose |
| --- | --- |
| `TOKEN` | Discord bot token |
| `OSU_IRC_USERNAME` | osu! account used for Bancho IRC |
| `OSU_IRC_PASSWORD` | Bancho IRC password |

Other variables in [.env.example](.env.example) enable osu!, Google Sheets,
availability, icon-upload, and Challonge features. Missing optional feature
configuration is logged without printing secret values.

Google credentials must be stored outside Git and referenced by
`CREDENTIALS_PATH`. The service account needs read access to the configured
spreadsheets.

Secrets and private values must remain in `.env` or a deployment secret
manager:

- Discord and API tokens
- IRC and API passwords
- OAuth client secrets
- Google credential paths
- Challonge and icon-upload API keys
- Private availability form URLs

## Ref Sheet Compatibility

This bot is built for **Statlord Ref Sheet v1**. The synchronization code relies
on its exact tab names, ranges, row offsets, and column positions.

If you use another version or a differently structured referee sheet, update
[`src/services/syncSheets.js`](src/services/syncSheets.js) before running the
bot. In particular, verify:

- Qualifier and bracket tab names and ranges
- Mappool columns and starting row
- Match ID, date, staff, team, score, and multiplayer-link columns
- Per-match ban and first-picker cells
- The `Round Setup` stage and first-to columns

Using a different layout without updating these mappings can silently insert
incorrect match or mappool data into SQLite.

## Commands

### Player Commands

| Command | Options | Description |
| --- | --- | --- |
| `/osuset` | `username` | Looks up an osu! account, stores a verification request, and sends a verification code through Bancho private messages. An already verified account cannot be changed with this command. |
| `/verifyosu` | `code` | Confirms the code sent by `/osuset` and marks the Discord-to-osu! account link as verified. |
| `/schedule` | None | Shows up to four upcoming non-qualifier matches from the local SQLite database, including Discord relative timestamps. |

### Match Staff Commands

These commands require the Discord **Manage Messages** permission.

| Command | Options | Description |
| --- | --- | --- |
| `/monitor` | `id` | Synchronizes the referee sheet, finds the match and multiplayer lobby, starts Bancho IRC monitoring, and publishes live embeds to the configured result channels. |
| `/editscore` | `id`, `mod`, `red`, `blue` | Edits an existing map score or inserts a missing mappool map into an actively monitored match, then recalculates the match tally. |
| `/forcefinalize` | `id` | Immediately stops monitoring an active match, publishes its final state, and sends the result to Challonge when configured. |
| `/manualresult` | `id` | Reads an existing osu! multiplayer match through the legacy API, reconstructs its mappool results, publishes result embeds, and updates Challonge. |
| `/forfeit` | `id`, `loser` | Records a red- or blue-side forfeit, obtains the stage's first-to value from the sheet, broadcasts the result, and updates Challonge. |

### Administrator Commands

These commands require the Discord **Administrator** permission.

| Command | Options | Description |
| --- | --- | --- |
| `/update_matches` | None | Forces an immediate synchronization of qualifier matches, bracket matches, and the mappool from Google Sheets into SQLite. |
| `/startreminders` | None | Marks the current channel as the reminder channel for the current bot process. Staff assignment reminders themselves are sent to the configured streamer/referee and commentator channels. |
| `/syncosu` | `test`, `qualified` | Synchronizes Discord nicknames and the configured player role from the Teams sheet. `test` reports changes without applying them; `qualified` limits processing to qualified players. |
| `/syncicons` | `test` | Downloads avatars for qualified players from osu! and uploads them to the configured website endpoint. `test` performs a dry run without uploading files. |

Commands are registered globally at startup, so Discord may take time to show
new or changed definitions.

## Validation

```bash
npm run smoke
npm run test:ci
```

The smoke check loads service modules and validates every slash-command
definition without connecting to Discord, Bancho, Google, or osu!.

## Docker

Build the image:

```bash
docker build -t kelbot .
```

Run it with configuration and persistent data:

```bash
docker run -d \
  --name kelbot \
  --restart unless-stopped \
  --env-file .env \
  -v /host/path/config.json:/app/config.json:ro \
  -v /host/path/bot.db:/app/bot.db \
  -v /host/path/google-credentials.json:/app/google-credentials.json:ro \
  kelbot
```

For that example, set `runtime.databasePath` to `/app/bot.db` in the mounted
config and `CREDENTIALS_PATH=/app/google-credentials.json` in `.env`.

## Development

`npm run dev` starts Node.js watch mode. `npm run smoke` validates configuration
and loads command/service modules without connecting to Discord, Bancho,
Google, osu!, or Challonge. `npm run test:ci` runs Jest serially with coverage.

## Data

SQLite creates `users`, `matches`, and `mappool` tables automatically. Treat the
database as persistent private state: it may contain Discord IDs, osu!
usernames, assignments, scores, and tournament data. Back it up before
deployments and never publish it with the source.

## Deployment

The existing GitHub Actions workflow tests pushes to `main`, builds the Docker
image on a self-hosted runner, validates the image with the mounted production
configuration, replaces the running container, and optionally sends a Discord
webhook notification. Pull requests run only the hosted test job. Before
enabling deployment, configure these repository variables with absolute paths
on the self-hosted runner:

| Repository variable | Purpose |
| --- | --- |
| `BOT_ENV_FILE` | Bot environment file |
| `BOT_CONFIG_FILE` | Public bot configuration JSON |
| `BOT_DATABASE_FILE` | Persistent SQLite file |
| `BOT_GOOGLE_CREDENTIALS_FILE` | Google service-account JSON |

For the standard `/opt/actions-runner/` layout, create these files:

```text
/opt/actions-runner/.env
/opt/actions-runner/config.json
/opt/actions-runner/bot.db
/opt/actions-runner/google-credentials.json
```

Set the GitHub repository variables to:

```text
BOT_ENV_FILE=/opt/actions-runner/.env
BOT_CONFIG_FILE=/opt/actions-runner/config.json
BOT_DATABASE_FILE=/opt/actions-runner/bot.db
BOT_GOOGLE_CREDENTIALS_FILE=/opt/actions-runner/google-credentials.json
```

The deployed config must use `runtime.databasePath` set to `/app/bot.db`; the
environment must use `CREDENTIALS_PATH=/app/google-credentials.json`. Configure
`DISCORD_WEBHOOK` as an Actions secret if notifications are wanted.

Treat the SQLite database as persistent state. Back it up before deployments and
mount it into the container rather than baking it into the image.

## Security

- Keep all credentials in environment variables or a secret manager.
- Give the Google service account read-only spreadsheet access.
- Restrict Discord bot permissions and channel access to what the commands need.
- Rotate any credential that has ever been committed, then remove it from Git
  history before publishing the repository.
- Review database contents for Discord IDs, osu! usernames, and tournament data
  before sharing backups.

## License

ISC. See [LICENSE](LICENSE).
