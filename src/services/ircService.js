const Banchojs = require("bancho.js");
const osuService = require("./osuService");
const { getDatabase } = require("../database/db");
const { getLiveMatchBans } = require("./syncSheets");
const challongeService = require("./challongeService");
const { createMatchEmbed } = require("./embedService");
const { cleanStageName, normalizeName } = require("../utils/textUtils");
const logger = require("./logger");

class IrcService {
  constructor() {
    this.client = new Banchojs.BanchoClient({
      username: process.env.OSU_IRC_USERNAME,
      password: process.env.OSU_IRC_PASSWORD,
    });
    this.connected = false;
    this.activeLobbies = new Map();
    this.updateTimers = new Map();
    this.pollingTimers = new Map();
  }

  async connect() {
    if (this.connected && this.client.isConnected()) return;
    logger.info("IRC", "Connecting to Bancho...");
    try {
      await this.client.connect();
      this.connected = true;
      logger.info("IRC", "Connected to Bancho.");
    } catch (e) {
      logger.error("IRC", "Failed to connect to Bancho", e);
    }
  }

  async sendMessage(target, msg) {
    await this.connect();
    try {
      await this.client.getUser(target).sendMessage(msg);
      logger.info("IRC", `Sent PM to ${target}`);
    } catch (e) {
      logger.error("IRC", `Failed to message ${target}`, e);
    }
  }

  scheduleUpdate(mpId) {
    const state = this.activeLobbies.get(mpId);
    if (state && state.isDone) return;

    if (this.updateTimers.has(mpId)) {
      clearTimeout(this.updateTimers.get(mpId));
    }
    this.updateTimers.set(
      mpId,
      setTimeout(() => {
        this.updateDiscord(mpId);
      }, 1500),
    );
  }

