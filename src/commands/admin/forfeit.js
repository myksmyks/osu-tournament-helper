const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getDatabase } = require("../../database/db");
const syncSheets = require("../../services/syncSheets");
const { updateChallongeMatch } = require("../../services/challongeService");
const { createMatchEmbed } = require("../../services/embedService");
const logger = require("../../services/logger");
const { config } = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("forfeit")
    .setDescription("Record a match forfeit with automatic score detection")
    .addStringOption((o) =>
      o.setName("id").setDescription("Match ID (e.g. 17)").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("loser")
        .setDescription("Which team forfeited?")
        .setRequired(true)
        .addChoices(
          { name: "Red Team", value: "Red" },
          { name: "Blue Team", value: "Blue" },
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const matchId = interaction.options.getString("id");
    const loserSide = interaction.options.getString("loser");

    logger.info(
      "FORFEIT",
      `Recording forfeit for Match ID ${matchId} by ${loserSide} side.`,
    );

    const db = await getDatabase();
    const match = await db.get("SELECT * FROM matches WHERE match_id = ?", [
      matchId,
    ]);

    if (!match) {
      return interaction.editReply(`❌ Match **${matchId}** not found.`);
    }

    const winnerScore = await syncSheets.getFirstToValue(match.stage);

    const teamRed = match.team_red || match.team_1 || "Red Team";
    const teamBlue = match.team_blue || "Blue Team";

    const redScore = loserSide === "Red" ? -1 : winnerScore;
    const blueScore = loserSide === "Blue" ? -1 : winnerScore;

    const winnerName = loserSide === "Red" ? teamBlue : teamRed;

    const embed = createMatchEmbed({
      stage: match.stage,
      teamRed,
      teamBlue,
      scoreRed: redScore,
      scoreBlue: blueScore,
      mpLink: match.mp_link,
      status: "🏁 Forfeited",
      isForfeit: true,
      isFinal: true,
      dbMatchId: matchId,
    });

    const channelIds = config.discord.resultChannelIds;

    for (const id of channelIds) {
      try {
        const chan = await interaction.client.channels.fetch(id);
        if (chan) {
          await chan.send({ embeds: [embed] });
        }
      } catch (e) {
        logger.error(
          "FORFEIT",
          `Failed to broadcast forfeit embed to channel ${id}`,
          e.message,
        );
      }
    }

    await updateChallongeMatch(
      teamRed,
      teamBlue,
      redScore,
      blueScore,
      loserSide === "Red" ? "Blue" : "Red",
    );

    await interaction.editReply(
      `✅ Forfeit recorded. **${winnerName}** won **${winnerScore}-FF**.`,
    );
  },
};
