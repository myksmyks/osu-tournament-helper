const { DEFAULT_CONFIG } = require("../../src/config");
const {
  columnLetterToIndex,
  getCell,
  parseSheetRow,
} = require("../../src/utils/sheetColumns");

describe("Sheet Column Utilities", () => {
  test.each([
    ["A", 0],
    ["B", 1],
    ["Z", 25],
    ["AA", 26],
    ["AB", 27],
    [" ab ", 27],
  ])("converts column %s to zero-based index %i", (column, expected) => {
    expect(columnLetterToIndex(column)).toBe(expected);
  });

  test("parses rows using configured field names and columns", () => {
    const row = ["ignored", "M42", "Quarter Finals", "", "", "Jun 14"];
    const parsed = parseSheetRow(
      row,
      {
        matchId: "B",
        stage: "C",
        date: "F",
        optional: "AA",
      },
      "Test layout",
    );

    expect(parsed).toEqual({
      matchId: "M42",
      stage: "Quarter Finals",
      date: "Jun 14",
      optional: null,
    });
  });

  test("default mappings preserve the previous hardcoded positions", () => {
    const { sheetColumns } = DEFAULT_CONFIG.googleSheets;

    expect(getCell([], sheetColumns.qualifiers.matchId)).toBeNull();
    expect(columnLetterToIndex(sheetColumns.qualifiers.matchId)).toBe(1);
    expect(columnLetterToIndex(sheetColumns.qualifiers.team1)).toBe(8);
    expect(columnLetterToIndex(sheetColumns.bracket.matchId)).toBe(2);
    expect(columnLetterToIndex(sheetColumns.bracket.teamRed)).toBe(9);
    expect(columnLetterToIndex(sheetColumns.bracket.mpLink)).toBe(18);
    expect(columnLetterToIndex(sheetColumns.mappool.mapId)).toBe(4);
    expect(columnLetterToIndex(sheetColumns.liveMatch.decision)).toBe(18);
    expect(columnLetterToIndex(sheetColumns.roundSetup.firstTo)).toBe(25);
  });

  test.each(["", "A1", "1", "A-B", null, undefined])(
    "rejects invalid column value %p clearly",
    (column) => {
      expect(() => columnLetterToIndex(column)).toThrow(/sheet column/i);
    },
  );
});