  async monitorLobby(mpId, discordMessages, teamRed, teamBlue, dbMatchId) {
    logger.info(
      "IRC",
      `Monitoring started for Match ${dbMatchId} (Lobby #${mpId})`,
    );

    if (!this.client.isConnected()) {
      logger.warn("IRC", "Client disconnected. Reconnecting...");
      await this.connect();
      if (!this.client.isConnected()) {
        throw new Error("Unable to connect to Bancho IRC.");
      }
    }

    const channel = this.client.getChannel(`#mp_${mpId}`);
    await channel.join();
    logger.info("IRC", `Joined channel #mp_${mpId}`);

    const db = await getDatabase();
    const matchData = await db.get(
      "SELECT stage FROM matches WHERE match_id = ?",
      [dbMatchId],
    );
    const stageName = matchData ? matchData.stage : "Tournament Match";
    logger.info("IRC", `Match ${dbMatchId} identified as stage: ${stageName}`);

    const state = {
      dbMatchId: dbMatchId,
      mpId: mpId,
      teamRed: teamRed,
      teamBlue: teamBlue,
      stage: stageName,
      messages: Array.isArray(discordMessages)
        ? discordMessages
        : [discordMessages],
      scoreRed: 0,
      scoreBlue: 0,
      currentMapID: null,
      currentMapName: "Waiting for pick...",
      currentMapNameFull: "Waiting for pick...",
      currentPicker: "Not decided",
      status: "Lobby Connected",
      history: [],
      redBansRaw: [],
      blueBansRaw: [],
      redBansFormatted: "_None_",
      blueBansFormatted: "_None_",
      liveScores: new Map(),
      redAliases: [normalizeName(teamRed), "red", "redteam"],
      blueAliases: [normalizeName(teamBlue), "blue", "blueteam"],
      isDone: false,
      isCalculating: false,
      channel: channel,
    };

    this.activeLobbies.set(mpId, state);

    const handleText = async (msg) => {
      if (state.isDone) return;
      const text = msg.message;

      const mapMatch = text.match(
        /https:\/\/osu\.ppy\.sh\/(?:b|beatmaps)\/(\d+)/i,
      );
      if (mapMatch) {
        const id = mapMatch[1];
        state.currentMapID = id;
        state.status = "Changing Map...";
        logger.info("IRC", `Lobby #${mpId} changed map to: ${id}`);

        const poolData = await db.get(
          "SELECT mod_id, category FROM mappool WHERE map_id = ? AND stage = ?",
          [id, cleanStageName(state.stage)],
        );

        state.lastMapIsWarmup = !poolData;
        const mapInfo = await osuService.getMapInfo(
          id,
          poolData?.mod_id || "Warmup",
          poolData?.category || "NM",
        );
        state.currentMapNameFull = mapInfo;
        state.currentMapName = mapInfo
          .replace(/^\[.*?\]\s*/, "")
          .replace(/\s\(\d+\.\d+⭐\)$/, "");

        logger.info(
          "IRC",
          `Identified map: ${mapInfo} (Pool: ${!state.lastMapIsWarmup})`,
        );
        this.scheduleUpdate(mpId);
        return;
      }

      if (text.toLowerCase().includes("the match has started")) {
        logger.info("IRC", `Match has started on #${mpId}`);
        state.status = "🔴 LIVE";
        state.liveScores.clear();
        this.scheduleUpdate(mpId);
      }

      const finishRegex =
        /^(.+?) finished playing \(Score: (\d+), (PASSED|FAILED)\)\./i;
      const finishMatch = text.match(finishRegex);
      if (finishMatch) {
        const name = normalizeName(finishMatch[1]);
        const score = parseInt(finishMatch[2]);
        state.liveScores.set(name, finishMatch[3] === "PASSED" ? score : 0);
        logger.debug("IRC", `${finishMatch[1]} -> ${score.toLocaleString()}`);
      }

      if (text.toLowerCase().includes("the match has finished")) {
        logger.info(
          "IRC",
          `Match finished on #${mpId}. Calculating results...`,
        );
        let totalRed = 0;
        let totalBlue = 0;

        state.liveScores.forEach((score, name) => {
          if (state.redAliases.includes(name)) totalRed += score;
          else if (state.blueAliases.includes(name)) totalBlue += score;
        });

        await this.calculateWinner(mpId, totalRed, totalBlue);
      }

      if (
        text.toLowerCase().includes("!mp close") ||
        text.toLowerCase().includes("room closed")
      ) {
        logger.info("IRC", `Closure detected via IRC message on #${mpId}`);
        await this.finalizeMatch(mpId);
      }
    };

    channel.on("PART", async (member) => {
      if (member.user.ircUsername === this.client.ircUsername) {
        logger.info("IRC", `Bot was removed from #${mpId}. Finalizing...`);
        try {
          await this.finalizeMatch(mpId);
        } catch (error) {
          logger.error("IRC", `Failed to finalize lobby #${mpId}`, error);
        }
      }
    });

    channel.on("message", async (message) => {
      try {
        await handleText(message);
      } catch (error) {
        logger.error(
          "IRC",
          `Failed to process message in lobby #${mpId}`,
          error,
        );
      }
    });

    this.startSheetPolling(mpId);
    await channel.sendMessage("!mp settings");
    await this.updateDiscord(mpId);
  }

  async resolveBanLinks(modList, stage) {
    const db = await getDatabase();
    const resolved = [];
    for (const mod of modList) {
      if (!mod) continue;
      const mapEntry = await db.get(
        "SELECT map_id FROM mappool WHERE mod_id = ? AND stage = ?",
        [mod.toUpperCase(), cleanStageName(stage)],
      );
      if (mapEntry) {
        const rawInfo = await osuService.getMapInfo(
          mapEntry.map_id,
          mod.toUpperCase(),
          "Banned",
        );
        const cleanName = rawInfo
          .replace(/^\[.*?\]\s*/, "")
          .replace(/\s\(\d+\.\d+⭐\)$/, "");
        resolved.push(
          `**${mod.toUpperCase()}**: [${cleanName}](https://osu.ppy.sh/b/${mapEntry.map_id})`,
        );
      } else {
        resolved.push(`**${mod.toUpperCase()}**`);
      }
    }
    return resolved.length > 0 ? resolved.join("\n") : "_None_";
  }

