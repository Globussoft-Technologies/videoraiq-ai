import DigestFetch from "digest-fetch";

const API_VERSION = "1.0";

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const unwrapData = (payload) => payload?.data ?? payload ?? {};

const firstValue = (source, keys, fallback = "") => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
};

const channelNumber = (item, index) => {
  const raw = firstValue(item, ["channel_id", "channelId", "id", "channel", "index"], index + 1);
  const match = String(raw).match(/\d+/);
  return match ? String(Number(match[0])) : String(index + 1);
};

/** Normalize TVT's Login/ChannelInfo response into the application's camera shape. */
export const normalizeHoneywellChannels = (payload, deviceInfo = {}) => {
  const data = unwrapData(payload);
  const items =
    data?.channel_param?.items ??
    data?.channelParam?.items ??
    data?.channels ??
    data?.items ??
    [];
  const normalizedItems = Array.isArray(items) ? items : [];
  const declaredCount = Number(
    firstValue(unwrapData(deviceInfo), ["channel_num", "channelNum", "camera_num", "cameraCount"], 0),
  );
  const source = normalizedItems.length
    ? normalizedItems
    : Array.from({ length: Number.isFinite(declaredCount) ? declaredCount : 0 }, () => ({}));

  return source.map((item, index) => {
    const id = channelNumber(item, index);
    return {
      channelId: id,
      name: firstValue(item, ["channel_name", "channelName", "name", "channel_alias"], `Camera ${id}`),
      ipAddress: firstValue(item, ["ip_address", "ipAddress", "ip", "address"]),
      model: firstValue(item, ["model", "device_model", "deviceModel"]),
      serialNumber: firstValue(item, ["serial_number", "serialNumber", "serial_no"]),
      firmwareVersion: firstValue(item, ["firmware_version", "firmwareVersion", "software_version"]),
      streamEndpoint: "/ch", // unused by buildRTSPUrl (hardcodes /ch<id>/main|sub); kept for display only
      rtspChannels: [
        { id: `${id}_main`, resolution: { width: 0, height: 0 } },
        { id: `${id}_sub`, resolution: { width: 0, height: 0 } },
      ],
    };
  });
};

export const normalizeHoneywellDeviceInfo = (payload) => {
  const data = unwrapData(payload);
  return {
    deviceName: firstValue(data, ["device_name", "deviceName", "name"], "Honeywell NVR"),
    model: firstValue(data, ["model", "device_model", "deviceModel", "product_model"]),
    serialNumber: firstValue(data, ["serial_number", "serialNumber", "serial_no", "sn"]),
    macAddress: firstValue(data, ["mac_address", "macAddress", "mac"]),
    firmwareVersion: firstValue(data, ["firmware_version", "firmwareVersion", "software_version", "version"]),
    deviceType: firstValue(data, ["device_type", "deviceType", "device_type_cloud"], "NVR"),
  };
};

