import { redis } from "./database.js";
import axios from "axios";
import config from "config";
import logger from "./logger.js";
import { decrypt } from "./cryptoUtils.js";
import adminModel from "../core/v1/admin/admin.model.js";
const api_host = config.get("RTSPStream.host");
const api_token = config.get("RTSPStream.token");
const terminateHost = config.get("RTSPStream.terminateHost");
const APP_ENV = config.get("APP_ENV");

// Resolve the RTSP stream host + token for a given resource owner. A specific
// admin can override both via admin.streamHost / admin.streamToken; everyone
// else uses the global config defaults. Single lookup returns both.
export const resolveStream = async (userId) => {
  if (!userId) return { host: api_host, token: api_token };
  try {
    const admin = await adminModel
      .findOne({ user_id: String(userId) })
      .select("streamHost streamToken")
      .lean();
    return {
      host: admin?.streamHost || api_host,
      token: admin?.streamToken || api_token,
    };
  } catch (err) {
    logger.error(`Failed to resolve stream config for ${userId}`, err.message);
    return { host: api_host, token: api_token };
  }
};

// Convenience wrapper for callers that only need the host (e.g. display URLs).
export const resolveHost = async (userId) => (await resolveStream(userId)).host;

// Hosts are stored with and without a trailing slash depending on where they
// came from, so normalise before joining a path onto one.
const trimHost = (host) => String(host || "").replace(/\/+$/, "");

// Pick the media server that actually holds this NVR's footage. One admin can
// own NVRs across several sites (each with its own stream box), so the NVR's
// own domain wins; admin.streamHost / the global config are the fallback for
// records that predate per-NVR domains.
export const resolvePlaybackHost = async (userId, nvrDomain) =>
  nvrDomain ? trimHost(nvrDomain) : trimHost(await resolveHost(userId));

