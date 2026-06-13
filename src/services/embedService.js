const { EmbedBuilder } = require("discord.js");

function createMatchEmbed({
  stage,
  teamRed,
  teamBlue,
  scoreRed,
  scoreBlue,
  mpId = null,
  mpLink = null,
  status,
  nextPicker = "None",
  currentMapID = null,
  currentMapNameFull = "None",
  redBansFormatted = "_None_",
  blueBansFormatted = "_None_",
  history = [],
  isFinal = false,
  isForfeit = false,
  dbMatchId = null,
}) {
  const redWonMatch = scoreRed > scoreBlue;
  const blueWonMatch = scoreBlue > scoreRed;

  const displayScoreRed = isForfeit && scoreRed === -1 ? "FF" : scoreRed;
  const displayScoreBlue = isForfeit && scoreBlue === -1 ? "FF" : scoreBlue;

  const embed = new EmbedBuilder()
    .setTitle(
      `${isFinal || isForfeit ? "🏁" : "🏆"} ${stage}: ${teamRed} vs ${teamBlue}`,
    )
    .setColor(isFinal || isForfeit ? 0x2b2d31 : 0xff69b4)
    .setDescription(
      `# ${isFinal && redWonMatch ? "🥇 " : ""}${teamRed} ${displayScoreRed} — ${displayScoreBlue} ${teamBlue}${isFinal && blueWonMatch ? " 🥇" : ""}`,
    )
    .addFields(
      { name: "Status", value: `\`${status}\``, inline: true },
      {
        name: "Next Pick",
        value: isFinal || isForfeit ? "None" : `\`${nextPicker}\``,
        inline: true,
      },
      {
        name: "Current Map",
        value:
          isFinal || isForfeit
            ? "None"
            : currentMapID
              ? `[${currentMapNameFull}](https://osu.ppy.sh/b/${currentMapID})`
              : `\`Waiting...\``,
        inline: true,
      },
      {
        name: `🔴 ${teamRed} Bans`,
        value: redBansFormatted || "_None_",
        inline: true,
      },
      {
        name: `🔵 ${teamBlue} Bans`,
        value: blueBansFormatted || "_None_",
        inline: true,
      },
      { name: "\u200B", value: "\u200B", inline: true },
    )
    .setTimestamp();

  if (mpId) {
    embed.setURL(`https://osu.ppy.sh/mp/${mpId}`);
  } else if (mpLink) {
    embed.setURL(mpLink);
  }

  if (dbMatchId) {
    embed.setFooter({
      text: `Match ID: ${dbMatchId}${isForfeit ? " | Forfeit Recorded" : ""}`,
    });
  }

  if (isForfeit) {
    const winnerName = scoreRed > scoreBlue ? teamRed : teamBlue;
    const loserName = scoreRed > scoreBlue ? teamBlue : teamRed;
    embed.addFields({
      name: "Points History",
      value: `Match forfeited by **${loserName}**. **${winnerName}** wins the match.`,
      inline: false,
    });
  } else if (history.length === 0) {
    embed.addFields({
      name: "Points History",
      value: "_No maps played yet_",
      inline: false,
    });
  } else {
    const historyLines = history.map((m) => {
      const redWon = m.redScore > m.blueScore;
      const sRed = redWon
        ? `**${m.redScore.toLocaleString()}**`
        : m.redScore.toLocaleString();
      const sBlue = !redWon
        ? `**${m.blueScore.toLocaleString()}**`
        : m.blueScore.toLocaleString();
      const diff = Math.abs(m.redScore - m.blueScore).toLocaleString();

      const pickerLine = m.pickerNick ? `Pick: ${m.pickerNick} | ` : "";
      return `[${m.mod}] [${m.mapName}](https://osu.ppy.sh/b/${m.mapId})\n${pickerLine}🔴 ${sRed} - ${sBlue} 🔵 | (**+${diff}**)`;
    });

    let currentChunk = "";
    let fieldCount = 0;
    let totalEmbedChars = 0;

    for (const line of historyLines) {
      const lineWithBreak = line + "\n";
      if (
        (currentChunk + lineWithBreak).length > 1000 ||
        totalEmbedChars + lineWithBreak.length > 5200
      ) {
        embed.addFields({
          name: fieldCount === 0 ? "Points History" : "Points History (cont.)",
          value: currentChunk.trim(),
          inline: false,
        });
        totalEmbedChars += currentChunk.length;
        fieldCount++;
        currentChunk = lineWithBreak;
      } else {
        currentChunk += lineWithBreak;
      }
    }
    if (currentChunk) {
      embed.addFields({
        name: fieldCount === 0 ? "Points History" : "Points History (cont.)",
        value: currentChunk.trim(),
        inline: false,
      });
    }
  }

  return embed;
}

module.exports = { createMatchEmbed };
