/**
 * Drive the real relay the way client_v2 actually does, so the hop behind it
 * can be the REAL Python service rather than dev/fakeXrayService.js.
 *
 * Everything the other fixtures leave out is here, because each omission hides
 * a contract requirement:
 *   * it PROMPTS, so the service starts its track loop (nothing streams until
 *     a click);
 *   * it HEARTBEATS every 10 s, which contract §10 makes mandatory on BOTH
 *     ends — dev/fakeXrayBrowser.js does neither, so neither could be shown;
 *   * it runs past 45 s, because an idle reap that fires too early only
 *     appears after the timeout.
 *
 * The handshake, headers and paths mirror client_v2 exactly (SocketContext's
 * auth {token, sessionId}, helpers/client's x-access-token / x-session-id).
 * Nothing here fakes the far side: relay and service are both real.
 *
 * Usage (from server/):
 *   node core/v2/xray/dev/pairWithRealService.js \
 *     --port 5100 --token <jwt> --camera <id> --nvr <id> --seconds 90
 */
import { io } from "socket.io-client";
import axios from "axios";

const argOf = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const PORT = argOf("port", "5100");
const API = argOf("api", `http://127.0.0.1:${PORT}`);
const TOKEN = argOf("token", "");
const CAMERA = argOf("camera", "");
const NVR = argOf("nvr", "");
const TAB = argOf("tab", "tab-alpha");
const SECONDS = Number(argOf("seconds", 90));
const HEARTBEAT_SEC = Number(argOf("heartbeat", 10));
const SEQ = Number(argOf("seq", 12345));
const OFFSET = Number(argOf("offset", 1.24));

if (!TOKEN || !CAMERA || !NVR) {
  console.error("--token, --camera and --nvr are all required (see dev/seedXrayFixtures.js)");
  process.exit(1);
}

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const log = (...p) => console.log(`[${at()}]`, ...p);

const headers = {
  "x-access-token": TOKEN,
  "x-session-id": TAB,
  "x-device-id": "xray-dev-box",
  "Content-Type": "application/json",
};

let sessionId = "";
let masks = 0;
let foreign = 0;
const states = [];
const seqs = new Set();
let firstMaskAt = null;
let lastMaskAt = null;
let heartbeats = 0;
let heartbeatFailures = 0;

const socket = io(API, { auth: { token: TOKEN, sessionId: TAB }, transports: ["websocket"] });

socket.on("xray:mask", (p) => {
  if (sessionId && p.sessionId !== sessionId) { foreign += 1; return; }
  masks += 1;
  seqs.add(p.seq);
  if (firstMaskAt === null) firstMaskAt = Date.now();
  lastMaskAt = Date.now();
  const o = p.objects?.[0];
  if (masks <= 3 || masks % 25 === 0) {
    log(`mask #${masks} seq ${p.seq} +${p.offset}s objs ${p.objects?.length} ` +
        `bbox ${JSON.stringify(o?.bbox)} rings ${o?.polygon?.length} verts ${o?.polygon?.[0]?.length}`);
  }
  // Any snake_case key reaching here is a translation leak (contract §9).
  for (const key of Object.keys(p)) if (key.includes("_")) log(`!! snake_case key on the wire: ${key}`);
  for (const key of Object.keys(o || {})) if (key.includes("_")) log(`!! snake_case key in an object: ${key}`);
});

socket.on("xray:state", (p) => {
  if (sessionId && p.sessionId !== sessionId) { foreign += 1; return; }
  states.push(`${p.state}${p.reason ? `/${p.reason}` : ""}@${at()}`);
  log(`state -> ${p.state}${p.reason ? ` (${p.reason})` : ""} framesBehindLive ${p.framesBehindLive}`);
});

socket.on("connect_error", (e) => log(`socket connect_error: ${e.message}`));

const report = () => {
  const span = firstMaskAt && lastMaskAt ? (lastMaskAt - firstMaskAt) / 1000 : 0;
  console.log("\n==== pairing report ====");
  console.log(`session            ${sessionId || "(none)"}`);
  console.log(`masks              ${masks}` + (span > 0 ? `  over ${span.toFixed(1)}s = ${(masks / span).toFixed(2)}/s` : ""));
  console.log(`distinct seqs      ${seqs.size}`);
  console.log(`heartbeats sent    ${heartbeats} (failures ${heartbeatFailures})`);
  console.log(`state transitions  ${states.join(" -> ") || "(none)"}`);
  console.log(`foreign events     ${foreign}`);
  console.log(`last mask          ${lastMaskAt ? `${((Date.now() - lastMaskAt) / 1000).toFixed(1)}s ago` : "never"}`);
};

socket.on("connect", async () => {
  log(`socket connected (${socket.id}), tab ${TAB}`);
  try {
    const { data } = await axios.post(`${API}/api/v2/xray/sessions`, { cameraId: CAMERA, nvrId: NVR }, { headers });
    sessionId = data.sessionId;
    log(`POST /sessions 200 ${sessionId} ${data.width}x${data.height} @${data.frameRate}fps ` +
        `lostAfterFrames ${data.lostAfterFrames} maxObjects ${data.maxObjects}`);
  } catch (e) {
    log(`POST /sessions ${e.response?.status} ${JSON.stringify(e.response?.data || e.message)}`);
    report();
    process.exit(1);
  }

  try {
    const { data } = await axios.post(
      `${API}/api/v2/xray/sessions/${sessionId}/prompt`,
      { xNorm: 0.431, yNorm: 0.662, seq: SEQ, offset: OFFSET },
      { headers },
    );
    log(`POST /prompt 200 objId ${data.objId} resolvedSeq ${data.resolvedSeq} resolvedOffset ${data.resolvedOffset}`);
  } catch (e) {
    log(`POST /prompt ${e.response?.status} ${JSON.stringify(e.response?.data || e.message)}`);
  }

  const beat = setInterval(async () => {
    try {
      await axios.post(`${API}/api/v2/xray/sessions/${sessionId}/heartbeat`, {}, { headers });
      heartbeats += 1;
    } catch (e) {
      heartbeatFailures += 1;
      log(`heartbeat ${e.response?.status} ${JSON.stringify(e.response?.data || e.message)}`);
    }
  }, HEARTBEAT_SEC * 1000);

  setTimeout(async () => {
    clearInterval(beat);
    try {
      const { data } = await axios.get(`${API}/api/v2/xray/sessions/${sessionId}`, { headers });
      log(`GET /sessions 200 state ${data.state} objects ${data.objects?.length} framesBehindLive ${data.framesBehindLive}`);
    } catch (e) {
      log(`GET /sessions ${e.response?.status} ${JSON.stringify(e.response?.data || e.message)}`);
    }
    try {
      const { data } = await axios.delete(`${API}/api/v2/xray/sessions/${sessionId}`, { headers });
      log(`DELETE /sessions 200 ${JSON.stringify(data)}`);
    } catch (e) {
      log(`DELETE /sessions ${e.response?.status} ${JSON.stringify(e.response?.data || e.message)}`);
    }
    report();
    socket.disconnect();
    setTimeout(() => process.exit(0), 300);
  }, SECONDS * 1000);
});
