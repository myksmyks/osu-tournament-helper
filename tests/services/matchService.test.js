const {
  runReminders,
  availability,
} = require("../../src/services/matchService");
const { config } = require("../../src/config");
const moment = require("moment-timezone");

describe("Match Service", () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    config.discord.streamerCommsChannelId = "";
    config.discord.commsChannelId = "";
    for (const group of Object.values(config.discord.availability)) {
      group.channelId = "";
      group.roleId = "";
    }
    mockClient = {
      channels: {
        fetch: jest.fn().mockImplementation((id) => {
          return Promise.resolve({
            id,
            send: jest.fn().mockResolvedValue({ id: "msg-id" }),
            permissionsFor: () => ({ has: () => true }),
          });
        }),
      },
    };
  });

  test("sends scheduled reminders when there are matches starting in exactly 20 minutes", async () => {
    const targetReminderTime = moment().tz("UTC").add(20, "minutes");
    const testDate = targetReminderTime.format("MMM D");
    const testTime = targetReminderTime.format("HH:mm");

    const mockMatches = [
      {
        match_id: "32",
        stage: "Bracket",
        date: `(Fri) ${testDate}`,
        time: testTime,
        team_red: "AlphaRed",
        team_blue: "OmegaBlue",
        score_red: 0,
        score_blue: 0,
        streamer: "StreamerName",
        referee: "RefereeName",
        comms_1: "Caster1",
        comms_2: "Caster2",
      },
    ];

    global.mockDb.all.mockResolvedValueOnce(mockMatches);
    global.mockDb.get.mockResolvedValue({ discord_id: "123456789" });

    config.discord.streamerCommsChannelId = "4444";
    config.discord.commsChannelId = "5555";

    await runReminders(mockClient);

    expect(mockClient.channels.fetch).toHaveBeenCalledWith("4444");
    expect(mockClient.channels.fetch).toHaveBeenCalledWith("5555");
  });

  test("broadcasts availability sign-up links", async () => {
    config.discord.availability.streamers = {
      channelId: "111",
      roleId: "444",
    };
    config.discord.availability.referees = {
      channelId: "222",
      roleId: "555",
    };
    config.discord.availability.commentators = {
      channelId: "333",
      roleId: "666",
    };
    process.env.STREAMER_AVAILABILITY_URL = "https://example.com/streamers";
    process.env.REFEREE_AVAILABILITY_URL = "https://example.com/referees";
    process.env.COMMS_AVAILABILITY_URL = "https://example.com/comms";

    await availability(mockClient);

    expect(mockClient.channels.fetch).toHaveBeenCalledWith("111");
    expect(mockClient.channels.fetch).toHaveBeenCalledWith("222");
    expect(mockClient.channels.fetch).toHaveBeenCalledWith("333");
  });

  test("skips availability pings when their configuration is missing", async () => {
    await availability(mockClient);

    expect(mockClient.channels.fetch).not.toHaveBeenCalled();
  });

  test("handles unavailable availability channels without throwing", async () => {
    config.discord.availability.streamers = {
      channelId: "111",
      roleId: "444",
    };
    config.discord.availability.referees = {
      channelId: "222",
      roleId: "555",
    };
    config.discord.availability.commentators = {
      channelId: "333",
      roleId: "666",
    };
    process.env.STREAMER_AVAILABILITY_URL = "https://example.com/streamers";
    process.env.REFEREE_AVAILABILITY_URL = "https://example.com/referees";
    process.env.COMMS_AVAILABILITY_URL = "https://example.com/comms";
    mockClient.channels.fetch.mockRejectedValue(new Error("Missing channel"));

    await expect(availability(mockClient)).resolves.toBeUndefined();
  });
});
