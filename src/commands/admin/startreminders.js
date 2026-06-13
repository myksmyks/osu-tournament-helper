const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const logger = require("../../services/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("startreminders")
    .setDescription("Enable pings in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    interaction.client.reminderChannels.set(
      interaction.guildId,
      interaction.channelId,
    );
    logger.info(
      "COMMAND",
      `Reminders enabled for channel ${interaction.channelId} in guild ${interaction.guildId}`,
    );
    await interaction.editReply("✅ Reminders active for this channel.");
  },
};
