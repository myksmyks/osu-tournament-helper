const {
  DEFAULT_CONFIG,
  config,
  findMissingEnv,
  validateConfigShape,
  validateStartupConfiguration,
} = require("../src/config");

describe("Configuration", () => {
  test("accepts the loaded config and required startup environment variables", () => {
    expect(() =>
      validateStartupConfiguration(config, {
        TOKEN: "token",
        OSU_IRC_USERNAME: "username",
        OSU_IRC_PASSWORD: "password",
      }),
    ).not.toThrow();
    expect(() => validateConfigShape(config)).not.toThrow();
  });

  test("reports missing or blank values without exposing configured values", () => {
    const env = {
      TOKEN: "token",
      CLIENT_ID: " ",
    };

    expect(
      findMissingEnv(["TOKEN", "CLIENT_ID", "OSU_IRC_USERNAME"], env),
    ).toEqual(["CLIENT_ID", "OSU_IRC_USERNAME"]);
    expect(() => validateStartupConfiguration(config, env)).toThrow(
      /OSU_IRC_USERNAME, OSU_IRC_PASSWORD/,
    );
  });

  test("rejects missing and invalid sheet column mappings clearly", () => {
    const missingColumns = structuredClone(DEFAULT_CONFIG);
    missingColumns.googleSheets.sheetColumns.bracket = null;
    expect(() => validateConfigShape(missingColumns)).toThrow(
      /googleSheets\.sheetColumns\.bracket column config must be an object/,
    );

    const invalidColumn = structuredClone(DEFAULT_CONFIG);
    invalidColumn.googleSheets.sheetColumns.qualifiers.matchId = "A1";
    expect(() => validateConfigShape(invalidColumn)).toThrow(
      /googleSheets\.sheetColumns\.qualifiers\.matchId.*Invalid sheet column/,
    );
  });

  test("rejects invalid sheet row mappings clearly", () => {
    const invalidDataRow = structuredClone(DEFAULT_CONFIG);
    invalidDataRow.googleSheets.sheetRows.qualifiers.firstDataRow = 0;
    expect(() => validateConfigShape(invalidDataRow)).toThrow(
      /googleSheets\.sheetRows\.qualifiers\.firstDataRow.*positive integer/,
    );

    const invalidBanRows = structuredClone(DEFAULT_CONFIG);
    invalidBanRows.googleSheets.sheetRows.liveMatch.banRows = [9, 10];
    expect(() => validateConfigShape(invalidBanRows)).toThrow(
      /googleSheets\.sheetRows\.liveMatch\.banRows.*four positive integers/,
    );

    const reversedRoundSetup = structuredClone(DEFAULT_CONFIG);
    reversedRoundSetup.googleSheets.sheetRows.roundSetup.firstStageRow = 14;
    expect(() => validateConfigShape(reversedRoundSetup)).toThrow(
      /lastStageRow.*at or after firstStageRow/,
    );
  });
});
