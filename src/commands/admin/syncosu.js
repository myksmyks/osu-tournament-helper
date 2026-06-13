const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getSheetsClient } = require("../../services/googleSheetsService");
const osuService = require("../../services/osuService");
const { config } = require("../../config");
const logger = require("../../services/logger");

async function sendChunkedLog(interaction, title, logs) {
  if (logs.length === 0) return;
  let currentChunk = `${title}\n`;
  for (const log of logs) {
    if (currentChunk.length + log.length + 1 > 1900) {
      await interaction.followUp({
        content: `\`\`\`\n${currentChunk}\`\`\``,
        flags: [64],
      });
      currentChunk = "";
    }
    currentChunk += log + "\n";
  }
  if (currentChunk.length > 5) {
    await interaction.followUp({
      content: `\`\`\`\n${currentChunk}\`\`\``,
      flags: [64],
    });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("syncosu")
    .setDescription("Sync nicknames and roles from the Teams Sheet")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((o) =>
      o.setName("test").setDescription("Run without making changes"),
    )
    .addBooleanOption((o) =>
      o.setName("qualified").setDescription("Only sync qualified players"),
    ),

  async execute(interaction) {
    logger.info("SYNC_OSU", `Command started by ${interaction.user.tag}`);

    const testMode = interaction.options.getBoolean("test") || false;
    const qualifiedOnly = interaction.options.getBoolean("qualified") || false;
    const successLogs = [];
    const errorLogs = [];

    try {
      const sheets = getSheetsClient();

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheets.teamsSpreadsheetId,
        range: `${config.googleSheets.teamsTab}!A1:Z`,
      });

      const rows = res.data.values || [];
      if (rows.length < 2) {
        return interaction.editReply("The Teams sheet is empty.");
      }

      const members = await interaction.guild.members.fetch();
      const headers = rows[0];

      const getCol = (name) =>
        headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

      const filterCol = getCol("Filter?");
      const qualCol = getCol("qualified?");

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];

        if (filterCol !== -1 && row[filterCol] === "TRUE") continue;
        if (qualifiedOnly && qualCol !== -1 && row[qualCol] !== "TRUE")
          continue;

        for (let p = 1; p <= 8; p++) {
          const dTag =
            row[
              getCol(`P${p}Discord`) === -1
                ? getCol("Captain Discord")
                : getCol(`P${p}Discord`)
            ];
          const oId = row[getCol(`P${p}ID`)];

          if (!dTag || !oId) continue;

          const member = members.find(
            (m) => m.user.username.toLowerCase() === dTag.toLowerCase().trim(),
          );
          if (!member) {
            errorLogs.push(`❌ Not in Server: ${dTag}`);
            continue;
          }

          try {
            const osuUser = await osuService.getUser(oId);
            if (!osuUser) continue;

            if (member.displayName !== osuUser.username) {
              if (!testMode) {
                await member.setNickname(osuUser.username).catch(() => {});
              }
              successLogs.push(`[NICK] ${dTag} -> ${osuUser.username}`);
            }

            if (!member.roles.cache.has(config.discord.syncRoleId)) {
              if (!testMode) {
                await member.roles
                  .add(config.discord.syncRoleId)
                  .catch(() => {});
              }
              successLogs.push(`[ROLE] ${osuUser.username} added to Players`);
            }
          } catch (e) {
            errorLogs.push(`⚠️ API Error (${dTag}): ${e.message}`);
          }
        }
      }

      await interaction.editReply(
        `**Sync Complete ${testMode ? "(TEST)" : ""}**\nChanges: ${successLogs.length}\nErrors: ${errorLogs.length}`,
      );
      await sendChunkedLog(interaction, "SUCCESS LOG", successLogs);
      await sendChunkedLog(interaction, "ERROR LOG", errorLogs);
    } catch (err) {
      logger.error("SYNC_OSU", "Failed to sync osu details", err);
      await interaction.editReply(`Fatal Sync Error: ${err.message}`);
    }
  },
};
