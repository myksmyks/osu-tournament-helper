const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getDatabase } = require("../../database/db");
const { syncGoogleSheetsToDb } = require("../../services/syncSheets");
const ircService = require("../../services/ircService");
const logger = require("../../services/logger");
const { config } = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("monitor")
    .setDescription("Monitor osu! match for live updates across servers")
    .addStringOption((o) =>
      o.setName("id").setDescription("Match ID (e.g 1)").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    logger.info(
      "COMMAND",
      `Monitor command initialized for match ${interaction.options.getString("id")}...`,
    );
    await syncGoogleSheetsToDb();

    const matchId = interaction.options.getString("id");
    const db = await getDatabase();
    const match = await db.get("SELECT * FROM matches WHERE match_id = ?", [
      matchId,
    ]);

    if (!match) return interaction.editReply(`Match **${matchId}** not found.`);
    if (!match.mp_link)
      return interaction.editReply(`No MP Link found for **${matchId}**.`);

    const mpId = match.mp_link.split("/").pop();
    const teamRed = match.team_red || match.team_1 || "Red Team";
    const teamBlue = match.team_blue || "Blue Team";

    const channelIds = config.discord.resultChannelIds;

    const activeMessages = [];

    for (const id of channelIds) {
      try {
        const channel = await interaction.client.channels.fetch(id);
        if (channel) {
          const msg = await channel.send(
            `🛰️ **Match Monitor Started:** ${teamRed} vs ${teamBlue} (#${mpId})`,
          );
          activeMessages.push(msg);
        }
      } catch (err) {
        logger.error(
          "COMMAND",
          `Could not send monitor start message to channel ${id}`,
          err.message,
        );
      }
    }

    await interaction.editReply(
      `✅ Monitoring started. Updates are being sent to ${activeMessages.length} channels.`,
    );

    await ircService.monitorLobby(
      mpId,
      activeMessages,
      teamRed,
      teamBlue,
      matchId,
    );
  },
};
