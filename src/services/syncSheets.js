const { getDatabase } = require("../database/db");
const { config } = require("../config");
const { getSheetsClient } = require("./googleSheetsService");
const logger = require("./logger");
const { cleanStageName } = require("../utils/textUtils");

async function syncGoogleSheetsToDb() {
  logger.info("SYNC", "Starting scheduled Google Sheets sync...");

  try {
    const db = await getDatabase();
    const sheets = getSheetsClient();

    const qRes = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: `${config.googleSheets.qualifierTab}!A1:O`,
    });
    const cRes = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: `${config.googleSheets.bracketTab}!A1:U`,
    });

    const poolRes = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: `Mappool!A1:F`,
    });

    const poolStmt = await db.prepare(`
            INSERT OR REPLACE INTO mappool 
            (stage, mod_id, map_id, category) 
            VALUES (?, ?, ?, ?)`);

    const poolRows = poolRes.data.values || [];
    for (const r of poolRows.slice(6)) {
      if (!r[3]) continue;
      await poolStmt.run(r[1], r[2], r[4], r[5]);
    }

    const stmt = await db.prepare(`
            INSERT OR REPLACE INTO matches 
            (match_id, stage, date, time, referee, team_red, team_blue, team_1, streamer, comms_1, comms_2, mp_link, score_red, score_blue)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

    const qRows = qRes.data.values || [];
    let qCount = 0;
    for (const r of qRows.slice(3)) {
      if (!r[1] || r[1].trim() === "") continue;
      await stmt.run(
        r[1],
        "Qualifiers",
        r[2],
        r[3],
        r[4],
        null,
        null,
        r[8],
        null,
        null,
        null,
        null,
        null,
        null,
      );
      qCount++;
    }

    const cRows = cRes.data.values || [];
    let cCount = 0;
    for (const r of cRows.slice(2)) {
      if (!r[2] || r[2].trim() === "") continue;
      await stmt.run(
        r[2],
        r[3],
        r[5],
        r[6],
        r[7],
        r[9],
        r[12],
        null,
        r[14],
        r[15],
        r[16],
        r[18],
        r[10],
        r[11],
      );
      cCount++;
    }

    await poolStmt.finalize();
    await stmt.finalize();
    logger.info(
      "SYNC",
      `Success! Synced ${qCount} Qualifiers and ${cCount} Bracket Matches.`,
    );
    return { success: true, qCount, cCount };
  } catch (err) {
    logger.error("SYNC", "Sync execution failed", err);
    return { success: false, error: err.message };
  }
}

async function getLiveMatchBans(matchId) {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: `'${matchId}'!H9:S14`,
    });

    const rows = response.data.values || [];
    if (rows.length < 4) return null;

    // Google returns row indexes relative to the requested H9:S14 range.
    const bans = [
      rows[0]?.[0] || null,
      rows[1]?.[0] || null,
      rows[2]?.[0] || null,
      rows[3]?.[0] || null,
    ];

    const s12 = (rows[3]?.[11] || "").toLowerCase();
    const s14 = (rows[4]?.[11] || "").toLowerCase();

    const isRedFirstBan = s12.includes("red");

    let firstPicker = "Not decided";
    if (s14.includes("red")) firstPicker = "Red";
    else if (s14.includes("blue")) firstPicker = "Blue";

    return {
      redBans: isRedFirstBan ? [bans[0], bans[3]] : [bans[1], bans[2]],
      blueBans: isRedFirstBan ? [bans[1], bans[2]] : [bans[0], bans[3]],
      firstPicker: firstPicker,
    };
  } catch (err) {
    logger.debug("SYNC", `No custom tab found for Match ID: ${matchId}`);
    return null;
  }
}

async function getFirstToValue(stageName) {
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: `'Round Setup'!G5:Z13`,
    });

    const rows = res.data.values || [];
    const cleanStage = cleanStageName(stageName);
    const row = rows.find((r) => r[0] && r[0].trim() === cleanStage);

    return row && row[19] ? parseInt(row[19]) : 1;
  } catch (e) {
    logger.error(
      "SYNC",
      `Failed to fetch First To value for ${stageName}: ${e.message}`,
    );
    return 6;
  }
}

module.exports = { syncGoogleSheetsToDb, getLiveMatchBans, getFirstToValue };
