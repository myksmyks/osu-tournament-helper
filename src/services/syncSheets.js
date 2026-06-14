const { getDatabase } = require("../database/db");
const { config } = require("../config");
const { getSheetsClient } = require("./googleSheetsService");
const logger = require("./logger");
const { cleanStageName } = require("../utils/textUtils");
const {
  getLastConfiguredColumn,
  parseSheetRow,
} = require("../utils/sheetColumns");

function quoteSheetName(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

function buildSheetRange(sheetName, startRow, endRow, columns, mappingName) {
  const endColumn = getLastConfiguredColumn(columns, mappingName);
  const endCoordinate = endRow ? `${endColumn}${endRow}` : endColumn;
  return `${quoteSheetName(sheetName)}!A${startRow}:${endCoordinate}`;
}

function hasValue(value) {
  return value !== null && String(value).trim() !== "";
}

function getRowBySheetNumber(rows, rowNumber, rangeStartRow) {
  return rows[rowNumber - rangeStartRow] || [];
}

async function syncGoogleSheetsToDb() {
  logger.info("SYNC", "Starting scheduled Google Sheets sync...");

  try {
    const db = await getDatabase();
    const sheets = getSheetsClient();
    const { sheetColumns, sheetRows } = config.googleSheets;

    const qRes = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: buildSheetRange(
        config.googleSheets.qualifierTab,
        sheetRows.qualifiers.firstDataRow,
        null,
        sheetColumns.qualifiers,
        "Qualifier",
      ),
    });
    const cRes = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: buildSheetRange(
        config.googleSheets.bracketTab,
        sheetRows.bracket.firstDataRow,
        null,
        sheetColumns.bracket,
        "Bracket",
      ),
    });

    const poolRes = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: buildSheetRange(
        config.googleSheets.mappoolTab,
        sheetRows.mappool.firstDataRow,
        null,
        sheetColumns.mappool,
        "Mappool",
      ),
    });

    const poolStmt = await db.prepare(`
            INSERT OR REPLACE INTO mappool 
            (stage, mod_id, map_id, category) 
            VALUES (?, ?, ?, ?)`);

    const poolRows = poolRes.data.values || [];
    for (const row of poolRows) {
      const mappool = parseSheetRow(row, sheetColumns.mappool, "Mappool");
      if (!hasValue(mappool.mapsetId)) continue;
      await poolStmt.run(
        mappool.stage,
        mappool.modId,
        mappool.mapId,
        mappool.category,
      );
    }

    const stmt = await db.prepare(`
            INSERT OR REPLACE INTO matches 
            (match_id, stage, date, time, referee, team_red, team_blue, team_1, streamer, comms_1, comms_2, mp_link, score_red, score_blue)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

    const qRows = qRes.data.values || [];
    let qCount = 0;
    for (const row of qRows) {
      const qualifier = parseSheetRow(
        row,
        sheetColumns.qualifiers,
        "Qualifier",
      );
      if (!hasValue(qualifier.matchId)) continue;
      await stmt.run(
        qualifier.matchId,
        "Qualifiers",
        qualifier.date,
        qualifier.time,
        qualifier.referee,
        null,
        null,
        qualifier.team1,
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
    for (const row of cRows) {
      const bracket = parseSheetRow(row, sheetColumns.bracket, "Bracket");
      if (!hasValue(bracket.matchId)) continue;
      await stmt.run(
        bracket.matchId,
        bracket.stage,
        bracket.date,
        bracket.time,
        bracket.referee,
        bracket.teamRed,
        bracket.teamBlue,
        null,
        bracket.streamer,
        bracket.caster1,
        bracket.caster2,
        bracket.mpLink,
        bracket.scoreRed,
        bracket.scoreBlue,
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
    const { sheetColumns, sheetRows } = config.googleSheets;
    const liveMatchRows = [
      ...sheetRows.liveMatch.banRows,
      sheetRows.liveMatch.firstBanSideRow,
      sheetRows.liveMatch.firstPickerRow,
    ];
    const firstLiveMatchRow = Math.min(...liveMatchRows);
    const lastLiveMatchRow = Math.max(...liveMatchRows);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: buildSheetRange(
        matchId,
        firstLiveMatchRow,
        lastLiveMatchRow,
        sheetColumns.liveMatch,
        "Live match",
      ),
    });

    const rows = response.data.values || [];
    if (rows.length < 4) return null;

    const parseLiveRow = (rowNumber) =>
      parseSheetRow(
        getRowBySheetNumber(rows, rowNumber, firstLiveMatchRow),
        sheetColumns.liveMatch,
        "Live match",
      );
    const bans = sheetRows.liveMatch.banRows.map(
      (rowNumber) => parseLiveRow(rowNumber).ban,
    );
    const firstBanSide = String(
      parseLiveRow(sheetRows.liveMatch.firstBanSideRow).decision || "",
    ).toLowerCase();
    const firstPickerCell = String(
      parseLiveRow(sheetRows.liveMatch.firstPickerRow).decision || "",
    ).toLowerCase();

    const isRedFirstBan = firstBanSide.includes("red");

    let firstPicker = "Not decided";
    if (firstPickerCell.includes("red")) firstPicker = "Red";
    else if (firstPickerCell.includes("blue")) firstPicker = "Blue";

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
    const { sheetColumns, sheetRows } = config.googleSheets;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheets.tournamentSpreadsheetId,
      range: buildSheetRange(
        config.googleSheets.roundSetupTab,
        sheetRows.roundSetup.firstStageRow,
        sheetRows.roundSetup.lastStageRow,
        sheetColumns.roundSetup,
        "Round Setup",
      ),
    });

    const rows = res.data.values || [];
    const cleanStage = cleanStageName(stageName);
    const matchingRow = rows
      .map((row) => parseSheetRow(row, sheetColumns.roundSetup, "Round Setup"))
      .find(
        (roundSetup) =>
          hasValue(roundSetup.stage) &&
          String(roundSetup.stage).trim() === cleanStage,
      );
    const firstTo = Number.parseInt(matchingRow?.firstTo, 10);

    return Number.isNaN(firstTo) ? 1 : firstTo;
  } catch (e) {
    logger.error(
      "SYNC",
      `Failed to fetch First To value for ${stageName}: ${e.message}`,
    );
    return 6;
  }
}

module.exports = { syncGoogleSheetsToDb, getLiveMatchBans, getFirstToValue };
