const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const ircService = require("../../services/ircService");
const logger = require("../../services/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("forcefinalize")
    .setDescription("Stop monitoring and finalize a match immediately")
    .addStringOption((o) =>
      o.setName("id").setDescription("Match ID (e.g. 13)").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const matchId = interaction.options.getString("id");
    const mpId = ircService.getLobbyByMatchId(matchId);

    if (!mpId) {
      return interaction.editReply(
        `❌ Match **${matchId}** is not currently being monitored by the bot.`,
      );
    }

    try {
      await ircService.finalizeMatch(mpId);
      await interaction.editReply(
        `✅ Match **${matchId}** forced to final state. Monitoring stopped and Challonge updated.`,
      );
    } catch (error) {
      logger.error(
        "COMMAND",
        `Force finalize failed for Match ID ${matchId}`,
        error,
      );
      await interaction.editReply(
        `❌ Failed to finalize match. Check console.`,
      );
    }
  },
};
