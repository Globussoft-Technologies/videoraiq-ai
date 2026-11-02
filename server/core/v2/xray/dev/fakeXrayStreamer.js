/**
 * The mask stream, faked. Contract §8.
 *
 * Dials into Node's X-ray WebSocket exactly as the Python service will — same
 * direction, same bearer token, same JSON — and emits a moving polygon for
 * every session it is told about. So the whole path can be watched end to end
 * with no GPU: Python's job here is just "send a polygon five times a second".
 *
 * It also honours the two control messages Node sends:
 *   {"type":"ping"}                       -> replies {"type":"pong"}
 *   {"type":"close_session","session_id"}  -> stops streaming that session
 *
 * That second one is the important behaviour to see working: when the browser
 * tab closes, Node tells the service to stop, and the GPU slot is released
 * without anyone calling DELETE.
 *
 * Usage (from server/):
 *   node core/v2/xray/dev/fakeXrayStreamer.js --session <id> [--session <id>...]
 *
 * Options:
 *   --port 5099                                  relay's port (the WS shares it)
 *   --url ws://host:port/internal/xray/ws        full override, wins over --port
 *   --secret dev-secret                          must match XRAY_JWT_SECRET
 *   --fps 5                                      contract §12's default
 *   --step 14                                    px the box moves per frame
 *   --wrap                                       teleport at the edge (old behaviour)
 *   --teleport-every 25                          deliberate discontinuity every N frames
 *   --bad-token                                  prove Node closes with 4401
 *   --end-after 20                               send state "ended" after N frames
 *
 * THE PORT DEFAULT IS THE RELAY'S, NOT 5055. The X-ray WebSocket shares
 * whatever port the API listens on, and `dev/run-local.ps1` runs the API on
 * 5099 (5098 with -XrayOff). This file used to default to 5055 — the port the
 * real deployment's config uses and the one contract §8's example names — so
 * the documented invocation failed with ECONNREFUSED against the dev relay.
 * Found by session F during the first live run. Override with --port or --url
 * if your relay is elsewhere; XRAY_WS_URL in the environment also works.
 */
