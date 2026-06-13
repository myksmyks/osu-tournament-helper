const axios = require("axios");
const osuService = require("../../src/services/osuService");

describe("osu! API Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    osuService.token = null;
    osuService.expiry = 0;
  });

  test("retrieves and caches OAuth access tokens", async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        access_token: "mock-access-token",
        expires_in: 3600,
      },
    });

    const token = await osuService.getAccessToken();

    expect(token).toBe("mock-access-token");
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test("uses cached access tokens if they are not expired yet", async () => {
    osuService.token = "cached-token";
    osuService.expiry = Date.now() + 100000;

    const token = await osuService.getAccessToken();

    expect(token).toBe("cached-token");
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("fetches beatmap metadata and formats attributes", async () => {
    osuService.token = "valid-token";
    osuService.expiry = Date.now() + 100000;

    axios.get.mockResolvedValueOnce({
      data: {
        beatmapset: { title: "Test Map Name" },
        version: "Insane",
      },
    });

    axios.post.mockResolvedValueOnce({
      data: {
        attributes: { star_rating: 5.6789 },
      },
    });

    const mapInfo = await osuService.getMapInfo("12345", "NM1", "NM");

    expect(mapInfo).toBe("[NM1] Test Map Name [Insane] (5.68⭐)");
  });

  test("handles getUser lookup errors cleanly and returns null", async () => {
    osuService.token = "valid-token";
    osuService.expiry = Date.now() + 100000;

    axios.get.mockRejectedValueOnce(new Error("User not found"));

    const user = await osuService.getUser("UnknownPlayer");
    expect(user).toBeNull();
  });

  test("fetches legacy multiplayer lobby data successfully", async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        match: { name: "Test Lobby Name" },
        games: [],
      },
    });

    const match = await osuService.getMatchData("1234");
    expect(match.match.name).toBe("Test Lobby Name");
  });

  test("handles legacy multiplayer lobby lookup failures safely", async () => {
    axios.get.mockRejectedValueOnce(new Error("API Timeout"));

    const match = await osuService.getMatchData("1234");
    expect(match).toBeNull();
  });
});
