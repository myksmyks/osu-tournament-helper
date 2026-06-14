const fs = require("fs");
const path = require("path");
const { validateColumnMapping } = require("./utils/sheetColumns");

const PROJECT_ROOT = path.join(__dirname, "..");
const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");

const DEFAULT_CONFIG = {
  discord: {
    applicationId: "",
    resultChannelIds: [],
    streamerCommsChannelId: "",
    commsChannelId: "",
    syncRoleId: "",
    welcomeChannelId: "",
    verifiedRoleId: "",
    availability: {
      streamers: { channelId: "", roleId: "" },
      referees: { channelId: "", roleId: "" },
      commentators: { channelId: "", roleId: "" },
    },
  },
  googleSheets: {
    tournamentSpreadsheetId: "",
    qualifierTab: "Qualifiers",
    bracketTab: "Bracket",
    mappoolTab: "Mappool",
    roundSetupTab: "Round Setup",
    teamsSpreadsheetId: "",
    teamsTab: "Teams",
    sheetColumns: {
      qualifiers: {
        matchId: "B",
        date: "C",
        time: "D",
        referee: "E",
        team1: "I",
      },
      bracket: {
        matchId: "C",
        stage: "D",
        date: "F",
        time: "G",
        referee: "H",
        teamRed: "J",
        scoreRed: "K",
        scoreBlue: "L",
        teamBlue: "M",
        streamer: "O",
        caster1: "P",
        caster2: "Q",
        mpLink: "S",
      },
      mappool: {
        stage: "B",
        modId: "C",
        mapsetId: "D",
        mapId: "E",
        category: "F",
      },
      liveMatch: {
        ban: "H",
        decision: "S",
      },
      roundSetup: {
        stage: "G",
        firstTo: "Z",
      },
    },
    sheetRows: {
      qualifiers: {
        firstDataRow: 4,
      },
      bracket: {
        firstDataRow: 3,
      },
      mappool: {
        firstDataRow: 7,
      },
      liveMatch: {
        banRows: [9, 10, 11, 12],
        firstBanSideRow: 12,
        firstPickerRow: 13,
      },
      roundSetup: {
        firstStageRow: 5,
        lastStageRow: 13,
      },
    },
  },
  challonge: {
    tournamentId: "",
  },
  runtime: {
    databasePath: "./bot.db",
    logLevel: "INFO",
  },
  schedules: {
    reminderIntervalMs: 60000,
    sheetSyncCron: "*/5 * * * *",
    availabilityCron: "0 0 * * 5",
    timezone: "UTC",
  },
};

