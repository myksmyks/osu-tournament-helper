const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { config } = require("../../config");
const { getDatabase } = require("../../database/db");
const ircService = require("../../services/ircService");
const logger = require("../../services/logger");
const { syncGoogleSheetsToDb } = require("../../services/syncSheets");

async function startMonitor(interaction, matchId) {
  await syncGoogleSheetsToDb();

  const db = await getDatabase();
  const match = await db.get("SELECT * FROM matches WHERE match_id = ?", [
    matchId,
  ]);

  if (!match) return interaction.editReply(`Match **${matchId}** not found.`);
  if (!match.mp_link) {
    return interaction.editReply(`No MP Link found for **${matchId}**.`);
  }
  if (ircService.getLobbyByMatchId(matchId)) {
    return interaction.editReply(
      `Match **${matchId}** is already being monitored.`,
    );
  }

  const mpId = match.mp_link.split("/").pop();
  const teamRed = match.team_red || match.team_1 || "Red Team";
  const teamBlue = match.team_blue || "Blue Team";
  const activeMessages = [];

  for (const channelId of config.discord.resultChannelIds) {
    try {
      const channel = await interaction.client.channels.fetch(channelId);
      if (!channel) continue;
      const message = await channel.send(
        `🛰️ **Match Monitor Started:** ${teamRed} vs ${teamBlue} (#${mpId})`,
      );
      activeMessages.push(message);
    } catch (error) {
      logger.error(
        "COMMAND",
        `Could not send monitor start message to channel ${channelId}`,
        error.message,
      );
    }
  }

  if (activeMessages.length === 0) {
    return interaction.editReply(
      "Monitoring was not started because no result messages could be created.",
    );
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
}

async function resumeMonitor(interaction, matchId) {
  if (ircService.getLobbyByMatchId(matchId)) {
    return interaction.editReply(
      `Match **${matchId}** is already being monitored.`,
    );
  }

  const savedSession = await ircService.getSavedMonitorSession(matchId);
  if (!savedSession) {
    return interaction.editReply(
      `No saved monitor session found for Match **${matchId}**.`,
    );
  }

  const messages = await ircService.restoreDiscordMessages(
    interaction.client,
    savedSession.messages,
  );
  if (messages.length === 0) {
    return interaction.editReply(
      `Could not restore any result messages for Match **${matchId}**.`,
    );
  }

  let recovery;
  try {
    recovery = await ircService.recoverSavedMonitorSession(savedSession);
  } catch (error) {
    logger.error(
      "COMMAND",
      `Missed-map recovery failed for Match ${matchId}`,
      error,
    );
    recovery = {
      state: savedSession.state,
      recoveredCount: 0,
      warning: "an unexpected recovery error occurred",
    };
  }

  const recoveryMessage = recovery.warning
    ? ` Recovery warning: ${recovery.warning}.`
    : recovery.recoveredCount > 0
      ? ` Recovered **${recovery.recoveredCount}** completed map(s).`
      : " No completed maps were missed.";
  await interaction.editReply(
    `Resuming Match **${matchId}** from the last saved checkpoint.${recoveryMessage}`,
  );
  await ircService.monitorLobby(
    savedSession.mpId,
    messages,
    recovery.state.teamRed,
    recovery.state.teamBlue,
    matchId,
    {
      isResume: true,
      restoredState: recovery.state,
    },
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("monitor")
    .setDescription("Start or resume osu! match monitoring")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Start monitoring a match")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("Match ID (e.g. 1)")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("resume")
        .setDescription("Resume monitoring after a bot restart")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("Match ID (e.g. 1)")
            .setRequired(true),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const action = interaction.options.getSubcommand();
    const matchId = interaction.options.getString("id");
    logger.info(
      "COMMAND",
      `Monitor ${action} initialized for match ${matchId}.`,
    );

    if (action === "resume") {
      return resumeMonitor(interaction, matchId);
    }
    return startMonitor(interaction, matchId);
  },
};
