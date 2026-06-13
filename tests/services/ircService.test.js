const ircService = require("../../src/services/ircService");
const osuService = require("../../src/services/osuService");
const syncSheets = require("../../src/services/syncSheets");
const challongeService = require("../../src/services/challongeService");

describe("IRC Service Lobby Monitoring", () => {
  let mockChannel;

  beforeEach(() => {
    jest.clearAllMocks();

    mockChannel = ircService.client.getChannel("#mp_1234");

    jest
      .spyOn(osuService, "getUser")
      .mockResolvedValue({ id: 111111, username: "AlphaRed" });
    jest
      .spyOn(osuService, "getMapInfo")
      .mockResolvedValue("[NM1] Title [Insane] (5.40⭐)");
    jest.spyOn(syncSheets, "getLiveMatchBans").mockResolvedValue({
      redBans: ["NM1"],
      blueBans: ["HD1"],
      firstPicker: "Red",
    });
  });

  afterEach(() => {
    for (const timer of ircService.updateTimers.values()) {
      clearTimeout(timer);
    }
    ircService.updateTimers.clear();

    for (const timer of ircService.pollingTimers.values()) {
      clearTimeout(timer);
    }
    ircService.pollingTimers.clear();
  });

  test("parses live player completion strings, tallies points, and triggers update embeds", async () => {
    const mockDiscordMsg = {
      edit: jest.fn().mockResolvedValue(true),
      channelId: "99999",
    };

    await ircService.monitorLobby(
      "1234",
      [mockDiscordMsg],
      "AlphaRed",
      "OmegaBlue",
      "32",
    );

    mockChannel.emit("message", {
      message: "Host changed map to https://osu.ppy.sh/b/1001",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    mockChannel.emit("message", {
      message: "AlphaRed finished playing (Score: 780000, PASSED).",
    });
    mockChannel.emit("message", {
      message: "OmegaBlue finished playing (Score: 450000, PASSED).",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    mockChannel.emit("message", { message: "The match has finished!" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const lobbyState = ircService.activeLobbies.get("1234");
    expect(lobbyState.scoreRed).toBe(1);
    expect(lobbyState.scoreBlue).toBe(0);
  });

  test("handles PM sending cleanly", async () => {
    const spyUser = jest.spyOn(ircService.client, "getUser");
    await ircService.sendMessage("UserTest", "Diagnostic Message");
    expect(spyUser).toHaveBeenCalledWith("UserTest");
  });

  test("closes actively monitored lobbies cleanly and triggers Challonge reporting", async () => {
    const mockDiscordMsg = {
      edit: jest.fn().mockResolvedValue(true),
      channelId: "99999",
    };
    const spyChallonge = jest
      .spyOn(challongeService, "updateChallongeMatch")
      .mockResolvedValue(true);

    await ircService.monitorLobby(
      "1234",
      [mockDiscordMsg],
      "AlphaRed",
      "OmegaBlue",
      "32",
    );

    mockChannel.emit("message", { message: "Room closed." });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(ircService.activeLobbies.has("1234")).toBe(false);
    expect(spyChallonge).toHaveBeenCalled();
  });

  test("finalizes when the bot parts from an actively monitored lobby", async () => {
    const mockDiscordMsg = {
      edit: jest.fn().mockResolvedValue(true),
      channelId: "99999",
    };
    const finalizeSpy = jest
      .spyOn(ircService, "finalizeMatch")
      .mockResolvedValue();

    await ircService.monitorLobby(
      "1234",
      [mockDiscordMsg],
      "AlphaRed",
      "OmegaBlue",
      "32",
    );

    mockChannel.emit("PART", {
      user: { ircUsername: ircService.client.ircUsername },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(finalizeSpy).toHaveBeenCalledWith("1234");
    finalizeSpy.mockRestore();
  });

  test("processes manual historic multiplayer matches using the legacy osu! API", async () => {
    const mockDiscordMsg = {
      edit: jest.fn().mockResolvedValue(true),
      channelId: "99999",
    };

    const mockApiMatch = {
      match: { name: "Test Lobby Name" },
      games: [
        {
          beatmap_id: "1001",
          scores: [
            { user_id: "111111", score: "650000" },
            { user_id: "222222", score: "450000" },
          ],
        },
      ],
    };

    jest
      .spyOn(osuService, "getUser")
      .mockResolvedValueOnce({ id: 111111, username: "AlphaRed" })
      .mockResolvedValueOnce({ id: 222222, username: "OmegaBlue" });

    jest.spyOn(osuService, "getMatchData").mockResolvedValue(mockApiMatch);
    jest
      .spyOn(challongeService, "updateChallongeMatch")
      .mockResolvedValue(true);

    await ircService.processManualMatch("1234", "32", [mockDiscordMsg]);

    expect(ircService.activeLobbies.has("1234")).toBe(false);
  });
});
