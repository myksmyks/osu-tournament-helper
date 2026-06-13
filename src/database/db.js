const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { config } = require("../config");
const logger = require("../services/logger");

let db;

async function getDatabase() {
  if (db) return db;
  try {
    logger.info(
      "DATABASE",
      "Attempting connection to local SQLite database...",
    );
    db = await open({
      filename: config.runtime.databasePath,
      driver: sqlite3.Database,
    });

    await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                discord_id TEXT PRIMARY KEY,
                osu_username TEXT,
                verification_code TEXT,
                is_verified INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS matches (
                match_id TEXT PRIMARY KEY,
                stage TEXT,
                date TEXT,
                time TEXT,
                referee TEXT,
                team_red TEXT,
                team_blue TEXT,
                team_1 TEXT,
                streamer TEXT,
                comms_1 TEXT,
                comms_2 TEXT,
                mp_link TEXT,
                score_red INTEGER,
                score_blue INTEGER
            );
            CREATE TABLE IF NOT EXISTS mappool (
                stage TEXT,
                mod_id TEXT,
                map_id TEXT,
                category TEXT,
                PRIMARY KEY (stage, map_id)
            );
            CREATE TABLE IF NOT EXISTS monitor_sessions (
                match_id TEXT PRIMARY KEY,
                mp_id TEXT NOT NULL,
                state_json TEXT NOT NULL,
                messages_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
    logger.info("DATABASE", "Database tables ready and verified.");
    return db;
  } catch (err) {
    logger.error("DATABASE", "Failed to initialize database connection", err);
    throw err;
  }
}

module.exports = { getDatabase };
