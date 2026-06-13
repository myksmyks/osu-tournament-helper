const { createMatchEmbed } = require("../../src/services/embedService");

describe("Embed Service", () => {
  test("creates a standard match embed in live tracking state", () => {
    const embed = createMatchEmbed({
      stage: "Quarter Finals",
      teamRed: "Alpha",
      teamBlue: "Omega",
      scoreRed: 3,
      scoreBlue: 1,
      status: "Picking Map",
      nextPicker: "Alpha",
      currentMapID: "12345",
      currentMapNameFull: "[NM1] Map Title (5.40⭐)",
      redBansFormatted: "**NM1**: Map A",
      blueBansFormatted: "**HD1**: Map B",
      history: [],
      isFinal: false,
      dbMatchId: "42",
    });

    expect(embed.data.title).toContain("Quarter Finals: Alpha vs Omega");
    expect(embed.data.color).toBe(0xff69b4);
    expect(embed.data.description).toBe("# Alpha 3 — 1 Omega");
  });

  test("handles forfeits and uses correct colors and scores", () => {
    const embed = createMatchEmbed({
      stage: "Semi Finals",
      teamRed: "Alpha",
      teamBlue: "Omega",
      scoreRed: -1,
      scoreBlue: 5,
      status: "🏁 Forfeited",
      isForfeit: true,
      isFinal: true,
      dbMatchId: "42",
    });

    expect(embed.data.title).toContain("🏁 Semi Finals: Alpha vs Omega");
    expect(embed.data.color).toBe(0x2b2d31);
    expect(embed.data.description).toContain("Alpha FF — 5 Omega");
  });

  test("chunks and splits points history if it exceeds field limit", () => {
    const mockHistory = [];
    for (let i = 1; i <= 15; i++) {
      mockHistory.push({
        mod: `NM${i}`,
        mapId: `100${i}`,
        mapName: `Map Name ${i}`,
        redScore: 600000 + i,
        blueScore: 500000 + i,
        pickerNick: "Alpha",
      });
    }

    const embed = createMatchEmbed({
      stage: "Finals",
      teamRed: "Alpha",
      teamBlue: "Omega",
      scoreRed: 8,
      scoreBlue: 7,
      status: "Match Finished",
      history: mockHistory,
      isFinal: true,
      dbMatchId: "42",
    });

    const historyFields = embed.data.fields.filter((f) =>
      f.name.includes("Points History"),
    );
    expect(historyFields.length).toBeGreaterThan(1);
  });
});
