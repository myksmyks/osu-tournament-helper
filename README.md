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
| `discord` | Application, result-channel, reminder-channel, welcome-verification channel, and role IDs |
| `googleSheets` | Spreadsheet IDs, tab names, and optional sheet-layout overrides |
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

Automatic welcome verification uses:

- `discord.welcomeChannelId`: channel where new members receive the welcome button
- `discord.verifiedRoleId`: role granted after successful osu! verification

`WELCOME_CHANNEL_ID` and `VERIFIED_ROLE_ID` remain available as environment
fallbacks. Enable the privileged **Server Members Intent** in the Discord
Developer Portal. The bot also needs View Channel and Send Messages in the
welcome channel, Manage Roles with its highest role above the verified role,
and Manage Nicknames with its highest role above members it should rename.

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

The built-in defaults match **Statlord Ref Sheet v1**, so the standard layout
does not need column mappings in `config.json`. Add only the fields you need to
override. For example, to move bracket match IDs to column `A` and multiplayer
links to column `K`:

```json
{
  "googleSheets": {
    "sheetColumns": {
      "bracket": {
        "matchId": "A",
        "mpLink": "K"
      }
    }
  }
}
```

Configuration is merged with internal defaults. Available mappings are
`qualifiers`, `bracket`, `mappool`, `liveMatch`, and `roundSetup`.

Rows are configured separately under `googleSheets.sheetRows`:

- `qualifiers.firstDataRow`: first qualifier match row
- `bracket.firstDataRow`: first bracket match row
- `mappool.firstDataRow`: first mappool entry row
- `liveMatch.banRows`: four ban rows in chronological order
- `liveMatch.firstBanSideRow`: row containing which side bans first
- `liveMatch.firstPickerRow`: row containing which side picks first
- `roundSetup.firstStageRow` / `lastStageRow`: rows containing stage rules

All row values are one-based Google Sheets row numbers and are validated at
startup.

Column values are case-insensitive, support multi-letter columns such as `AA`,
and are validated at startup. Keep each mapped field unique and verify the row
settings when using a differently structured referee sheet.

## Commands

### Player Commands

| Command | Options | Description |
| --- | --- | --- |
| `/osuset` | `username` | Starts the same osu! verification flow as the welcome button and sends a code through Bancho private messages. |
| `/verifyosu` | `code` | Confirms a pending code, grants the configured verified role, updates the nickname, and displays current osu! profile statistics. |
| `/schedule` | None | Shows up to four upcoming non-qualifier matches from the local SQLite database, including Discord relative timestamps. |

### Match Staff Commands

These commands require the Discord **Manage Messages** permission.

| Command | Options | Description |
| --- | --- | --- |
| `/monitor start` | `id` | Synchronizes the referee sheet, finds the match and multiplayer lobby, starts Bancho IRC monitoring, and publishes live embeds to the configured result channels. |
| `/monitor resume` | `id` | Restores a saved live-monitor checkpoint after a bot restart and continues editing the original result messages. |
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

### Manual Verification Checklist

- Join the server with a new user and confirm the welcome verification message appears in the configured channel.
- Click **Verify with osu!** as that user and confirm another member cannot use the same button.
- Submit an unknown osu! username and confirm a clean error is shown.
- Submit a valid username and confirm the Bancho private message contains a code.
- Enter an invalid code and confirm verification remains pending without granting access.
- Enter the valid code and confirm the configured role is granted.
- Confirm the member nickname changes to the canonical osu! username.
- Temporarily remove Manage Nicknames or move the member above the bot, then confirm verification succeeds with a clear nickname warning.
- Confirm the verified message shows the profile link, global rank, PP, country rank, and a clean fallback for missing data.
- Run `/osuset` and `/verifyosu` with a separate test user and confirm the existing command flow still works.

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

SQLite creates `users`, `matches`, `mappool`, and `monitor_sessions` tables
automatically. Treat the database as persistent private state: it may contain
Discord IDs, osu! usernames, assignments, live monitor checkpoints, scores, and
tournament data. Back it up before deployments and never publish it with the
source.

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
