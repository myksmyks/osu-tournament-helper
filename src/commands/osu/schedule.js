const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getDatabase } = require("../../database/db");
const { cleanDateString } = require("../../utils/textUtils");
const moment = require("moment-timezone");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("View the schedule of upcoming matches"),

  async execute(interaction) {
    const db = await getDatabase();
    const upcomingmatches = [];
    const matches = await db.all("SELECT * FROM matches");

    for (const m of matches) {
      const cleanDate = cleanDateString(m.date);
      const matchTime = moment.tz(
        `${cleanDate} ${m.time} ${moment().year()}`,
        "MMM D HH:mm YYYY",
        "UTC",
      );
      m.matchTime = matchTime;
      if (matchTime.isAfter(moment()) && m.stage !== "Qualifiers") {
        upcomingmatches.push(m);
      }
    }
    if (upcomingmatches.length === 0) {
      return interaction.editReply("No upcoming matches.");
    }
    const nextfour = upcomingmatches.slice(0, 4);

    const embed = new EmbedBuilder()
      .setColor("#FFFFFF")
      .setTitle("Match Schedule");

    for (const x of nextfour) {
      const unixSeconds = Math.floor(x.matchTime.valueOf() / 1000);
      embed.addFields({
        name: `Match ID ${x.match_id} **|** ${x.team_red || "TBD"} **VS.** ${x.team_blue || "TBD"}`,
        value: `**${x.stage}** **|** ${x.date} ${x.time} **|** Upcoming: <t:${unixSeconds}:R>`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