const REQUIRED_ENV_VARS = [
  "TOKEN",
  "OSU_IRC_USERNAME",
  "OSU_IRC_PASSWORD",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(defaults, provided) {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(provided || {})) {
    if (isObject(value) && isObject(defaults[key])) {
      result[key] = mergeConfig(defaults[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function preferConfig(value, legacyValue) {
  if (Array.isArray(value)) {
    const configured = value.filter(Boolean);
    return configured.length > 0 ? configured : legacyValue;
  }
  return value !== undefined && value !== null && value !== ""
    ? value
    : legacyValue;
}

function getConfiguredValue(candidate, pathSegments) {
  return pathSegments.reduce(
    (value, segment) =>
      value && typeof value === "object" ? value[segment] : undefined,
    candidate,
  );
}

function preferProvidedConfig(
  providedConfig,
  pathSegments,
  defaultValue,
  legacyValue,
) {
  return preferConfig(
    getConfiguredValue(providedConfig, pathSegments),
    preferConfig(legacyValue, defaultValue),
  );
}

function applyLegacyEnvFallbacks(loadedConfig, providedConfig, env) {
  const legacyResultChannels = [
    env.CHANNEL_ID_SERVER_A,
    env.CHANNEL_ID_SERVER_B,
  ].filter(Boolean);

  loadedConfig.discord.applicationId = preferProvidedConfig(
    providedConfig,
    ["discord", "applicationId"],
    loadedConfig.discord.applicationId,
    env.CLIENT_ID || "",
  );
  loadedConfig.discord.resultChannelIds = preferProvidedConfig(
    providedConfig,
    ["discord", "resultChannelIds"],
    loadedConfig.discord.resultChannelIds,
    legacyResultChannels,
  );
  loadedConfig.discord.streamerCommsChannelId = preferProvidedConfig(
    providedConfig,
    ["discord", "streamerCommsChannelId"],
    loadedConfig.discord.streamerCommsChannelId,
    env.STREAMER_COMMS_CHANNEL_ID || "",
  );
  loadedConfig.discord.commsChannelId = preferProvidedConfig(
    providedConfig,
    ["discord", "commsChannelId"],
    loadedConfig.discord.commsChannelId,
    env.COMMS_CHANNEL_ID || "",
  );
  loadedConfig.discord.syncRoleId = preferProvidedConfig(
    providedConfig,
    ["discord", "syncRoleId"],
    loadedConfig.discord.syncRoleId,
    env.SYNC_ROLE_ID || "",
  );
  loadedConfig.discord.welcomeChannelId = preferProvidedConfig(
    providedConfig,
    ["discord", "welcomeChannelId"],
    loadedConfig.discord.welcomeChannelId,
    env.WELCOME_CHANNEL_ID || "",
  );
  loadedConfig.discord.verifiedRoleId = preferProvidedConfig(
    providedConfig,
    ["discord", "verifiedRoleId"],
    loadedConfig.discord.verifiedRoleId,
    env.VERIFIED_ROLE_ID || "",
  );

  const availability = loadedConfig.discord.availability;
  availability.streamers.channelId = preferProvidedConfig(
    providedConfig,
    ["discord", "availability", "streamers", "channelId"],
    availability.streamers.channelId,
    env.STREAMCHAN || "",
  );
  availability.streamers.roleId = preferProvidedConfig(
    providedConfig,
    ["discord", "availability", "streamers", "roleId"],
    availability.streamers.roleId,
    env.STREAMERROLE || "",
  );
  availability.referees.channelId = preferProvidedConfig(
    providedConfig,
    ["discord", "availability", "referees", "channelId"],
    availability.referees.channelId,
    env.REFCHAN || "",
  );
  availability.referees.roleId = preferProvidedConfig(
    providedConfig,
    ["discord", "availability", "referees", "roleId"],
    availability.referees.roleId,
    env.REFROLE || "",
  );
  availability.commentators.channelId = preferProvidedConfig(
    providedConfig,
    ["discord", "availability", "commentators", "channelId"],
    availability.commentators.channelId,
    env.COMMSCHAN || "",
  );
  availability.commentators.roleId = preferProvidedConfig(
    providedConfig,
    ["discord", "availability", "commentators", "roleId"],
    availability.commentators.roleId,
    env.COMMSROLE || "",
  );

  const sheets = loadedConfig.googleSheets;
  sheets.tournamentSpreadsheetId = preferProvidedConfig(
    providedConfig,
    ["googleSheets", "tournamentSpreadsheetId"],
    sheets.tournamentSpreadsheetId,
    env.GOOGLE_SHEET_ID || "",
  );
  sheets.qualifierTab = preferProvidedConfig(
    providedConfig,
    ["googleSheets", "qualifierTab"],
    sheets.qualifierTab,
    env.GOOGLE_SHEET_NAME || "",
  );
  sheets.bracketTab = preferProvidedConfig(
    providedConfig,
    ["googleSheets", "bracketTab"],
    sheets.bracketTab,
    env.GOOGLE_SHEET_NAME2 || "",
  );
  sheets.teamsSpreadsheetId = preferProvidedConfig(
    providedConfig,
    ["googleSheets", "teamsSpreadsheetId"],
    sheets.teamsSpreadsheetId,
    env.GOOGLE_SHEET_TEAMS_ID || "",
  );
  sheets.teamsTab = preferProvidedConfig(
    providedConfig,
    ["googleSheets", "teamsTab"],
    sheets.teamsTab,
    env.GOOGLE_SHEET_TEAMS_TAB || "",
  );

  loadedConfig.challonge.tournamentId = preferProvidedConfig(
    providedConfig,
    ["challonge", "tournamentId"],
    loadedConfig.challonge.tournamentId,
    env.TOURNAMENT || "",
  );
  loadedConfig.runtime.databasePath = preferProvidedConfig(
    providedConfig,
    ["runtime", "databasePath"],
    loadedConfig.runtime.databasePath,
    env.DATABASE_PATH || "",
  );
  loadedConfig.runtime.logLevel = preferProvidedConfig(
    providedConfig,
    ["runtime", "logLevel"],
    loadedConfig.runtime.logLevel,
    env.LOG_LEVEL || "",
  );

  return loadedConfig;
}

function validateConfigShape(candidate) {
  const expectedObjects = [
    ["discord", candidate.discord],
    ["discord.availability", candidate.discord?.availability],
    ["googleSheets", candidate.googleSheets],
    ["challonge", candidate.challonge],
    ["runtime", candidate.runtime],
    ["schedules", candidate.schedules],
  ];

  for (const [name, value] of expectedObjects) {
    if (!isObject(value)) {
      throw new Error(`config.json field "${name}" must be an object.`);
    }
  }

  if (!Array.isArray(candidate.discord.resultChannelIds)) {
    throw new Error(
      'config.json field "discord.resultChannelIds" must be an array.',
    );
  }
  if (
    !Number.isInteger(candidate.schedules.reminderIntervalMs) ||
    candidate.schedules.reminderIntervalMs <= 0
  ) {
    throw new Error(
      'config.json field "schedules.reminderIntervalMs" must be a positive integer.',
    );
  }

  const sheetColumns = candidate.googleSheets.sheetColumns;
  const columnRequirements = {
    qualifiers: ["matchId", "date", "time", "referee", "team1"],
    bracket: [
      "matchId",
      "stage",
      "date",
      "time",
      "referee",
      "teamRed",
      "scoreRed",
      "scoreBlue",
      "teamBlue",
      "streamer",
      "caster1",
      "caster2",
      "mpLink",
    ],
    mappool: ["stage", "modId", "mapsetId", "mapId", "category"],
    liveMatch: ["ban", "decision"],
    roundSetup: ["stage", "firstTo"],
  };

  if (!isObject(sheetColumns)) {
    throw new Error(
      'config.json field "googleSheets.sheetColumns" must be an object.',
    );
  }
  for (const [layout, requiredFields] of Object.entries(columnRequirements)) {
    validateColumnMapping(
      sheetColumns[layout],
      `googleSheets.sheetColumns.${layout}`,
      requiredFields,
    );
  }

  const sheetRows = candidate.googleSheets.sheetRows;
  const rowGroups = ["qualifiers", "bracket", "mappool", "liveMatch", "roundSetup"];
  if (!isObject(sheetRows)) {
    throw new Error(
      'config.json field "googleSheets.sheetRows" must be an object.',
    );
  }
  for (const group of rowGroups) {
    if (!isObject(sheetRows[group])) {
      throw new Error(
        `config.json field "googleSheets.sheetRows.${group}" must be an object.`,
      );
    }
  }

  const requiredPositiveRows = [
    ["qualifiers.firstDataRow", sheetRows.qualifiers.firstDataRow],
    ["bracket.firstDataRow", sheetRows.bracket.firstDataRow],
    ["mappool.firstDataRow", sheetRows.mappool.firstDataRow],
    ["liveMatch.firstBanSideRow", sheetRows.liveMatch.firstBanSideRow],
    ["liveMatch.firstPickerRow", sheetRows.liveMatch.firstPickerRow],
    ["roundSetup.firstStageRow", sheetRows.roundSetup.firstStageRow],
    ["roundSetup.lastStageRow", sheetRows.roundSetup.lastStageRow],
  ];
  for (const [field, rowNumber] of requiredPositiveRows) {
    if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
      throw new Error(
        `config.json field "googleSheets.sheetRows.${field}" must be a positive integer.`,
      );
    }
  }

  if (
    !Array.isArray(sheetRows.liveMatch.banRows) ||
    sheetRows.liveMatch.banRows.length !== 4 ||
    sheetRows.liveMatch.banRows.some(
      (rowNumber) => !Number.isInteger(rowNumber) || rowNumber <= 0,
    )
  ) {
    throw new Error(
      'config.json field "googleSheets.sheetRows.liveMatch.banRows" must contain four positive integers in ban order.',
    );
  }
  if (sheetRows.roundSetup.lastStageRow < sheetRows.roundSetup.firstStageRow) {
    throw new Error(
      'config.json field "googleSheets.sheetRows.roundSetup.lastStageRow" must be at or after firstStageRow.',
    );
  }
}

function loadConfig({
  configPath = process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH,
  env = process.env,
} = {}) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Configuration file not found at ${configPath}. Copy config.example.json to config.json.`,
      );
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Configuration file ${configPath} contains invalid JSON.`);
    }
    throw error;
  }

  const loadedConfig = mergeConfig(DEFAULT_CONFIG, parsed);
  validateConfigShape(loadedConfig);
  applyLegacyEnvFallbacks(loadedConfig, parsed, env);

  loadedConfig.runtime.databasePath = path.resolve(
    PROJECT_ROOT,
    loadedConfig.runtime.databasePath,
  );

  return loadedConfig;
}