export const getStreamingUrl = async (id, rtspUrl, userId) => {
  const redisKey = `stream_url:${id}`;
  let streamUrl = await redis.get(redisKey);

  if (!streamUrl) {
    try {
      const { host, token } = await resolveStream(userId);
      const response = await axios.post(
        `${host}/api/add-camera`,
        {
          id: id,
          rtsp_url: rtspUrl,
          generate: "true",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.data?.status === "success") {
        streamUrl = response.data.url;
        // Fix double "stream" in URL if present
        streamUrl = streamUrl.replace(/\/streamstream\//g, '/stream/');
        await redis.set(redisKey, streamUrl); // optionally set expiration
      }
    } catch (err) {
      logger.error(`Failed to add camera`, err.message);
    }
  }

  return streamUrl || null;
};

export const killCurrentPlayBack = async (camera_id, userId) => {
  try {
    const { host, token } = await resolveStream(userId);
    const response = await axios.post(
      `${host}/api/playback/start`,
      {
        camera_id,
        generate: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch (error) {
    logger.error(`Failed to kill current playback`, error.message);
  }
};

export const generatePlayBackUrl = async (
  session_id,
  camera_id,
  startTime,
  endTime,
  userId,
  hostOverride,
) => {
  const { host, token } = await resolveStream(userId);
  const target = trimHost(hostOverride || host);
  try {
    const response = await axios.post(
      `${target}/api/playback/start`,
      {
        session_id,
        camera_id,
        start_time: startTime,
        end_time: endTime,
        generate: true,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data?.playback_url || null;
  } catch (error) {
    // Surface the upstream reason (wrong stream host, unparseable rtsp url,
    // camera not registered) instead of returning undefined and letting the
    // caller splice it into a URL string.
    const detail = error?.response?.data
      ? JSON.stringify(error.response.data)
      : error?.code || error?.message || String(error);
    logger.error(
      `Failed to generate playback url for ${camera_id} via ${target}: ${detail}`,
    );
    return null;
  }
};

export const buildRTSPUrl = (nvr, channel, streamType = "main") => {
  const decryptedIp = decrypt(nvr.ip);
  const decryptedPassword = decrypt(nvr.password);
  const username = nvr.username; // Already decrypted based on your data

  if (nvr.brand === "hikvision") {
    // Hikvision: rtsp://user:pass@ip:port/Streaming/Channels/101
    const streamEndpoint = channel.streamEndpoint;
    const streamIndex = streamType === "main" ? 0 : 1;
    const streamId = channel.rtspChannels?.[streamIndex]?.id || "";

    return `rtsp://${username}:${decryptedPassword}@${decryptedIp}:${nvr.rtspPort}${streamEndpoint}${streamId}`;
  } else if (nvr.brand === "cpplus") {
    // CP Plus: rtsp://user:pass@ip:port/cam/realmonitor?channel=1&subtype=0
    const streamEndpoint = channel.streamEndpoint; // /cam/realmonitor
    const channelId = channel.channelId;
    const subtype = streamType === "main" ? 0 : 1;

    return `rtsp://${username}:${decryptedPassword}@${decryptedIp}:${nvr.rtspPort}${streamEndpoint}?channel=${channelId}&subtype=${subtype}`;
  } else if (nvr.brand === "dahua") {
    // Dahua (separate brand): rtsp://user:pass@ip:rtspPort/cam/realmonitor?channel=1&subtype=0
    const streamEndpoint = channel.streamEndpoint || "/cam/realmonitor";
    const channelId = channel.channelId;
    const subtype = streamType === "main" ? 0 : 1;

    return `rtsp://${username}:${decryptedPassword}@${decryptedIp}:${nvr.rtspPort}${streamEndpoint}?channel=${channelId}&subtype=${subtype}`;
  } else if (nvr.brand === "tiandy") {
    // Tiandy: rtsp://user:pass@ip:rtspPort/ChannelNo/StreamType
    // StreamType: 1 = main stream, 2 = sub stream
    const channelId = channel.channelId;
    const subtype = streamType === "main" ? 1 : 2;

    return `rtsp://${username}:${decryptedPassword}@${decryptedIp}:${nvr.rtspPort}/${channelId}/${subtype}`;
  } else if (nvr.brand === "securus") {
    // XiongMai Sofia: rtsp://ip:rtspPort/user=U&password=HASH&channel=N&stream=S.sdp?real_stream
    // Password must be the Sofia MD5 hash (8 chars from even MD5 hex positions, uppercased)
    const md5 = createHash("md5").update(decryptedPassword).digest("hex");
    let sofiaHash = "";
    for (let i = 0; i < 8; i++) sofiaHash += md5[i * 2];
    sofiaHash = sofiaHash.toUpperCase();
    const channelId = channel.channelId;
    const stream = streamType === "main" ? 0 : 1;
    return `rtsp://${decryptedIp}:${nvr.rtspPort}/user=${username}&password=${sofiaHash}&channel=${channelId}&stream=${stream}.sdp?real_stream`;
  } else if (nvr.brand === "camera") {
    // Generic Camera: rtsp://user:pass@ip:port/stream
    const streamEndpoint = channel.streamEndpoint; // e.g., /stream

    return `rtsp://${username}:${decryptedPassword}@${decryptedIp}:${nvr.rtspPort}${streamEndpoint}`;
  } else {
    throw new Error(`Unsupported NVR brand: ${nvr.brand}`);
  }
};

export const registerCameraStream = async (id, rtspUrl, userId) => {
  const redisKey = `stream_url:${id}`;
  try {
    const { host, token } = await resolveStream(userId);
    console.log(`[STREAM add-camera] id=${id} host=${host} rtsp_url=${rtspUrl}`);
    const response = await axios.post(
      `${host}/api/add-camera`,
      {
        id: id,
        rtsp_url: rtspUrl,
        generate: "true",
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (response.data?.status === "success") {
      let streamUrl = response?.data?.url;
      await redis.set(redisKey, streamUrl); // optionally set expiration
    }
  } catch (err) {
    // Surface the real reason (streaming service unreachable / auth / bad url)
    // instead of the bare "Failed to add camera".
    const detail = err?.response?.data
      ? JSON.stringify(err.response.data)
      : err?.code || err?.message || String(err);
    logger.error(`Failed to add camera ${id}: ${detail}`);
  }
};

export const updateCameraStream = async (id, rtspUrl, bitrate, userId) => {
  try {
    const { host, token } = await resolveStream(userId);
    const payload = { rtsp_url: rtspUrl };
    if (bitrate) payload.bitrate = bitrate;

    const response = await axios.put(
      `${host}/api/camera/${id}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (err) {
    logger.error(`Failed to update camera stream ${id}`, err.message);
    return null;
  }
};

export const terminateEverything = async () => {
  try {
    await axios.post(
      `${terminateHost}/api/system/revoke`,
      {},
      {
        headers: {
          "x-videora-admin-key": config.get("RTSPStream.terminateKey"),
        },
      },
    );
  } catch (error) {
    logger.error(`Failed to terminate all streams`, error.message);
  }
};

export const buildStreamingUrl = async (nvr, channel) => {
  try {
    let streamingUrl = null;
    const uid = `${nvr?._id}-${channel?._id}`;
    if (APP_ENV === "cloud") {
      const rtspUrl = buildRTSPUrl(nvr, channel, "main");
      streamingUrl = await getStreamingUrl(uid, rtspUrl, nvr?.userId);
    } else {
      streamingUrl = `${nvr?.domain}/${channel?.streamingPath}`;
    }
    return streamingUrl;
  } catch (error) {
    logger.error(`Failed to build streaming url`, error.message);
    return null;
  }
};

export default getStreamingUrl;
