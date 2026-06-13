const axios = require("axios");
const logger = require("./logger");

class OsuService {
  constructor() {
    this.token = null;
    this.expiry = 0;
  }

  async getAccessToken() {
    if (this.token && Date.now() < this.expiry) return this.token;

    logger.info(
      "OSU_API",
      "OAuth token missing or expired. Requesting a new token...",
    );
    try {
      const response = await axios.post("https://osu.ppy.sh/oauth/token", {
        client_id: process.env.OSU_CLIENT_ID,
        client_secret: process.env.OSU_CLIENT_SECRET,
        grant_type: "client_credentials",
        scope: "public",
      });

      this.token = response.data.access_token;
      this.expiry = Date.now() + (response.data.expires_in - 60) * 1000;
      logger.info(
        "OSU_API",
        `New token generated. Expires in ${response.data.expires_in}s.`,
      );
      return this.token;
    } catch (err) {
      logger.error(
        "OSU_API",
        "Authentication failed",
        err.response?.data || err.message,
      );
      throw err;
    }
  }

  async getUser(id) {
    logger.debug("OSU_API", `Fetching data for user: ${id}`);
    const token = await this.getAccessToken();
    try {
      const res = await axios.get(
        `https://osu.ppy.sh/api/v2/users/${encodeURIComponent(id)}/osu`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      logger.debug(
        "OSU_API",
        `Successfully resolved user: ${res.data.username}`,
      );
      return res.data;
    } catch (e) {
      logger.warn("OSU_API", `User lookup failed for ${id}: ${e.message}`);
      return null;
    }
  }

  async getMapInfo(mapId, modLabel = "Warmup", category = "NM") {
    logger.debug(
      "OSU_API",
      `Fetching map attributes for ${mapId} (Category: ${category})`,
    );
    const token = await this.getAccessToken();

    let apiMods = [];
    if (category === "DT") apiMods = ["DT"];
    if (category === "HR") apiMods = ["HR"];
    if (category === "EZ") apiMods = ["EZ"];
    if (category === "FL") apiMods = ["FL"];

    try {
      const [mapRes, attrRes] = await Promise.all([
        axios.get(`https://osu.ppy.sh/api/v2/beatmaps/${mapId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.post(
          `https://osu.ppy.sh/api/v2/beatmaps/${mapId}/attributes`,
          { mods: apiMods, ruleset: "osu" },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        ),
      ]);

      const map = mapRes.data;
      const title = map.beatmapset.title;
      const version = map.version;
      const realSR = attrRes.data.attributes.star_rating.toFixed(2);

      return `[${modLabel}] ${title} [${version}] (${realSR}⭐)`;
    } catch (e) {
      logger.error(
        "OSU_API",
        `Failed to fetch beatmap attributes for ${mapId}`,
        e.response?.data || e.message,
      );
      return `Unknown Map (${mapId})`;
    }
  }

  async getMatchData(mpId) {
    try {
      const response = await axios.get(`https://osu.ppy.sh/api/get_match`, {
        params: {
          k: process.env.OSU_API_KEY,
          mp: mpId,
        },
      });
      if (!response.data || !response.data.match)
        throw new Error("Match not found");
      return response.data;
    } catch (e) {
      logger.error(
        "OSU_API",
        `getMatchData failed for lobby #${mpId}: ${e.message}`,
      );
      return null;
    }
  }
}

module.exports = new OsuService();
