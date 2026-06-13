const { SlashCommandBuilder } = require("discord.js");
const crypto = require("crypto");
const osuService = require("../../services/osuService");
const ircService = require("../../services/ircService");
const { getDatabase } = require("../../database/db");
const logger = require("../../services/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("osuset")
    .setDescription("Link your osu! account")
    .addStringOption((o) =>
      o.setName("username").setDescription("osu! username").setRequired(true),
    ),

  async execute(interaction) {
    logger.info("COMMAND", `osuset triggered by ${interaction.user.tag}`);

    const db = await getDatabase();
    const username = interaction.options.getString("username");
    const discordId = interaction.user.id;

    const existingUser = await db.get(
      "SELECT * FROM users WHERE discord_id = ?",
      [discordId],
    );

    if (existingUser && existingUser.is_verified === 1) {
      logger.info(
        "COMMAND",
        `Blocked verified user ${interaction.user.tag} from changing link.`,
      );
      return interaction.editReply({
        content: `You are already verified as **${existingUser.osu_username}**! ✅\nIf you wish to change your linked account, please contact **myksmyks@KELTournaments**.`,
      });
    }

    const user = await osuService.getUser(username);
    if (!user) {
      logger.warn("COMMAND", `User ${username} not found on osu! API.`);
      return interaction.editReply("User not found on osu!.");
    }

    const code = crypto.randomBytes(4).toString("hex");
    logger.info(
      "COMMAND",
      `Generated verification code for ${user.username}. Saving...`,
    );

    await db.run(
      "INSERT OR REPLACE INTO users (discord_id, osu_username, verification_code, is_verified) VALUES (?, ?, ?, 0)",
      [discordId, user.username, code],
    );

    logger.info("COMMAND", `Passing to IRC to message ${user.username}`);
    await ircService.sendMessage(
      user.username,
      `Code: ${code}. Use /verifyosu in Discord.`,
    );

    await interaction.editReply(
      `Sent code to **${user.username}** in-game. Check your messages and run \`/verifyosu code\`.`,
    );
  },
};
