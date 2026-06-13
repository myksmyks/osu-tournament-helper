const { SlashCommandBuilder } = require("discord.js");
const { getDatabase } = require("../../database/db");
const logger = require("../../services/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verifyosu")
    .setDescription("Verify your code")
    .addStringOption((o) =>
      o.setName("code").setDescription("Code from Bancho").setRequired(true),
    ),

  async execute(interaction) {
    const db = await getDatabase();
    const code = interaction.options.getString("code");

    const row = await db.get("SELECT * FROM users WHERE discord_id = ?", [
      interaction.user.id,
    ]);
    if (!row || row.verification_code !== code) {
      return interaction.editReply("Incorrect code.");
    }

    await db.run(
      "UPDATE users SET is_verified = 1, verification_code = NULL WHERE discord_id = ?",
      [interaction.user.id],
    );
    await interaction.editReply(`Verified as **${row.osu_username}**!`);
    logger.info(
      "VERIFICATION",
      `User ${interaction.user.tag} verified as ${row.osu_username}.`,
    );
  },
};
