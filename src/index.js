require("dotenv").config();
const {
  config,
  getFeatureConfigurationWarnings,
  validateStartupConfiguration,
} = require("./config");

try {
  validateStartupConfiguration(config);
} catch (error) {
  console.error(`[CONFIG] ${error.message}`);
  process.exitCode = 1;
  return;
}

const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { getDatabase } = require("./database/db");
const { runReminders, availability } = require("./services/matchService");
const ircService = require("./services/ircService");
const cron = require("node-cron");
const { syncGoogleSheetsToDb } = require("./services/syncSheets");
const logger = require("./services/logger");
const express = require("express");
const {
  handleGuildMemberAdd,
  handleVerificationInteraction,
} = require("./events/verificationEvents");

for (const warning of getFeatureConfigurationWarnings(config)) {
  logger.warn("CONFIG", warning);
}

const client = new Client({
  intents: [3276799 | GatewayIntentBits.GuildMembers],
});
client.commands = new Collection();
client.reminderChannels = new Map();

const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const folders = fs.readdirSync(commandsPath);
  for (const folder of folders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      const cmd = require(path.join(folderPath, file));
      client.commands.set(cmd.data.name, cmd);
    }
  }
} else {
  logger.warn("SYSTEM", "Commands directory not found.");
}

async function deploy() {
  const rest = new REST().setToken(process.env.TOKEN);
  const body = client.commands.map((c) => c.data.toJSON());

  try {
    await rest.put(Routes.applicationCommands(config.discord.applicationId), {
      body,
    });
    logger.info("SYSTEM", "Successfully deployed commands globally.");
  } catch (e) {
    logger.error("SYSTEM", "Failed to deploy commands globally", e);
  }
}

client.once("ready", () => {
  initializeBot().catch((error) => {
    logger.error("SYSTEM", "Bot initialization failed", error);
    process.exitCode = 1;
    client.destroy();
  });
});

async function initializeBot() {
  await getDatabase();
  await deploy();
  await ircService.connect();
  logger.info("SYSTEM", `${client.user.tag} is ONLINE.`);

  setInterval(() => {
    runReminders(client).catch((error) => {
      logger.error("REMINDERS", "Reminder cycle failed", error);
    });
  }, config.schedules.reminderIntervalMs);

  cron.schedule(
    config.schedules.sheetSyncCron,
    async () => {
      logger.info("CRON", "Running automated Google Sheets sync...");
      await syncGoogleSheetsToDb();
    },
    { timezone: config.schedules.timezone },
  );

  cron.schedule(
    config.schedules.availabilityCron,
    async () => {
      logger.info("CRON", "Running weekly availability ping scheduler...");
      try {
        await availability(client);
      } catch (error) {
        logger.error("CRON", "Weekly availability scheduler failed", error);
      }
    },
    {
      timezone: config.schedules.timezone,
    },
  );
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (await handleVerificationInteraction(interaction)) return;
  } catch (error) {
    logger.error("VERIFICATION", "Verification interaction failed", error);
    const response = {
      content: "Verification could not be completed. Please try again.",
      ephemeral: true,
    };
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(response).catch(() => {});
    } else {
      await interaction.editReply(response).catch(() => {});
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  const startMark = Date.now();
  try {
    await interaction.deferReply();
    logger.debug(
      "SYSTEM",
      `Deferred interaction for /${interaction.commandName} in ${Date.now() - startMark}ms`,
    );

    if (interaction.commandName === "startreminders") {
      client.reminderChannels.set(interaction.guildId, interaction.channelId);
    }

    await cmd.execute(interaction);
  } catch (error) {
    logger.error(
      "SYSTEM",
      `Error executing /${interaction.commandName}`,
      error,
    );

    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "Error!", flags: [64] })
        .catch(() => {});
    } else {
      await interaction.editReply("Error!").catch(() => {});
    }
  }
});

client.on("guildMemberAdd", handleGuildMemberAdd);

const app = express();
const port = Number(process.env.HEALTH_PORT || 3000);

app.get("/health", (_req, res) => {
  const isReady = client.isReady?.() ?? false;
  let databaseStatus = "ok";
  try {
    const db = await getDatabase();
    await db.get("SELECT COUNT(*) AS count FROM users");
  } catch (err) {
    databaseStatus = "error";
  }

  res.status.at(isReady ? 200 : 503).json({
    status: isReady ? "ok" : "degraded",
    discord: isReady ? "ready" : "not_ready",
    database: databaseStatus,
    Bot_Ping: client.ws.ping,
    uptime: Math.floor(process.uptime()),
    checkedAt: new Date().toISOString(),
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Health endpoint listening on port ${port}`);
});

client.login(process.env.TOKEN).catch((error) => {
  logger.error("SYSTEM", "Discord login failed", error);
  process.exitCode = 1;
});
