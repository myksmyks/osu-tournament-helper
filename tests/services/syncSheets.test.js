const {
  syncGoogleSheetsToDb,
  getLiveMatchBans,
  getFirstToValue,
} = require("../../src/services/syncSheets");

describe("Sync Sheets Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("runs Google Sheets sync and parses rows correctly into SQLite", async () => {
    const mockQualsData = [
      ["", "match_id", "date", "time", "referee", "", "", "", "team_1"],
      [],
      [],
      ["", "Q1", "Jun 12", "14:00", "RefName", "", "", "", "TeamOne"],
    ];

    const mockBracketData = [
      [
        "",
        "",
        "match_id",
        "stage",
        "",
        "date",
        "time",
        "referee",
        "",
        "team_red",
        "score_red",
        "score_blue",
        "team_blue",
        "",
        "streamer",
        "comms_1",
        "comms_2",
        "",
        "mp_link",
      ],
      [],
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
      [],
      [],
      [],
      [],
      [],
      [],
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
  });

  test("resolves bans and picker details for an active match from sheet tabs", async () => {
    // values.get returns coordinates relative to H9:S14; index 11 is column S.
    const mockBanRows = [
      ["NM1"],
      ["HD1"],
      ["HR1"],
      ["DT1", "", "", "", "", "", "", "", "", "", "", "RED First Ban"],
      ["", "", "", "", "", "", "", "", "", "", "", "BLUE First Pick"],
    ];

    global.mockGetValues.mockResolvedValueOnce({
      data: { values: mockBanRows },
    });

    const bans = await getLiveMatchBans("32");

    expect(bans.firstPicker).toBe("Blue");
    expect(bans.redBans).toContain("NM1");
    expect(bans.blueBans).toContain("HD1");
  });

  test("pulls stage best-of rules from Round Setup sheet tabs", async () => {
    // G:Z places the "First To" value at index 19.
    const mockRoundSetup = [
      [
        "Quarter Finals",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "5",
      ],
    ];

    global.mockGetValues.mockResolvedValueOnce({
      data: { values: mockRoundSetup },
    });

    const firstTo = await getFirstToValue("Quarter Finals");
    expect(firstTo).toBe(5);
  });
});