const apiPost = async (client, baseUrl, path, token, cookie, body = {}) => {
  const response = await client.fetch(`${baseUrl}/API/${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json; charset=utf-8",
      "Content-Type": "application/json; charset=utf-8",
      ...(token ? { "X-csrftoken": token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ version: API_VERSION, data: body }),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await safeJson(response);
  return { response, payload };
};

/**
 * Digest login shared by every Honeywell/TVT call — device + channel info,
 * and playback (search + DASH manifest/segments). Returns the client plus
 * the token/cookie every follow-up request needs.
 */
async function honeywellLogin({ ip, port, username, password, client = new DigestFetch(username, password) }) {
  const baseUrl = `http://${ip}:${port}`;
  const loginResponse = await client.fetch(`${baseUrl}/API/Web/Login`, {
    method: "POST",
    headers: {
      Accept: "application/json; charset=utf-8",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(10000),
  });
  const loginPayload = await safeJson(loginResponse);

  if (!loginResponse.ok || loginPayload?.result === "failed") {
    const code = loginPayload?.error_code || loginPayload?.reason;
    if (code === "no_permission" || loginPayload?.reason === "No remote login permission!") {
      throw new Error("Honeywell user does not have Remote/Web login permission");
    }
    throw new Error(code ? `Honeywell authentication failed: ${code}` : "Honeywell authentication failed");
  }

  const token =
    loginPayload?.token ||
    loginPayload?.data?.token ||
    loginResponse.headers?.get?.("x-csrftoken");
  if (!token) throw new Error("Honeywell login succeeded but no session token was returned");

  // TVT requires the login response's session cookie on every follow-up call,
  // not just X-csrftoken — without it every call fails with error_code "no_login".
  const cookie = loginResponse.headers?.get?.("set-cookie")?.split(";")[0];

  return { client, baseUrl, token, cookie };
}

/**
 * Honeywell I-HPNVR recorders use TVT's HTTP API: Digest login followed by
 * X-csrftoken-authenticated device and channel calls.
 */
export async function fetchHoneywellTvtCameras({ ip, port, username, password, client }) {
  const { client: authedClient, baseUrl, token, cookie } = await honeywellLogin({ ip, port, username, password, client });

  const [deviceResult, channelResult] = await Promise.all([
    apiPost(authedClient, baseUrl, "Login/DeviceInfo/Get", token, cookie, { support_new_schedule: true }),
    apiPost(authedClient, baseUrl, "Login/ChannelInfo/Get", token, cookie),
  ]);

  for (const { response, payload } of [deviceResult, channelResult]) {
    if (!response.ok || payload?.result === "failed") {
      const code = payload?.error_code || payload?.reason || response.status;
      throw new Error(`Honeywell discovery failed: ${code}`);
    }
  }

  const deviceInfo = normalizeHoneywellDeviceInfo(deviceResult.payload);
  const cameras = normalizeHoneywellChannels(channelResult.payload, deviceResult.payload);
  if (!cameras.length) throw new Error("Honeywell NVR returned no camera channels");

  return { deviceInfo, cameras };
}

/**
 * TVT record-type keys accepted by SearchRecord/Search and the DASH
 * playback query string — captured verbatim from the Honeywell web UI's own
 * requests (not documented anywhere public). Passing a narrower list is
 * fine; passing an unknown key returns "bad request".
 */
const RECORD_TYPES =
  "nor,manual,anr,io,md,pdvd,fd,lpd,intrusion,enter,exit,lcd,cc,sod,fire,temp_measure," +
  "wanderdetection,packagedelivered,packagetakenaway,answeredcall,missedcall,multitype," +
  "qd,cd,od,rsd,sd,pos";

const pad2 = (n) => String(n).padStart(2, "0");
/** Date -> TVT's "MM/DD/YYYY" + "HH:mm:ss" pair, in local (device) time. */
const toTvtDateTime = (date) => ({
  date: `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`,
  time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
});
/** Date -> TVT's compact "YYYYMMDDHHmmss" for the DASH manifest's s/e params. */
const toTvtCompact = (date) =>
  `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;

/**
 * Recording segments for one channel over [start, end) — TVT's own search,
 * not ISAPI's XML (Honeywell/TVT NVRs don't speak ISAPI). channelId is the
 * device's 1-based channel number (Channel.channelId); TVT wants "CH<n>".
 */
export async function searchHoneywellRecordings({ ip, port, username, password, channelId, start, end, client }) {
  const { client: authedClient, baseUrl, token, cookie } = await honeywellLogin({ ip, port, username, password, client });
  const startParts = toTvtDateTime(start);
  const endParts = toTvtDateTime(end);

  const { response, payload } = await apiPost(authedClient, baseUrl, "Playback/SearchRecord/Search", token, cookie, {
    channel: [`CH${channelId}`],
    start_date: startParts.date,
    start_time: startParts.time,
    end_date: endParts.date,
    end_time: endParts.time,
    stream_mode: "Mainstream",
    record_type: 0,
    record_type_ex: [],
    enable_smart_search: 0,
    smart_region: [],
    record_type_arr: RECORD_TYPES.split(","),
  });

  if (!response.ok || payload?.result === "failed") {
    const code = payload?.error_code || payload?.reason || response.status;
    throw new Error(`Honeywell recording search failed: ${code}`);
  }

  // data.record is an array of per-request-chunk arrays; flatten to one list.
  const chunks = payload?.data?.record;
  return (Array.isArray(chunks) ? chunks.flat() : []).map((seg) => ({
    start: new Date(`${seg.start_date} ${seg.start_time}`),
    end: new Date(`${seg.end_date} ${seg.end_time}`),
    recordTypes: seg.record_type_arr || [],
  }));
}

/**
 * DASH playback manifest URL (relative to baseUrl) for one channel/time
 * range. TVT requires a fresh session id from GetDashPlaybackUrl first —
 * that id then keys the returned .mpd and every init.mp4/seg.m4s fetch.
 * Only one playback session is allowed device-wide at a time; a second
 * concurrent attempt fails with error_code "playback_mutex".
 */
export async function getHoneywellPlaybackManifest({ ip, port, username, password, channelId, start, end, client }) {
  const { client: authedClient, baseUrl, token, cookie } = await honeywellLogin({ ip, port, username, password, client });

  const idResponse = await authedClient.fetch(`${baseUrl}/API/GetDashPlaybackUrl?${Date.now()}`, {
    headers: { Accept: "application/json; charset=utf-8", "X-csrftoken": token, ...(cookie ? { Cookie: cookie } : {}) },
    signal: AbortSignal.timeout(10000),
  });
  const idPayload = await safeJson(idResponse);
  const mpdPath = idPayload?.data?.mpd;
  const sessionId = mpdPath?.match(/id=(\d+)/)?.[1];
  if (!idResponse.ok || idPayload?.result !== "success" || !sessionId) {
    throw new Error("Honeywell playback session could not be started");
  }

  // Built by hand, not URLSearchParams: the NVR wants rec_type_arr's commas
  // literal — URLSearchParams percent-encodes them to %2C, which the device
  // doesn't decode before splitting on ",", so it sees one unmatched value
  // and fails the whole request with reason "no data" (confirmed live).
  const query =
    `id=${sessionId}&chn=${Number(channelId) - 1}&streamtype=0` + // TVT channels are 0-indexed here
    `&rec_type_arr=${RECORD_TYPES}&skip_i=0&s=${toTvtCompact(start)}&e=${toTvtCompact(end)}&chrome=1`;
  const manifestUrl = `${baseUrl}/API/PlayBack/Dash/stream.mpd?${query}`;

  const manifestResponse = await authedClient.fetch(manifestUrl, {
    headers: { Accept: "*/*", "X-csrftoken": token, ...(cookie ? { Cookie: cookie } : {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!manifestResponse.ok) {
    const payload = await safeJson(manifestResponse);
    const code = payload?.reason || payload?.error_code || manifestResponse.status;
    if (code === "playback_mutex") {
      // No API on this device actually releases a session early (tried
      // stop=1 with several param combinations, and Web/Logout — none
      // free it; it only clears on its own internal timeout). Every seek
      // needs a new session, so this is expected, not a bug — give it a
      // stable code the caller can recognize instead of parsing prose.
      const mutexError = new Error("Honeywell NVR already has an active playback session (device allows only one at a time)");
      mutexError.code = "HONEYWELL_PLAYBACK_MUTEX";
      throw mutexError;
    }
    throw new Error(`Honeywell playback manifest request failed: ${code}`);
  }
  const xml = await manifestResponse.text();

  return { sessionId, manifestUrl, token, cookie, client: authedClient, xml };
}

/**
 * Mirrors the two pings the Honeywell web UI sends every ~10s while playing.
 * Without Login/Heartbeat the NVR kills the login session after ~60s and
 * every later segment fails with error_code "no_heartbeat" (confirmed live).
 * The playback keepalive is the manifest URL with keepalive=1 after id —
 * with only id= the device answers "bad request".
 */
export async function keepHoneywellPlaybackAlive({ manifestUrl, sessionId, token, cookie }) {
  const headers = { Accept: "*/*", "X-csrftoken": token, ...(cookie ? { Cookie: cookie } : {}) };
  const baseUrl = new URL(manifestUrl).origin;
  await Promise.all([
    fetch(`${baseUrl}/API/Login/Heartbeat?${Date.now()}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ version: API_VERSION, actionType: "create", data: {} }),
      signal: AbortSignal.timeout(10000),
    }),
    fetch(manifestUrl.replace(`id=${sessionId}`, `id=${sessionId}&keepalive=1`), {
      headers,
      signal: AbortSignal.timeout(10000),
    }),
  ]);
}

