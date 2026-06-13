const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { syncGoogleSheetsToDb } = require("../../services/syncSheets");
const logger = require("../../services/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("update_matches")
    .setDescription("Force sync Google Sheet to Bot Database")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    logger.info(
      "COMMAND",
      `Forced Google Sheet sync initiated by ${interaction.user.tag}`,
    );
    const result = await syncGoogleSheetsToDb();

    if (result.success) {
      await interaction.editReply(
        `✅ Database Updated.\n- Qualifiers: ${result.qCount}\n- Bracket: ${result.cCount}`,
      );
    } else {
      await interaction.editReply(`❌ Sync failed: ${result.error}`);
    }
  },
};