  async startSheetPolling(mpId) {
    const poll = async () => {
      const state = this.activeLobbies.get(mpId);
      if (!state || state.isDone) return;

      try {
        logger.debug(
          "IRC",
          `Scanning Match ${state.dbMatchId} for new bans/picks...`,
        );
        const data = await getLiveMatchBans(state.dbMatchId);

        if (data) {
          const rawChanged =
            JSON.stringify(data.redBans) !== JSON.stringify(state.redBansRaw) ||
            JSON.stringify(data.blueBans) !== JSON.stringify(state.blueBansRaw);

          if (rawChanged) {
            state.redBansRaw = data.redBans;
            state.blueBansRaw = data.blueBans;
            state.redBansFormatted = await this.resolveBanLinks(
              data.redBans,
              state.stage,
            );
            state.blueBansFormatted = await this.resolveBanLinks(
              data.blueBans,
              state.stage,
            );
            logger.info("IRC", `Bans updated for Match ${state.dbMatchId}`);
          }

          if (state.history.length === 0) {
            state.currentPicker = data.firstPicker;
          }
          this.scheduleUpdate(mpId);
        }
      } catch (error) {
        logger.error(
          "IRC",
          `Sheet polling failed for Match ${state.dbMatchId}`,
          error,
        );
      } finally {
        const currentState = this.activeLobbies.get(mpId);
        if (currentState && !currentState.isDone) {
          this.pollingTimers.set(mpId, setTimeout(poll, 25000));
        }
      }
    };
    void poll();
  }

  async calculateWinner(mpId, r, b) {
    const state = this.activeLobbies.get(mpId);
    if (!state || state.isCalculating) return;
    state.isCalculating = true;

    if (!state.lastMapIsWarmup) {
      const db = await getDatabase();
      const poolData = await db.get(
        "SELECT mod_id FROM mappool WHERE map_id = ? AND stage = ?",
        [state.currentMapID, cleanStageName(state.stage)],
      );
      const mod = poolData ? poolData.mod_id.toUpperCase() : "??";

      const isTB = mod.startsWith("TB");
      const pickerNick = isTB
        ? null
        : state.currentPicker === "Red"
          ? state.teamRed
          : state.teamBlue;

      state.history.push({
        mod,
        mapId: state.currentMapID,
        mapName: state.currentMapName,
        redScore: r,
        blueScore: b,
        pickerNick: pickerNick,
      });

      logger.info("IRC", `Map ${mod} finished. Red: ${r} - Blue: ${b}`);
      this.recalculateTotals(mpId);

      if (!isTB) {
        if (state.currentPicker === "Red") state.currentPicker = "Blue";
        else if (state.currentPicker === "Blue") state.currentPicker = "Red";
      }
    } else {
      logger.info("IRC", "Warmup map finished. Scores ignored.");
    }

    state.status = "Picking Map";
    state.isCalculating = false;
    this.scheduleUpdate(mpId);
  }

  recalculateTotals(mpId) {
    const state = this.activeLobbies.get(mpId);
    if (!state) return;
    state.scoreRed = 0;
    state.scoreBlue = 0;
    state.history.forEach((m) => {
      if (m.redScore > m.blueScore) state.scoreRed++;
      else if (m.blueScore > m.redScore) state.scoreBlue++;
    });
  }

