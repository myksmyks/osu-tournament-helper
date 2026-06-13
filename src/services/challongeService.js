const axios = require("axios");
const { config } = require("../config");
const logger = require("./logger");

async function updateChallongeMatch(
  teamRed,
  teamBlue,
  scoreRed,
  scoreBlue,
  forcedWinnerSide = null,
) {
  const apiKey = process.env.CHALLONGE_API;
  const tournament = config.challonge.tournamentId;

  if (!apiKey || !tournament) {
    logger.warn(
      "CHALLONGE",
      "API key or Tournament ID is not configured. Skipping update.",
    );
    return;
  }

  try {
    logger.info(
      "CHALLONGE",
      `Syncing match bracket: ${teamRed} vs ${teamBlue}...`,
    );

    const [{ data: matches }, { data: participants }] = await Promise.all([
      axios.get(
        `https://api.challonge.com/v1/tournaments/${tournament}/matches.json?api_key=${apiKey}&state=open`,
      ),
      axios.get(
        `https://api.challonge.com/v1/tournaments/${tournament}/participants.json?api_key=${apiKey}`,
      ),
    ]);

    const p1 = participants.find(
      (p) =>
        p.participant.name.toLowerCase().trim() ===
        teamRed.toLowerCase().trim(),
    );
    const p2 = participants.find(
      (p) =>
        p.participant.name.toLowerCase().trim() ===
        teamBlue.toLowerCase().trim(),
    );

    const matchToUpdate = matches.find(
      (m) =>
        (m.match.player1_id === p1?.participant.id &&
          m.match.player2_id === p2?.participant.id) ||
        (m.match.player1_id === p2?.participant.id &&
          m.match.player2_id === p1?.participant.id),
    );

    if (!matchToUpdate) {
      logger.warn(
        "CHALLONGE",
        `Match not found on Challonge for teams: ${teamRed} vs ${teamBlue}`,
      );
      return;
    }

    const isPlayer1Red = matchToUpdate.match.player1_id === p1.participant.id;
    const scoreStr = isPlayer1Red
      ? `${scoreRed}-${scoreBlue}`
      : `${scoreBlue}-${scoreRed}`;

    let winnerId;
    if (forcedWinnerSide) {
      winnerId =
        forcedWinnerSide === "Red" ? p1.participant.id : p2.participant.id;
    } else {
      winnerId = scoreRed > scoreBlue ? p1.participant.id : p2.participant.id;
    }

    await axios.put(
      `https://api.challonge.com/v1/tournaments/${tournament}/matches/${matchToUpdate.match.id}.json?api_key=${apiKey}`,
      {
        match: { scores_csv: scoreStr, winner_id: winnerId },
      },
    );
    logger.info(
      "CHALLONGE",
      `Successfully updated Challonge match ${matchToUpdate.match.id}`,
    );
  } catch (err) {
    logger.error("CHALLONGE", `Failed to update match score: ${err.message}`);
  }
}

module.exports = { updateChallongeMatch };
