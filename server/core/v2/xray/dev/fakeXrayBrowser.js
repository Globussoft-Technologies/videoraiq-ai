/**
 * A browser, faked. Contract §9.
 *
 * Connects a socket.io client exactly as client_v2 does — same handshake auth,
 * same `sessionId` on the handshake so Node can find this "tab" — opens an
 * X-ray session over REST, and prints every `xray:mask` and `xray:state` that
 * arrives.
 *
 * This is the far end of the whole chain. With this, dev/fakeXrayStreamer.js
 * and the real relay running, a mask travels:
 *
 *   streamer --WS--> Node --socket.io--> here
 *
 * and you can watch it happen.
 *
 * Usage (from server/):
 *   node core/v2/xray/dev/fakeXrayBrowser.js --token <jwt> --camera <id> --nvr <id> --tab tab-alpha
 *
 * Options:
 *   --port 5099                   the relay's port
 *   --api http://host:port        full override, wins over --port
 *   --frames 10                   stop after this many masks (0 = run forever)
 *   --drop-after 8                disconnect the socket after N masks, to prove
 *                                 Node notices and releases the GPU slot
 *   --no-session                  just listen; do not open a session
 */
import { io } from "socket.io-client";
import axios from "axios";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

// Defaults to the relay's port, not 5055: the dev relay runs on 5099
// (run-local.ps1). The old 5055 default was the real deployment's config
// port, so the documented invocation failed locally -- same bug session F
// hit in fakeXrayStreamer.js.
const PORT = argOf("port", process.env.XRAY_RELAY_PORT || "5099");
const API = argOf("api", process.env.XRAY_API_URL || `http://127.0.0.1:${PORT}`);
const TOKEN = argOf("token", "");
const CAMERA = argOf("camera", "");
const NVR = argOf("nvr", "");
const TAB = argOf("tab", "tab-alpha");
const DEVICE = argOf("device", "xray-dev-box");
const MAX_FRAMES = Number(argOf("frames", 0));
const DROP_AFTER = Number(argOf("drop-after", 0));

const log = (...parts) => console.log("[browser]", ...parts);

if (!TOKEN) {
  console.error("--token is required (see dev/seedXrayFixtures.js)");
  process.exit(1);
}

// client_v2 passes its token and session id on the handshake
// (socket.js:157 reads auth.token, :373 reads auth.sessionId).
const socket = io(API, { auth: { token: TOKEN, sessionId: TAB }, transports: ["websocket"] });

let masks = 0;
let sessionId = "";

socket.on("connect", async () => {
  log(`socket connected (id ${socket.id}, tab ${TAB})`);

  if (flag("no-session")) return log("listening only (--no-session)");
  if (!CAMERA || !NVR) return log("no --camera/--nvr given; listening only");

  try {
    const { data } = await axios.post(
      `${API}/api/v2/xray/sessions`,
      { cameraId: CAMERA, nvrId: NVR },
      {
        headers: {
          "x-access-token": TOKEN,
          "x-session-id": TAB,
          "x-device-id": DEVICE,
          "Content-Type": "application/json",
        },
      },
    );
    sessionId = data.sessionId;
    log(`session ${sessionId} open — ${data.width}x${data.height} @ ${data.frameRate}fps`);
    log("");
    log(`  now run, in another terminal:`);
    log(`  node core/v2/xray/dev/fakeXrayStreamer.js --session ${sessionId}`);
    log("");
  } catch (error) {
    log(`could not open a session: ${error.response?.status} ${JSON.stringify(error.response?.data || error.message)}`);
  }
});

// Contract §9: the frontend must ignore any event whose sessionId is not its
// own — a stale event after a fast close is normal, not an error.
const mine = (payload) => !sessionId || payload.sessionId === sessionId;

socket.on("xray:mask", (payload) => {
  if (!mine(payload)) return log(`ignored a mask for another session (${payload.sessionId})`);
  masks += 1;
  const o = payload.objects?.[0];
  log(
    `mask #${masks}  seq ${payload.seq} +${payload.offset}s  ` +
      `${payload.objects.length} object(s)  bbox ${JSON.stringify(o?.bbox)}`,
  );

  if (DROP_AFTER && masks === DROP_AFTER) {
    log(`disconnecting the socket after ${masks} masks (proving Node reaps the session)`);
    socket.disconnect();
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  if (MAX_FRAMES && masks >= MAX_FRAMES) {
    log(`got ${masks} masks; done`);
    socket.disconnect();
    setTimeout(() => process.exit(0), 300);
  }
});

socket.on("xray:state", (payload) => {
  if (!mine(payload)) return;
  log(
    `state -> ${payload.state}` +
      (payload.reason ? ` (${payload.reason})` : "") +
      `  framesBehindLive ${payload.framesBehindLive}`,
  );
  if (payload.state === "ended") {
    log("session ended; exiting");
    socket.disconnect();
    setTimeout(() => process.exit(0), 300);
  }
});

socket.on("connect_error", (error) => log(`socket connect_error: ${error.message}`));
socket.on("disconnect", (reason) => log(`socket disconnected (${reason})`));
