const { getDatabase } = require("../database/db");
const { config } = require("../config");
const moment = require("moment-timezone");
const logger = require("./logger");
const { cleanDateString } = require("../utils/textUtils");

async function runReminders(client) {
  const db = await getDatabase();
  const now = moment().tz("UTC");
  const targetTime = now.clone().add(20, "minutes").format("YYYY-MM-DD HH:mm");

  logger.debug(
    "REMINDERS",
    `Heartbeat: Checking for matches at ${targetTime} (UTC)`,
  );

  let matches;
  try {
    matches = await db.all("SELECT * FROM matches");
  } catch (e) {
    logger.error("REMINDERS", "Failed to retrieve matches from DB", e);
    return;
  }

  let count = 0;

  for (const m of matches) {
    try {
      const cleanDate = cleanDateString(m.date);
      const matchTime = moment.tz(
        `${cleanDate} ${m.time} ${now.year()}`,
        "MMM D HH:mm YYYY",
        "UTC",
      );
      const redScore = m.score_red;
      const blueScore = m.score_blue;

      if (
        matchTime.format("YYYY-MM-DD HH:mm") === targetTime &&
        redScore !== -1 &&
        blueScore !== -1
      ) {
        count++;
        const name =
          m.stage === "Qualifiers"
            ? `Qual ${m.match_id}`
            : `${m.match_id} (${m.team_red} vs ${m.team_blue})`;
        logger.info("REMINDERS", `Match Found: ${name}. Sending pings...`);

        const ping = async (username, role, chan) => {
          if (!username) return;
          const row = await db.get(
            "SELECT discord_id FROM users WHERE osu_username = ? COLLATE NOCASE",
            [username.trim()],
          );
          if (row) {
            await chan.send(
              `<@${row.discord_id}>, you are **${role}** for **${name}** starting in 20 min!`,
            );
            logger.info(
              "REMINDERS",
              `Pinged ${username} (<@${row.discord_id}>) as ${role}`,
            );
          } else {
            logger.warn(
              "REMINDERS",
              `Skipping ${username}. No Discord ID found in DB.`,
            );
          }
        };

        const streamChan = await client.channels
          .fetch(config.discord.streamerCommsChannelId)
          .catch(() => null);
        if (streamChan) {
          await ping(m.streamer, "Streamer", streamChan);
          await ping(m.referee, "Referee", streamChan);
        }

        const commsChan = await client.channels
          .fetch(config.discord.commsChannelId)
          .catch(() => null);
        if (commsChan) {
          await ping(m.comms_1, "Caster 1", commsChan);
          await ping(m.comms_2, "Caster 2", commsChan);
        }
      }
    } catch (e) {
      logger.error(
        "REMINDERS",
        `Error processing reminders for Match ID ${m?.match_id}`,
        e,
      );
    }
  }
  if (count === 0) {
    logger.debug("REMINDERS", "No matches found for this time slot.");
  }
}

async function availability(client) {
  const sendAvailabilityPing = async (label, channelId, roleId, url) => {
    if (!channelId || !roleId || !url) {
      logger.warn(
        "CRON",
        `Skipping ${label} availability ping because its channel, role, or URL is not configured.`,
      );
      return;
    }

    const chan = await client.channels.fetch(channelId).catch(() => null);
    if (chan) {
      await chan
        .send(
          `<@&${roleId}>, please fill out your availability for the next matches! ${url}`,
        )
        .catch((err) =>
          logger.error(
            "CRON",
            `Failed to send ${label} availability: ${err.message}`,
          ),
        );
    }
  };

  await sendAvailabilityPing(
    "streamer",
    config.discord.availability.streamers.channelId,
    config.discord.availability.streamers.roleId,
    process.env.STREAMER_AVAILABILITY_URL,
  );
  await sendAvailabilityPing(
    "referee",
    config.discord.availability.referees.channelId,
    config.discord.availability.referees.roleId,
    process.env.REFEREE_AVAILABILITY_URL,
  );
  await sendAvailabilityPing(
    "commentator",
    config.discord.availability.commentators.channelId,
    config.discord.availability.commentators.roleId,
    process.env.COMMS_AVAILABILITY_URL,
  );
}

module.exports = { runReminders, availability };
