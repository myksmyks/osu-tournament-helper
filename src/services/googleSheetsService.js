const { google } = require("googleapis");
const logger = require("./logger");

function getSheetsClient() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.CREDENTIALS_PATH,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return google.sheets({ version: "v4", auth });
  } catch (error) {
    logger.error(
      "GOOGLE_SHEETS",
      "Failed to initialize Google Sheets client",
      error,
    );
    throw error;
  }
}

module.exports = { getSheetsClient };
