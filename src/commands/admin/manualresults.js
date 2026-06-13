const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const ircService = require("../../services/ircService");
const { getDatabase } = require("../../database/db");
const logger = require("../../services/logger");
const { config } = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("manualresult")
    .setDescription("Generate result embed using existing IrcService logic")
    .addStringOption((o) =>
      o.setName("id").setDescription("Match ID").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const matchId = interaction.options.getString("id");
    logger.info("COMMAND", `Manual result requested for Match ID ${matchId}`);

    const db = await getDatabase();
    const match = await db.get("SELECT * FROM matches WHERE match_id = ?", [
      matchId,
    ]);
    if (!match?.mp_link) {
      return interaction.editReply("❌ Match not found or no MP link.");
    }

    const mpId = match.mp_link.split("/").pop();
    const channelIds = config.discord.resultChannelIds;
    const messages = [];

    for (const id of channelIds) {
      try {
        const chan = await interaction.client.channels.fetch(id);
        if (chan) {
          const sentMsg = await chan.send(
            `🛰️ **Generating manual result for Match ${matchId}...**`,
          );
          messages.push(sentMsg);
        }
      } catch (e) {
        logger.error(
          "COMMAND",
          `Failed to send placeholder message to channel ${id}`,
          e.message,
        );
      }
    }

    try {
      await ircService.processManualMatch(mpId, matchId, messages);
      await interaction.editReply(
        `✅ Manual result processed for Match ${matchId}.`,
      );
    } catch (err) {
      logger.error(
        "COMMAND",
        `Manual result process failed for Match ${matchId}`,
        err,
      );
      await interaction.editReply(
        `❌ Failed to process manual result: ${err.message}`,
      );
    }
  },
};
