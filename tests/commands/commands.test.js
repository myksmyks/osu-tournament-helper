const forfeitCommand = require("../../src/commands/admin/forfeit");
const osusetCommand = require("../../src/commands/osu/osuset");
const editscoreCommand = require("../../src/commands/admin/editscore");
const monitorCommand = require("../../src/commands/admin/monitor");
const syncSheets = require("../../src/services/syncSheets");
const ircService = require("../../src/services/ircService");

describe("Discord Commands Interface", () => {
  let mockInteraction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockInteraction = {
      guildId: "1234",
      channelId: "5678",
      user: { id: "9876", tag: "User#1234" },
      options: {
        getSubcommand: jest.fn(),
        getString: jest.fn(),
        getInteger: jest.fn(),
        getBoolean: jest.fn(),
      },
      deferReply: jest.fn().mockResolvedValue(true),
      editReply: jest.fn().mockResolvedValue(true),
      client: {
        channels: {
          fetch: jest.fn().mockResolvedValue({
            send: jest.fn().mockResolvedValue(true),
            permissionsFor: () => ({ has: () => true }),
          }),
        },
      },
    };
  });

  describe("Forfeit Command", () => {
    test("sets forfeit outcomes and updates local databases and Challonge", async () => {
      mockInteraction.options.getString
        .mockReturnValueOnce("32")
        .mockReturnValueOnce("Red");

      jest.spyOn(syncSheets, "getFirstToValue").mockResolvedValue(5);

      await forfeitCommand.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("won **5-FF**"),
      );
    });
  });

  describe("osu! Account Association", () => {
    test("handles users who are already verified", async () => {
      mockInteraction.options.getString.mockReturnValueOnce("AlphaPlayer");

      global.mockDb.get.mockResolvedValueOnce({
        discord_id: "9876",
        osu_username: "AlphaPlayer",
        is_verified: 1,
      });

      await osusetCommand.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("already verified"),
        }),
      );
    });
  });

  describe("Edit Score Command", () => {
    test("returns an error if the targeted match lobby is not actively monitored", async () => {
      mockInteraction.options.getString
        .mockReturnValueOnce("32")
        .mockReturnValueOnce("NM1");
      mockInteraction.options.getInteger
        .mockReturnValueOnce(500000)
        .mockReturnValueOnce(400000);

      jest.spyOn(ircService, "getLobbyByMatchId").mockReturnValue(null);

      await editscoreCommand.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("Match not active"),
      );
    });
  });

  describe("Monitor Command", () => {
    test("resumes a saved monitor session using the original messages", async () => {
      mockInteraction.options.getSubcommand.mockReturnValue("resume");
      mockInteraction.options.getString.mockReturnValue("32");
      const savedSession = {
        mpId: "1234",
        state: {
          teamRed: "AlphaRed",
          teamBlue: "OmegaBlue",
          scoreRed: 2,
          scoreBlue: 1,
        },
        messages: [{ channelId: "99999", messageId: "message-1" }],
      };
      const restoredMessages = [
        { id: "message-1", channelId: "99999", edit: jest.fn() },
      ];
      jest
        .spyOn(ircService, "getLobbyByMatchId")
        .mockReturnValueOnce(null);
      jest
        .spyOn(ircService, "getSavedMonitorSession")
        .mockResolvedValueOnce(savedSession);
      jest
        .spyOn(ircService, "restoreDiscordMessages")
        .mockResolvedValueOnce(restoredMessages);
      jest
        .spyOn(ircService, "recoverSavedMonitorSession")
        .mockResolvedValueOnce({
          state: savedSession.state,
          recoveredCount: 1,
          warning: null,
        });
      const monitorSpy = jest
        .spyOn(ircService, "monitorLobby")
        .mockResolvedValueOnce();

      await monitorCommand.execute(mockInteraction);

      expect(monitorSpy).toHaveBeenCalledWith(
        "1234",
        restoredMessages,
        "AlphaRed",
        "OmegaBlue",
        "32",
        {
          isResume: true,
          restoredState: savedSession.state,
        },
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("Recovered **1** completed map"),
      );
    });
  });
});
