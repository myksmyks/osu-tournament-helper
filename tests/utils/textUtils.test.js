const {
  cleanStageName,
  cleanDateString,
  normalizeName,
} = require("../../src/utils/textUtils");

describe("Text Utilities", () => {
  describe("cleanStageName", () => {
    test("cleans standard bracket headers", () => {
      expect(cleanStageName("(RO16) Bracket")).toBe("Bracket");
      expect(cleanStageName("(QF) Match")).toBe("Match");
    });

    test("returns empty string if input is null or undefined", () => {
      expect(cleanStageName(null)).toBe("");
      expect(cleanStageName(undefined)).toBe("");
    });

    test("leaves standard values intact", () => {
      expect(cleanStageName("Qualifiers")).toBe("Qualifiers");
    });
  });

  describe("cleanDateString", () => {
    test("removes weekday headers from date values", () => {
      expect(cleanDateString("(Fri) Jun 12")).toBe("Jun 12");
      expect(cleanDateString("(Sun) Oct 24")).toBe("Oct 24");
    });

    test("returns empty string if input is null or undefined", () => {
      expect(cleanDateString(null)).toBe("");
      expect(cleanDateString(undefined)).toBe("");
    });
  });

  describe("normalizeName", () => {
    test("lowercases and strips whitespace", () => {
      expect(normalizeName("Red Team")).toBe("redteam");
      expect(normalizeName("  Alpha   ")).toBe("alpha");
    });

    test("returns empty string if input is null or undefined", () => {
      expect(normalizeName(null)).toBe("");
      expect(normalizeName(undefined)).toBe("");
    });
  });
});