import jwt from "jsonwebtoken";
import WebSocket from "ws";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const allOf = (name) =>
  process.argv.reduce((out, arg, i) => {
    if (arg === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
    return out;
  }, []);

/** --url wins, then XRAY_WS_URL, then --port, then the relay's own default. */
const PORT = argOf("port", process.env.XRAY_RELAY_PORT || "5099");
const URL_ = argOf("url", process.env.XRAY_WS_URL || `ws://127.0.0.1:${PORT}/internal/xray/ws`);
const SECRET = argOf("secret", "dev-secret");
const FPS = Number(argOf("fps", 5));
/** Horizontal px per frame. 14 at 5 fps is ~70 px/s; 48 gives ~240 px/s. */
const STEP = Number(argOf("step", 14));
/** Motion model. Default bounces (continuous); see positionX below for why. */
const WRAP = flag("wrap");
const TELEPORT_EVERY = Number(argOf("teleport-every", 0));
const END_AFTER = Number(argOf("end-after", 0));
const BAD_TOKEN = flag("bad-token");
const SESSIONS = new Set(allOf("session"));

const log = (...parts) => console.log("[streamer]", ...parts);

if (!SESSIONS.size && !BAD_TOKEN) {
  log("no --session given; connecting anyway and waiting for control messages");
}

// Same credential as the HTTP hop: HS256, sub "videoraiq-backend", short TTL.
const token = BAD_TOKEN
  ? jwt.sign({ sub: "videoraiq-backend" }, "the-wrong-secret", { expiresIn: 120 })
  : jwt.sign({ sub: "videoraiq-backend" }, SECRET, { algorithm: "HS256", expiresIn: 120 });

log(`connecting to ${URL_}${BAD_TOKEN ? " with a DELIBERATELY BAD token" : ""}`);
const ws = new WebSocket(URL_, { headers: { Authorization: `Bearer ${token}` } });

let frame = 0;
let timer = null;

/**
 * Where the box is on frame `n`.
 *
 * MOTION IS CONTINUOUS BY DEFAULT, AND THAT IS A FIX.
 *
 * This used to be `200 + ((n * STEP) % 1400)`, which looks like a box walking
 * rightwards and is — until it reaches the edge, where the modulo teleports it
 * back to the left. At the default step that is a **1386 px jump every 100
 * frames**, roughly 7000 px/s, which is not motion at all.
 *
 * Session F measured held-out interpolation accuracy against 135 masks from
 * this fixture and the wrap dominated their worst case. It did find a real
 * defect in their interpolator (an outline bracketed ACROSS the jump smeared
 * through empty space, reading as smooth motion to somewhere wrong — worse than
 * a visible glitch, because nothing on screen says it is wrong). But it found
 * it by accident, and an accidental discontinuity in a motion fixture silently
 * pollutes anyone measuring smooth-motion accuracy. A fixture's DEFAULT should
 * model reality.
 *
 * So the default now bounces: the box reverses at the edges and every frame is
 * a plausible continuation of the last. The discontinuity is still available,
 * because the CLASS it represents is real — a stream restart, a
 * re-acquisition, or SAM3 latching onto a different instance of the same class
 * all move an object discontinuously while keeping its obj_id, and this relay
 * forwards all three faithfully because a relay must. It is now something you
 * ask for by name:
 *
 *   --wrap                 the old edge teleport (one jump per traverse)
 *   --teleport-every 25    a deliberate jump every N frames
 *
 * Neither is this relay's concern to smooth: contract §8 says coordinates
 * arrive in source pixels and Node must forward them unaltered. Deciding that a
 * jump is implausible is a consumer's judgement, and F's `isTeleport()` scales
 * it against the object's own size, which is the right axis — a lorry filling
 * half the frame legitimately crosses hundreds of pixels in 200 ms where a
 * distant person cannot.
 */
const SPAN = 1400;
const positionX = (n) => {
  if (TELEPORT_EVERY > 0 && n % TELEPORT_EVERY === 0) {
    // A deliberate jump to the far side, keeping the same obj_id.
    return 200 + (((n * STEP) % SPAN) + SPAN / 2) % SPAN;
  }
  if (WRAP) return 200 + ((n * STEP) % SPAN);

  // Bounce: fold the distance travelled back and forth across the span, so
  // consecutive frames never differ by more than STEP.
  const travelled = (n * STEP) % (2 * SPAN);
  return 200 + (travelled <= SPAN ? travelled : 2 * SPAN - travelled);
};

const maskFor = (sessionId, n) => {
  const x = positionX(n);
  const y = 400 + Math.round(120 * Math.sin(n / 6));
  const w = 160;
  const h = 220;
  return {
    type: "mask",
    session_id: sessionId,
    seq: 12345 + Math.floor(n / FPS),
    offset: Number(((n % FPS) / FPS).toFixed(3)),
    emitted_at: Date.now() / 1000,
    objects: [
      {
        obj_id: "obj-a1b2c3d4",
        bbox: [x, y, w, h],
        polygon: [
          [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ],
        ],
      },
    ],
  };
};

ws.on("open", () => {
  log("connected");

  for (const sessionId of SESSIONS) {
    ws.send(JSON.stringify({ type: "state", session_id: sessionId, state: "tracking", reason: null, frames_behind_live: 2 }));
  }

  timer = setInterval(() => {
    frame += 1;
    for (const sessionId of SESSIONS) {
      ws.send(JSON.stringify(maskFor(sessionId, frame)));
    }
    if (frame % FPS === 0) log(`sent ${frame} frames to ${SESSIONS.size} session(s)`);

    if (END_AFTER && frame >= END_AFTER) {
      for (const sessionId of SESSIONS) {
        log(`ending ${sessionId} (object_lost)`);
        ws.send(
          JSON.stringify({
            type: "state",
            session_id: sessionId,
            state: "ended",
            reason: "object_lost",
            frames_behind_live: 0,
          }),
        );
      }
      clearInterval(timer);
      setTimeout(() => ws.close(1000, "done"), 300);
    }
  }, Math.round(1000 / FPS));
});

ws.on("message", (raw) => {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return log("received a non-JSON frame");
  }

  if (message.type === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
    return;
  }

  if (message.type === "close_session") {
    // THE behaviour worth watching: Node noticed the browser left.
    log(`Node asked us to close ${message.session_id} — dropping it`);
    SESSIONS.delete(message.session_id);
    if (!SESSIONS.size) {
      log("no sessions left; disconnecting");
      clearInterval(timer);
      ws.close(1000, "all sessions closed");
    }
    return;
  }

  log(`received ${JSON.stringify(message)}`);
});

ws.on("close", (code, reason) => {
  clearInterval(timer);
  const text = reason?.toString() || "";
  log(`closed: code ${code}${text ? ` (${text})` : ""}`);
  if (code === 4401) log("4401 = Node rejected the token, exactly as contract §8 says");
  process.exit(0);
});

ws.on("error", (error) => {
  log(`error: ${error.message}`);
  if (error.code === "ECONNREFUSED") {
    log(`nothing is listening on ${URL_}`);
    log("the X-ray WebSocket shares the API's port -- run-local.ps1 prints it on");
    log("startup (5099 with X-ray on, 5098 with -XrayOff). Pass --port <n> or");
    log("--url ws://host:port/internal/xray/ws to point somewhere else.");
  }
});