/**
 * Fetch one init.mp4/seg.m4s file for an already-started playback session.
 * Must reuse the exact token/cookie/client from getHoneywellPlaybackManifest
 * — logging in again per segment would each count as a new session and trip
 * "playback_mutex" against the one still open.
 */
export async function fetchHoneywellPlaybackSegment({ ip, port, sessionId, track, file, seg, token, cookie, client }) {
  const baseUrl = `http://${ip}:${port}`;
  const url = `${baseUrl}/API/PlayBack/Dash/${track}/${file}?id=${sessionId}&seg=${seg}`;
  const headers = { Accept: "*/*", "X-csrftoken": token, ...(cookie ? { Cookie: cookie } : {}) };

  // The NVR transcodes each segment on demand from the recording rather than
  // serving pre-cut files — confirmed live: an early segment (right after
  // opening the session) is instant, but a later one reliably fails
  // (error_code "stream_in_process", or a bare 502/500 further into a long
  // session — same underlying cause, just not always JSON) if requested
  // before the NVR has it ready. Retry generously; this is normal
  // preparation latency, not a real failure — dash.js itself keeps retrying
  // failed segments too, so without this our proxy just wastes those retries.
  let response = await client.fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  for (let attempt = 0; !response.ok && attempt < 10; attempt++) {
    if (response.status < 500) {
      const body = await safeJson(response);
      if (body?.error_code && body.error_code !== "stream_in_process") break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    response = await client.fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  }

  if (!response.ok) {
    throw new Error(`Honeywell playback segment fetch failed: ${response.status}`);
  }
  return response;
}
