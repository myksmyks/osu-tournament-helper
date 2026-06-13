const axios = require("axios");
const { updateChallongeMatch } = require("../../src/services/challongeService");

describe("Challonge Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("correctly maps teams, updates score, and sets the winner on Challonge", async () => {
    const mockMatches = [
      {
        match: {
          id: 101,
          player1_id: 1,
          player2_id: 2,
        },
      },
    ];

    const mockParticipants = [
      { participant: { id: 1, name: "AlphaRed" } },
      { participant: { id: 2, name: "OmegaBlue" } },
    ];

    axios.get
      .mockResolvedValueOnce({ data: mockMatches })
      .mockResolvedValueOnce({ data: mockParticipants });

    axios.put.mockResolvedValueOnce({ data: { match: { id: 101 } } });

    await updateChallongeMatch("AlphaRed", "OmegaBlue", 5, 3);

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining("/101.json"),
      {
        match: { scores_csv: "5-3", winner_id: 1 },
      },
    );
  });

  test("reverses csv mapping when teams are reversed in Challonge schedule", async () => {
    const mockMatches = [
      {
        match: {
          id: 102,
          player1_id: 2,
          player2_id: 1,
        },
      },
    ];

    const mockParticipants = [
      { participant: { id: 1, name: "AlphaRed" } },
      { participant: { id: 2, name: "OmegaBlue" } },
    ];

    axios.get
      .mockResolvedValueOnce({ data: mockMatches })
      .mockResolvedValueOnce({ data: mockParticipants });

    axios.put.mockResolvedValueOnce({ data: { match: { id: 102 } } });

    await updateChallongeMatch("AlphaRed", "OmegaBlue", 5, 3);

    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining("/102.json"),
      {
        match: { scores_csv: "3-5", winner_id: 1 },
      },
    );
  });

  test("exits early if Challonge environmental credentials are missing", async () => {
    const originalApiKey = process.env.CHALLONGE_API;
    delete process.env.CHALLONGE_API;

    await updateChallongeMatch("AlphaRed", "OmegaBlue", 5, 3);

    expect(axios.get).not.toHaveBeenCalled();

    process.env.CHALLONGE_API = originalApiKey;
  });

  test("handles Challonge API request exceptions gracefully", async () => {
    axios.get.mockRejectedValueOnce(new Error("Network connection dropped"));

    await updateChallongeMatch("AlphaRed", "OmegaBlue", 5, 3);

    expect(axios.put).not.toHaveBeenCalled();
  });
});
