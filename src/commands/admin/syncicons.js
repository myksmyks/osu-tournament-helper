const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getSheetsClient } = require("../../services/googleSheetsService");
const axios = require("axios");
const FormData = require("form-data");
const osuService = require("../../services/osuService");
const { config } = require("../../config");
const logger = require("../../services/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("syncicons")
    .setDescription("Upload qualified player icons to site")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((o) => o.setName("test").setDescription("Dry run")),

  async execute(interaction) {
    logger.info("SYNC_ICONS", `Command triggered by ${interaction.user.tag}`);
    const testMode = interaction.options.getBoolean("test") || false;

    try {
      const sheets = getSheetsClient();

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheets.teamsSpreadsheetId,
        range: `${config.googleSheets.teamsTab}!A1:Z`,
      });

      const rows = res.data.values || [];
      const headers = rows[0];
      const qualCol = headers.findIndex((h) =>
        h.toLowerCase().includes("qualified?"),
      );
      const p1IdCol = headers.findIndex((h) =>
        h.toLowerCase().includes("p1id"),
      );

      let count = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[qualCol] !== "TRUE" || !row[p1IdCol]) continue;

        const osuId = row[p1IdCol];
        try {
          const osuUser = await osuService.getUser(osuId);
          if (!osuUser) continue;

          if (testMode) {
            logger.info(
              "SYNC_ICONS",
              `[DRY-RUN] Would upload icon for ${osuUser.username}`,
            );
            count++;
            continue;
          }

          const img = await axios.get(`https://a.ppy.sh/${osuId}`, {
            responseType: "arraybuffer",
          });
          const form = new FormData();
          form.append("file[]", Buffer.from(img.data), {
            filename: `${osuUser.username}.jpg`,
          });
          form.append("folder", "ICONS");

          await axios.post(
            `${process.env.ICON_UPLOAD_URL || process.env.url}/index.php?api=upload_icon`,
            form,
            {
              headers: {
                ...form.getHeaders(),
                "X-Api-Key":
                  process.env.ICON_UPLOAD_API_KEY || process.env.api,
              },
            },
          );
          count++;
        } catch (e) {
          logger.error(
            "SYNC_ICONS",
            `Failed to sync icon for OSU ID ${osuId}`,
            e.message,
          );
        }
      }
      await interaction.editReply(
        `✅ Sync complete. ${testMode ? "Would upload" : "Uploaded"} ${count} icons.`,
      );
    } catch (err) {
      logger.error("SYNC_ICONS", "Sync process encountered a fatal error", err);
      await interaction.editReply(`❌ Sync failed: ${err.message}`);
    }
  },
};
