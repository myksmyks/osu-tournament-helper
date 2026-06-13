const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const ircService = require("../../services/ircService");
const logger = require("../../services/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("editscore")
    .setDescription("Edit a map score or add a missing one")
    .addStringOption((o) =>
      o.setName("id").setDescription("Match ID").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("mod").setDescription("Mod (e.g. NM2)").setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName("red").setDescription("Red Score").setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName("blue").setDescription("Blue Score").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const matchId = interaction.options.getString("id");
    const mod = interaction.options.getString("mod").toUpperCase();
    const red = interaction.options.getInteger("red");
    const blue = interaction.options.getInteger("blue");

    const mpId = ircService.getLobbyByMatchId(matchId);
    if (!mpId) {
      return interaction.editReply("❌ Match not active.");
    }

    try {
      await ircService.editMapScore(mpId, mod, red, blue);
      await interaction.editReply(
        `✅ Updated **${mod}** to **${red.toLocaleString()} - ${blue.toLocaleString()}**. Tally recalculated.`,
      );
    } catch (e) {
      logger.error("COMMAND", `Failed to edit score for match ${matchId}`, e);
      await interaction.editReply(`❌ Error: ${e.message}`);
    }
  },
};
