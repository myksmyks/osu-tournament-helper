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
    for (const state of ircService.activeLobbies.values()) {
      ircService.detachLobbyListeners(state);
    }
    ircService.activeLobbies.clear();
  });

  test("parses live player completion strings, tallies points, and triggers update embeds", async () => {
    const mockDiscordMsg = {
      id: "message-1",
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
    const checkpointCall = global.mockDb.run.mock.calls
      .filter(([query]) => query.includes("monitor_sessions"))
      .at(-1);
    expect(checkpointCall).toBeDefined();
    const savedState = JSON.parse(checkpointCall[1][2]);
    expect(savedState.scoreRed).toBe(1);
    expect(savedState.history).toHaveLength(1);
    expect(JSON.parse(checkpointCall[1][3])).toEqual([
      { channelId: "99999", messageId: "message-1" },
    ]);
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

  test("suspends and preserves recovery state when the bot parts", async () => {
    const mockDiscordMsg = {
      id: "message-1",
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

    mockChannel.emit("PART", {
      user: { ircUsername: ircService.client.ircUsername },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(ircService.activeLobbies.has("1234")).toBe(false);
    expect(
      global.mockDb.run.mock.calls.some(([query]) =>
        query.includes("DELETE FROM monitor_sessions"),
      ),
    ).toBe(false);
    const checkpointCall = global.mockDb.run.mock.calls
      .filter(([query]) => query.includes("monitor_sessions"))
      .at(-1);
    expect(JSON.parse(checkpointCall[1][2]).status).toBe(
      "Monitoring Interrupted",
    );
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

  test("loads a saved session and restores its Discord messages", async () => {
    global.mockDb.get.mockResolvedValueOnce({
      match_id: "32",
      mp_id: "1234",
      state_json: JSON.stringify({
        teamRed: "AlphaRed",
        teamBlue: "OmegaBlue",
        scoreRed: 2,
        scoreBlue: 1,
        history: [{ mod: "NM1" }],
      }),
      messages_json: JSON.stringify([
        { channelId: "99999", messageId: "message-1" },
      ]),
      updated_at: "2026-06-13 12:00:00",
    });
    const savedSession = await ircService.getSavedMonitorSession("32");
    const restoredMessage = {
      id: "message-1",
      channelId: "99999",
      edit: jest.fn(),
    };
    const client = {
      channels: {
        fetch: jest.fn().mockResolvedValue({
          messages: {
            fetch: jest.fn().mockResolvedValue(restoredMessage),
          },
        }),
      },
    };

    const messages = await ircService.restoreDiscordMessages(
      client,
      savedSession.messages,
    );

    expect(savedSession.state.scoreRed).toBe(2);
    expect(messages).toEqual([restoredMessage]);
  });

  test("resumes monitoring with the saved score, history, and partial map scores", async () => {
    const mockDiscordMsg = {
      id: "message-1",
      edit: jest.fn().mockResolvedValue(true),
      channelId: "99999",
    };
    const restoredState = {
      scoreRed: 2,
      scoreBlue: 1,
      currentMapID: "1002",
      currentMapName: "Second Map",
      currentMapNameFull: "[HD1] Second Map",
      currentPicker: "Blue",
      status: "LIVE",
      history: [
        {
          mod: "NM1",
          mapId: "1001",
          mapName: "First Map",
          redScore: 700000,
          blueScore: 600000,
        },
      ],
      liveScores: [["alphared", 450000]],
      lastMapIsWarmup: false,
    };

    await ircService.monitorLobby(
      "1234",
      [mockDiscordMsg],
      "AlphaRed",
      "OmegaBlue",
      "32",
      { isResume: true, restoredState },
    );

    const state = ircService.activeLobbies.get("1234");
    expect(state.scoreRed).toBe(2);
    expect(state.scoreBlue).toBe(1);
    expect(state.history).toEqual(restoredState.history);
    expect(state.liveScores.get("alphared")).toBe(450000);
    expect(state.status).toBe("Monitoring Resumed");
  });

  test("recovers completed tournament maps missed while the bot was offline", async () => {
    jest
      .spyOn(osuService, "getUser")
      .mockResolvedValueOnce({ id: 111111, username: "AlphaRed" })
      .mockResolvedValueOnce({ id: 222222, username: "OmegaBlue" });
    jest.spyOn(osuService, "getMatchData").mockResolvedValue({
      match: { name: "Test Lobby" },
      games: [
        {
          game_id: "501",
          beatmap_id: "1001",
          end_time: "2026-06-13 12:00:00",
          scores: [
            { user_id: "111111", score: "700000" },
            { user_id: "222222", score: "600000" },
          ],
        },
        {
          game_id: "502",
          beatmap_id: "1002",
          end_time: "2026-06-13 12:05:00",
          scores: [
            { user_id: "111111", score: "500000" },
            { user_id: "222222", score: "800000" },
          ],
        },
        {
          game_id: "503",
          beatmap_id: "1003",
          end_time: null,
          scores: [{ user_id: "111111", score: "250000" }],
        },
      ],
    });
    global.mockDb.get
      .mockResolvedValueOnce({ mod_id: "NM1", category: "NM" })
      .mockResolvedValueOnce({ mod_id: "HD1", category: "HD" });
    jest
      .spyOn(osuService, "getMapInfo")
      .mockResolvedValueOnce("[HD1] Second Map [Insane] (5.50â­)");

    const result = await ircService.recoverSavedMonitorSession({
      mpId: "1234",
      state: {
        teamRed: "AlphaRed",
        teamBlue: "OmegaBlue",
        stage: "Quarter Finals",
        scoreRed: 1,
        scoreBlue: 0,
        currentPicker: "Blue",
        history: [
          {
            mod: "NM1",
            mapId: "1001",
            redScore: 700000,
            blueScore: 600000,
          },
        ],
        liveScores: [["alphared", 250000]],
      },
    });

    expect(result.recoveredCount).toBe(1);
    expect(result.warning).toBeNull();
    expect(result.state.history).toHaveLength(2);
    expect(result.state.history[1]).toEqual(
      expect.objectContaining({
        gameId: "502",
        mod: "HD1",
        mapId: "1002",
        redScore: 500000,
        blueScore: 800000,
        pickerNick: "OmegaBlue",
      }),
    );
    expect(result.state.scoreRed).toBe(1);
    expect(result.state.scoreBlue).toBe(1);
    expect(result.state.currentPicker).toBe("Red");
    expect(result.state.liveScores).toEqual([]);
  });

  test("does not import maps when saved and API histories disagree", async () => {
    jest
      .spyOn(osuService, "getUser")
      .mockResolvedValueOnce({ id: 111111, username: "AlphaRed" })
      .mockResolvedValueOnce({ id: 222222, username: "OmegaBlue" });
    jest.spyOn(osuService, "getMatchData").mockResolvedValue({
      match: { name: "Test Lobby" },
      games: [
        {
          game_id: "501",
          beatmap_id: "1002",
          end_time: "2026-06-13 12:00:00",
          scores: [],
        },
      ],
    });
    global.mockDb.get.mockResolvedValueOnce({
      mod_id: "HD1",
      category: "HD",
    });

    const result = await ircService.recoverSavedMonitorSession({
      mpId: "1234",
      state: {
        teamRed: "AlphaRed",
        teamBlue: "OmegaBlue",
        stage: "Quarter Finals",
        history: [{ mapId: "1001", mod: "NM1" }],
      },
    });

    expect(result.recoveredCount).toBe(0);
    expect(result.warning).toContain("does not match");
    expect(result.state.history).toEqual([{ mapId: "1001", mod: "NM1" }]);
  });
});