  async editMapScore(mpId, mod, redScore, blueScore) {
    const state = this.activeLobbies.get(mpId);
    if (!state) return;

    const index = state.history.findIndex(
      (m) => m.mod.toUpperCase() === mod.toUpperCase(),
    );

    if (index !== -1) {
      logger.info("IRC", `Manual update of existing ${mod} score.`);
      state.history[index].redScore = redScore;
      state.history[index].blueScore = blueScore;
    } else {
      logger.info("IRC", `Manual insertion of missing ${mod} score.`);
      const db = await getDatabase();
      const mapEntry = await db.get(
        "SELECT map_id FROM mappool WHERE mod_id = ? AND stage = ?",
        [mod.toUpperCase(), cleanStageName(state.stage)],
      );
      if (!mapEntry) throw new Error("Mod not found in pool");

      const mapName = await osuService.getMapInfo(
        mapEntry.map_id,
        mod.toUpperCase(),
        "Manual",
      );
      const cleanName = mapName
        .replace(/^\[.*?\]\s*/, "")
        .replace(/\s\(\d+\.\d+⭐\)$/, "");

      state.history.push({
        mod: mod.toUpperCase(),
        mapId: mapEntry.map_id,
        mapName: cleanName,
        redScore: redScore,
        blueScore: blueScore,
        pickerNick: mod.toUpperCase().startsWith("TB") ? null : "Manual Entry",
      });
    }

    this.recalculateTotals(mpId);
    this.scheduleUpdate(mpId);
  }

  getLobbyByMatchId(dbMatchId) {
    for (const [mpId, state] of this.activeLobbies.entries()) {
      if (state.dbMatchId === dbMatchId) return mpId;
    }
    return null;
  }

  async finalizeMatch(mpId) {
    const state = this.activeLobbies.get(mpId);
    if (!state || state.isDone) return;

    if (this.updateTimers.has(mpId)) {
      clearTimeout(this.updateTimers.get(mpId));
      this.updateTimers.delete(mpId);
    }

    state.isDone = true;
    state.status = "🏁 Match Finished";

    logger.info(
      "IRC",
      `Lobby #${mpId} closed. Sending final Discord update...`,
    );
    await this.updateDiscord(mpId, true);

    await challongeService.updateChallongeMatch(
      state.teamRed,
      state.teamBlue,
      state.scoreRed,
      state.scoreBlue,
    );

    if (this.pollingTimers.has(mpId)) {
      clearTimeout(this.pollingTimers.get(mpId));
      this.pollingTimers.delete(mpId);
    }
    this.activeLobbies.delete(mpId);
    logger.info("IRC", `🛑 Monitoring ended for #${mpId}`);
  }

  async updateDiscord(mpId, isFinal = false) {
    const state = this.activeLobbies.get(mpId);
    if (!state) return;

    try {
      const nextPickerNick =
        state.currentPicker === "Red"
          ? state.teamRed
          : state.currentPicker === "Blue"
            ? state.teamBlue
            : state.currentPicker;

      const embed = createMatchEmbed({
        stage: state.stage,
        teamRed: state.teamRed,
        teamBlue: state.teamBlue,
        scoreRed: state.scoreRed,
        scoreBlue: state.scoreBlue,
        mpId: state.mpId,
        status: state.status,
        nextPicker: nextPickerNick,
        currentMapID: state.currentMapID,
        currentMapNameFull: state.currentMapNameFull,
        redBansFormatted: state.redBansFormatted,
        blueBansFormatted: state.blueBansFormatted,
        history: state.history,
        isFinal: isFinal,
        dbMatchId: state.dbMatchId,
      });

      for (const msg of state.messages) {
        try {
          await msg.edit({ content: "", embeds: [embed] });
        } catch (e) {
          logger.error(
            "IRC",
            `Failed to update Discord message in channel ${msg.channelId}`,
            e,
          );
        }
      }
      logger.info(
        "IRC",
        `Match ID ${state.dbMatchId} Discord update published.`,
      );
    } catch (err) {
      logger.error("IRC", "Critical error rendering Discord embed update", err);
    }
  }

