const {
  syncGoogleSheetsToDb,
  getLiveMatchBans,
  getFirstToValue,
} = require("../../src/services/syncSheets");
const { config } = require("../../src/config");
const {
  columnLetterToIndex,
} = require("../../src/utils/sheetColumns");

function createSheetRow(cells) {
  const row = [];
  for (const [column, value] of Object.entries(cells)) {
    row[columnLetterToIndex(column)] = value;
  }
  return row;
}

describe("Sync Sheets Service", () => {
  let originalSheetRows;

  beforeEach(() => {
    jest.clearAllMocks();
    originalSheetRows = structuredClone(config.googleSheets.sheetRows);
  });

  afterEach(() => {
    config.googleSheets.sheetRows = originalSheetRows;
  });

  test("runs Google Sheets sync and parses rows correctly into SQLite", async () => {
    const poolStatement = {
      run: jest.fn().mockResolvedValue(true),
      finalize: jest.fn().mockResolvedValue(true),
    };
    const matchStatement = {
      run: jest.fn().mockResolvedValue(true),
      finalize: jest.fn().mockResolvedValue(true),
    };
    global.mockDb.prepare
      .mockResolvedValueOnce(poolStatement)
      .mockResolvedValueOnce(matchStatement);

    const mockQualsData = [
      ["", "Q1", "Jun 12", "14:00", "RefName", "", "", "", "TeamOne"],
    ];

    const mockBracketData = [
      [
        "",
        "",
        "32",
        "Quarter Finals",
        "",
        "Jun 13",
        "15:00",
        "RefName",
        "",
        "AlphaRed",
        "0",
        "0",
        "OmegaBlue",
        "",
        "StreamerName",
        "Caster1",
        "Caster2",
        "",
        "https://osu.ppy.sh/mp/1234",
      ],
    ];

    const mockMappoolData = [
      ["", "Quarter Finals", "NM1", "1001", "123456", "NM"],
    ];

    global.mockGetValues
      .mockResolvedValueOnce({ data: { values: mockQualsData } })
      .mockResolvedValueOnce({ data: { values: mockBracketData } })
      .mockResolvedValueOnce({ data: { values: mockMappoolData } });

    const result = await syncGoogleSheetsToDb();

    expect(result.success).toBe(true);
    expect(result.qCount).toBe(1);
    expect(result.cCount).toBe(1);
    expect(poolStatement.run).toHaveBeenCalledWith(
      "Quarter Finals",
      "NM1",
      "123456",
      "NM",
    );
    expect(matchStatement.run).toHaveBeenNthCalledWith(
      1,
      "Q1",
      "Qualifiers",
      "Jun 12",
      "14:00",
      "RefName",
      null,
      null,
      "TeamOne",
      null,
      null,
      null,
      null,
      null,
      null,
    );
    expect(matchStatement.run).toHaveBeenNthCalledWith(
      2,
      "32",
      "Quarter Finals",
      "Jun 13",
      "15:00",
      "RefName",
      "AlphaRed",
      "OmegaBlue",
      null,
      "StreamerName",
      "Caster1",
      "Caster2",
      "https://osu.ppy.sh/mp/1234",
      "0",
      "0",
    );
    expect(global.mockGetValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ range: "'Qualifiers'!A4:I" }),
    );
    expect(global.mockGetValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ range: "'Bracket'!A3:S" }),
    );
  });

  test("uses configured first data rows when requesting sync ranges", async () => {
    config.googleSheets.sheetRows.qualifiers.firstDataRow = 8;
    config.googleSheets.sheetRows.bracket.firstDataRow = 9;
    config.googleSheets.sheetRows.mappool.firstDataRow = 10;
    global.mockGetValues.mockResolvedValue({ data: { values: [] } });

    const result = await syncGoogleSheetsToDb();

    expect(result.success).toBe(true);
    expect(global.mockGetValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ range: "'Qualifiers'!A8:I" }),
    );
    expect(global.mockGetValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ range: "'Bracket'!A9:S" }),
    );
    expect(global.mockGetValues).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ range: "'Mappool'!A10:F" }),
    );
  });

  test("resolves bans and picker details for an active match from sheet tabs", async () => {
    const mockBanRows = [
      createSheetRow({ H: "NM1" }),
      createSheetRow({ H: "HD1" }),
      createSheetRow({ H: "HR1" }),
      createSheetRow({ H: "DT1", S: "RED First Ban" }),
      createSheetRow({ S: "BLUE First Pick" }),
    ];

    global.mockGetValues.mockResolvedValueOnce({
      data: { values: mockBanRows },
    });

    const bans = await getLiveMatchBans("32");

    expect(global.mockGetValues).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'32'!A9:S13" }),
    );
    expect(bans.firstPicker).toBe("Blue");
    expect(bans.redBans).toContain("NM1");
    expect(bans.blueBans).toContain("HD1");
  });

  test("pulls stage best-of rules from Round Setup sheet tabs", async () => {
    const mockRoundSetup = [
      createSheetRow({ G: "Quarter Finals", Z: "5" }),
    ];

    global.mockGetValues.mockResolvedValueOnce({
      data: { values: mockRoundSetup },
    });

    const firstTo = await getFirstToValue("Quarter Finals");
    expect(global.mockGetValues).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Round Setup'!A5:Z13" }),
    );
    expect(firstTo).toBe(5);
  });
});