function findMissingEnv(envNames, env = process.env) {
  return envNames.filter((name) => !env[name] || env[name].trim() === "");
}

function validateStartupConfiguration(candidate, env = process.env) {
  const missingEnv = findMissingEnv(REQUIRED_ENV_VARS, env);
  const missingConfig = [];

  if (!candidate.discord.applicationId) {
    missingConfig.push("discord.applicationId");
  }

  if (missingEnv.length > 0 || missingConfig.length > 0) {
    const details = [];
    if (missingEnv.length > 0) {
      details.push(`environment variables: ${missingEnv.join(", ")}`);
    }
    if (missingConfig.length > 0) {
      details.push(`config values: ${missingConfig.join(", ")}`);
    }
    throw new Error(
      `Missing required ${details.join("; ")}. See .env.example and config.example.json.`,
    );
  }
}

function getFeatureConfigurationWarnings(candidate, env = process.env) {
  const warnings = [];

  const osuMissing = findMissingEnv(
    ["OSU_CLIENT_ID", "OSU_CLIENT_SECRET", "OSU_API_KEY"],
    env,
  );
  if (osuMissing.length > 0) {
    warnings.push(`osu! API missing environment values: ${osuMissing.join(", ")}`);
  }

  if (!env.CREDENTIALS_PATH || !candidate.googleSheets.tournamentSpreadsheetId) {
    warnings.push(
      "Google Sheets requires CREDENTIALS_PATH and googleSheets.tournamentSpreadsheetId.",
    );
  }

  if (candidate.discord.resultChannelIds.length === 0) {
    warnings.push(
      "Match broadcasts have no discord.resultChannelIds configured.",
    );
  }

  if (
    !candidate.discord.welcomeChannelId ||
    !candidate.discord.verifiedRoleId
  ) {
    warnings.push(
      "Welcome verification requires discord.welcomeChannelId and discord.verifiedRoleId.",
    );
  }

  if (!env.CHALLONGE_API || !candidate.challonge.tournamentId) {
    warnings.push(
      "Challonge requires CHALLONGE_API and challonge.tournamentId.",
    );
  }

  return warnings;
}

const config = loadConfig();

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_CONFIG_PATH,
  REQUIRED_ENV_VARS,
  config,
  findMissingEnv,
  getFeatureConfigurationWarnings,
  loadConfig,
  validateConfigShape,
  validateStartupConfiguration,
};
