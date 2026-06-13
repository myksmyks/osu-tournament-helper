const { EventEmitter } = require("events");
const path = require("path");

process.env.CONFIG_PATH = path.join(__dirname, "..", "config.example.json");
process.env.TOKEN = "mock-token";
process.env.CLIENT_ID = "mock-client-id";
process.env.OSU_CLIENT_ID = "mock-osu-id";
process.env.OSU_CLIENT_SECRET = "mock-osu-secret";
process.env.GOOGLE_SHEET_ID = "mock-sheet-id";
process.env.GOOGLE_SHEET_NAME = "Quals";
process.env.GOOGLE_SHEET_NAME2 = "Bracket";
process.env.TOURNAMENT = "mock-tournament";
process.env.CHALLONGE_API = "mock-challonge-key";
process.env.CHANNEL_ID_SERVER_A = "111111111111111111";
process.env.CHANNEL_ID_SERVER_B = "222222222222222222";

class MockChannel {
  constructor(id, name = "test-channel") {
    this.id = id;
    this.name = name;
    this.send = jest
      .fn()
      .mockResolvedValue({
        edit: jest.fn().mockResolvedValue(true),
        id: "msg-123",
      });
  }
  permissionsFor() {
    return {
      has: () => true,
    };
  }
}

class MockClient extends EventEmitter {
  constructor() {
    super();
    this.user = { tag: "Bot#1234", id: "bot-id" };
    this.channels = {
      fetch: jest
        .fn()
        .mockImplementation((id) => Promise.resolve(new MockChannel(id))),
      cache: new Map(),
    };
    this.reminderChannels = new Map();
  }
}

jest.mock("discord.js", () => {
  const actual = jest.requireActual("discord.js");
  return {
    ...actual,
    Client: MockClient,
    REST: jest.fn().mockImplementation(() => ({
      setToken: jest.fn().mockReturnThis(),
      put: jest.fn().mockResolvedValue(true),
    })),
  };
});

const mockDb = {
  exec: jest.fn().mockResolvedValue(true),
  all: jest.fn().mockResolvedValue([]),
  get: jest.fn().mockImplementation((query) => {
    if (query.includes("FROM matches")) {
      return Promise.resolve({
        stage: "Quarter Finals",
        team_red: "AlphaRed",
        team_blue: "OmegaBlue",
        mp_link: "https://osu.ppy.sh/mp/1234",
      });
    }
    if (query.includes("FROM mappool")) {
      return Promise.resolve({ mod_id: "NM1", category: "NM" });
    }
    if (query.includes("FROM users")) {
      return Promise.resolve({ discord_id: "123456" });
    }
    return Promise.resolve(null);
  }),
  run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
  prepare: jest.fn().mockResolvedValue({
    run: jest.fn().mockResolvedValue(true),
    finalize: jest.fn().mockResolvedValue(true),
  }),
};

jest.mock("sqlite", () => ({
  open: jest.fn().mockResolvedValue(mockDb),
}));

const mockGetValues = jest.fn().mockResolvedValue({ data: { values: [] } });
const mockGetSpreadsheet = jest.fn();

jest.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({}),
      })),
    },
    sheets: jest.fn().mockReturnValue({
      spreadsheets: {
        get: mockGetSpreadsheet,
        values: {
          get: mockGetValues,
        },
      },
    }),
  },
}));

class MockBanchoClient extends EventEmitter {
  constructor() {
    super();
    this.ircUsername = "BanchoBot";
    this.channels = new Map();
  }
  connect() {
    return Promise.resolve();
  }
  isConnected() {
    return true;
  }
  getChannel(name) {
    if (this.channels.has(name)) {
      return this.channels.get(name);
    }
    const ch = new EventEmitter();
    ch.name = name;
    ch.join = jest.fn().mockResolvedValue(true);
    ch.sendMessage = jest.fn().mockResolvedValue(true);
    this.channels.set(name, ch);
    return ch;
  }
  getUser(username) {
    return {
      sendMessage: jest.fn().mockResolvedValue(true),
    };
  }
}

jest.mock("bancho.js", () => ({
  BanchoClient: MockBanchoClient,
}));

jest.mock("axios");

global.mockDb = mockDb;
global.mockGetValues = mockGetValues;
global.mockGetSpreadsheet = mockGetSpreadsheet;