  async processManualMatch(mpId, matchId, discordMessages) {
    logger.info(
      "IRC",
      `Starting manual processing for Match ${matchId} (Lobby #${mpId})...`,
    );

    try {
      const db = await getDatabase();
      const match = await db.get("SELECT * FROM matches WHERE match_id = ?", [
        matchId,
      ]);
      if (!match) throw new Error("Match not found in database.");

      const teamRed = match.team_red || match.team_1;
      const teamBlue = match.team_blue;
      const stage = cleanStageName(match.stage);

      const state = {
        dbMatchId: matchId,
        mpId,
        teamRed,
        teamBlue,
        stage: match.stage,
        messages: discordMessages,
        scoreRed: 0,
        scoreBlue: 0,
        currentMapID: null,
        currentMapName: "",
        currentMapFull: "",
        currentPicker: "Not decided",
        status: "Processing API...",
        history: [],
        liveScores: new Map(),
        redAliases: [normalizeName(teamRed), "red"],
        blueAliases: [normalizeName(teamBlue), "blue"],
        isDone: false,
        isCalculating: false,
        channel: null,
      };
      this.activeLobbies.set(mpId, state);

      const redUser = await osuService.getUser(teamRed);
      const blueUser = await osuService.getUser(teamBlue);
      const apiData = await osuService.getMatchData(mpId);
      const sheetData = await getLiveMatchBans(matchId);

      if (!apiData || !Array.isArray(apiData.games)) {
        throw new Error(`Could not load multiplayer data for lobby #${mpId}.`);
      }

      if (!redUser || !blueUser) {
        throw new Error(
          `Could not find players on osu! (Red: ${teamRed}, Blue: ${teamBlue})`,
        );
      }

      const redId = String(redUser.id);
      const blueId = String(blueUser.id);
      logger.info(
        "IRC",
        `IDs mapped - Red (${teamRed}): ${redId} | Blue (${teamBlue}): ${blueId}`,
      );

      if (sheetData) {
        state.redBansFormatted = await this.resolveBanLinks(
          sheetData.redBans,
          state.stage,
        );
        state.blueBansFormatted = await this.resolveBanLinks(
          sheetData.blueBans,
          state.stage,
        );
        state.currentPicker = sheetData.firstPicker;
      }

      for (const game of apiData.games) {
        const poolData = await db.get(
          "SELECT mod_id, category FROM mappool WHERE map_id = ? AND stage = ?",
          [game.beatmap_id, stage],
        );
        if (!poolData) {
          logger.debug(
            "IRC",
            `Skipping Map ${game.beatmap_id} (Not in pool/Warmup)`,
          );
          continue;
        }

        state.currentMapID = game.beatmap_id;

        const mapInfo = await osuService.getMapInfo(
          game.beatmap_id,
          poolData.mod_id,
          poolData.category || "NM",
        );
        state.currentMapFull = mapInfo;
        state.currentMapName = mapInfo
          .replace(/^\[.*?\]\s*/, "")
          .replace(/\s\(\d+\.\d+⭐\)$/, "");

        let r = 0,
          b = 0;
        game.scores.forEach((s) => {
          if (String(s.user_id) === redId) r += parseInt(s.score);
          if (String(s.user_id) === blueId) b += parseInt(s.score);
        });

        logger.info(
          "IRC",
          `Map ${poolData.mod_id} Result: Red ${r} - Blue ${b}`,
        );

        state.lastMapIsWarmup = false;
        await this.calculateWinner(mpId, r, b);
      }

      await this.finalizeMatch(mpId);
      logger.info("IRC", `Manual match ${matchId} processed successfully.`);
    } catch (err) {
      logger.error(
        "IRC",
        `Manual match processing error for Match ${matchId}`,
        err,
      );
      this.activeLobbies.delete(mpId);
      throw err;
    }
  }
}

module.exports = new IrcService();
