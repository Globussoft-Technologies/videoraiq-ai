/**
 * A fake Python X-ray service, for proving the Node relay without a GPU.
 *
 * Implements contract §6 — the Node <-> service hop — with synthetic data. It
 * has no SAM3, no CUDA, no shared memory and no video; it answers the shapes
 * the contract promises so the client, and later the whole relay, can be
 * exercised end to end on a laptop.
 *
 * THIS IS A TEST FIXTURE. It lives under core/v2/xray/dev/ and is imported by
 * nothing in the request path. It is not session S's fake backend (that one is
 * the real article and will replace this for integration work) — it exists so
 * Phase 2's exit gate does not have to wait on another session.
 *
 * It deliberately DOES enforce both credentials, because a client that forgets
 * a header should fail here rather than in production:
 *
 *   X-API-Key must equal --api-key
 *   Authorization: Bearer <JWT> must verify against --jwt-secret, be HS256,
 *   carry sub "videoraiq-backend", and not be expired
 *
 * Run:
 *   node core/v2/xray/dev/fakeXrayService.js --port 8130 --api-key dev-key \
 *        --jwt-secret dev-secret
 *
 * Fault injection, for the failure paths that are otherwise hard to reach:
 *   --fail-create stream_not_ready     every POST /sessions fails with this code
 *   --fail-prompt frame_not_buffered   every prompt fails with this code
 *   --hang-ms 20000                    delay every reply, to trigger a timeout
 *   --garbage                          reply 502 with HTML instead of JSON
 */
import express from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const PORT = Number(argOf("port", 8130));
const API_KEY = argOf("api-key", "dev-key");
const JWT_SECRET = argOf("jwt-secret", "dev-secret");
const FAIL_CREATE = argOf("fail-create", "");
const FAIL_PROMPT = argOf("fail-prompt", "");
const HANG_MS = Number(argOf("hang-ms", 0));
const GARBAGE = flag("garbage");

// HTTP status for each contract §6 / §10 error code, so --fail-* produces a
// realistic reply rather than a 500 with the right word in it.
const STATUS_FOR = {
  stream_not_ready: 503,
  max_sessions_reached: 503,
  stream_url_not_allowed: 403,
  unauthorized: 401,
  session_not_found: 404,
  frame_not_buffered: 409,
  max_objects_reached: 409,
  mask_too_small: 422,
};

const RETRYABLE = new Set(["stream_not_ready", "max_sessions_reached"]);

/** Contract §10 error body. */
const fail = (res, code, message) =>
  res.status(STATUS_FOR[code] || 500).json({
    error: code,
    message: message || `fake service: ${code}`,
    retryable: RETRYABLE.has(code),
  });

const app = express();
app.use(express.json());

const log = (...parts) => console.log("[fake-xray]", ...parts);

/** Sessions this fake believes in: session_id -> record. */
const sessions = new Map();

// --- optional fault injection, applied before anything else ----------------

app.use(async (req, res, next) => {
  if (HANG_MS > 0) await new Promise((resolve) => setTimeout(resolve, HANG_MS));
  if (GARBAGE && !req.path.startsWith("/health")) {
    log(`${req.method} ${req.path} -> 502 (garbage mode)`);
    return res.status(502).type("html").send("<html><body><h1>502 Bad Gateway</h1></body></html>");
  }
  return next();
});

// --- health: unauthenticated, per contract §6 ------------------------------

app.get("/health/live", (_req, res) => res.json({ status: "alive" }));
app.get("/health/ready", (_req, res) =>
  res.json({ status: "ready", model_loaded: true, sessions: sessions.size }),
);
app.get("/metrics", (_req, res) =>
  res.type("text/plain").send(`xray_sessions_active ${sessions.size}\n`),
);

// --- everything else needs BOTH credentials (contract §6) ------------------

app.use((req, res, next) => {
  if (req.header("X-API-Key") !== API_KEY) {
    log(`${req.method} ${req.path} -> 401 (bad or missing X-API-Key)`);
    return fail(res, "unauthorized", "bad or missing X-API-Key");
  }

  const auth = req.header("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    log(`${req.method} ${req.path} -> 401 (no bearer token)`);
    return fail(res, "unauthorized", "missing Authorization: Bearer <jwt>");
  }

  try {
    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (claims.sub !== "videoraiq-backend") {
      log(`${req.method} ${req.path} -> 401 (sub was ${JSON.stringify(claims.sub)})`);
      return fail(res, "unauthorized", `unexpected sub: ${claims.sub}`);
    }
    // Contract §6 caps the lifetime at 5 minutes; a longer-lived token is a
    // relay that is not following the contract, and this is where it shows up.
    const ttl = Number(claims.exp) - Number(claims.iat);
    if (!Number.isFinite(ttl) || ttl > 300) {
      log(`${req.method} ${req.path} -> 401 (token ttl ${ttl}s exceeds the 300s cap)`);
      return fail(res, "unauthorized", `token lifetime ${ttl}s exceeds the 5-minute cap`);
    }
    req.serviceClaims = claims;
    return next();
  } catch (error) {
    log(`${req.method} ${req.path} -> 401 (${error.message})`);
    return fail(res, "unauthorized", error.message);
  }
});

// --- contract §6 --------------------------------------------------------------

app.post("/sessions", (req, res) => {
  if (FAIL_CREATE) {
    log(`POST /sessions -> ${FAIL_CREATE} (forced)`);
    return fail(res, FAIL_CREATE);
  }

  const { camera_id, nvr_id, admin_id, user_id, stream_url } = req.body || {};
  for (const [name, value] of Object.entries({ camera_id, nvr_id, admin_id, user_id, stream_url })) {
    if (!value) {
      log(`POST /sessions -> 422 (missing ${name})`);
      return res.status(422).json({
        error: "validation_failed",
        message: `missing ${name}`,
        retryable: false,
      });
    }
  }

  // Contract §13.2: `seq` is only meaningful within one rendition, so the real
  // service must never be handed a master- or sub-stream URL. Checked here so
  // the Node side's guard is actually exercised by something.
  if (/\/(master-stream|sub-stream)\//.test(stream_url)) {
    log(`POST /sessions -> 403 (non-main rendition: ${stream_url})`);
    return fail(res, "stream_url_not_allowed", "only the main rendition is supported");
  }

  const sessionId = crypto.randomBytes(8).toString("hex");
  sessions.set(sessionId, { cameraId: camera_id, objects: new Map(), state: "ready" });
  log(`POST /sessions -> 200 ${sessionId} (camera ${camera_id})`);

  return res.json({
    session_id: sessionId,
    width: 1920,
    height: 1080,
    frame_rate: 5.0, // contract §12: the DECIMATED rate, not the source fps
    lost_after_frames: 25,
    max_objects: 1, // contract §13.4: one object per session in v1
  });
});

app.post("/sessions/:sessionId/prompt", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    log(`POST prompt -> 404 (unknown session ${req.params.sessionId})`);
    return fail(res, "session_not_found");
  }
  if (FAIL_PROMPT) {
    log(`POST prompt -> ${FAIL_PROMPT} (forced)`);
    return fail(res, FAIL_PROMPT);
  }
  if (session.objects.size >= 1) {
    log("POST prompt -> 409 max_objects_reached");
    return fail(res, "max_objects_reached");
  }

  const { x_norm, y_norm, seq, offset } = req.body || {};
  if (![x_norm, y_norm, seq, offset].every((v) => Number.isFinite(Number(v)))) {
    log("POST prompt -> 422 (non-numeric click)");
    return res.status(422).json({ error: "validation_failed", message: "bad click", retryable: false });
  }

  const objId = `obj-${crypto.randomBytes(4).toString("hex")}`;
  session.objects.set(objId, { xNorm: Number(x_norm), yNorm: Number(y_norm) });
  session.state = "tracking";
  log(`POST prompt -> 200 ${objId} at (${x_norm}, ${y_norm})`);

  return res.json({
    obj_id: objId,
    resolved_seq: Number(seq),
    // Deliberately NOT the offset that was asked for. Contract §5: the frontend
    // may surface the delta but must not reject a non-exact match, and a fake
    // that always answered exactly would never exercise that.
    resolved_offset: Math.max(0, Number(offset) - 0.05),
  });
});

app.get("/sessions/:sessionId/status", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return fail(res, "session_not_found");

  return res.json({
    session_id: req.params.sessionId,
    state: session.state,
    reason: null,
    frames_behind_live: 3,
    objects: [...session.objects.entries()].map(([objId, object]) => ({
      obj_id: objId,
      bbox: [Math.round(object.xNorm * 1920) - 60, Math.round(object.yNorm * 1080) - 90, 120, 180],
      polygon: [
        [
          [Math.round(object.xNorm * 1920) - 60, Math.round(object.yNorm * 1080) - 90],
          [Math.round(object.xNorm * 1920) + 60, Math.round(object.yNorm * 1080) - 90],
          [Math.round(object.xNorm * 1920) + 60, Math.round(object.yNorm * 1080) + 90],
          [Math.round(object.xNorm * 1920) - 60, Math.round(object.yNorm * 1080) + 90],
        ],
      ],
    })),
  });
});

// Both DELETEs are idempotent 200 (contract §6), so an unknown id is a success.
app.delete("/sessions/:sessionId", (req, res) => {
  const existed = sessions.delete(req.params.sessionId);
  log(`DELETE /sessions/${req.params.sessionId} -> 200 (${existed ? "closed" : "was already gone"})`);
  return res.json({ is_success: true });
});

app.delete("/sessions/:sessionId/objects/:objId", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  const existed = session?.objects.delete(req.params.objId) || false;
  if (session && session.objects.size === 0) session.state = "ready";
  log(`DELETE object ${req.params.objId} -> 200 (${existed ? "removed" : "was already gone"})`);
  return res.json({ is_success: true });
});

app.listen(PORT, () => {
  log(`listening on http://127.0.0.1:${PORT}`);
  log(`api-key=${API_KEY} jwt-secret=${JWT_SECRET}`);
  if (FAIL_CREATE) log(`FORCING POST /sessions -> ${FAIL_CREATE}`);
  if (FAIL_PROMPT) log(`FORCING prompt -> ${FAIL_PROMPT}`);
  if (HANG_MS) log(`DELAYING every reply by ${HANG_MS}ms`);
  if (GARBAGE) log("GARBAGE mode: replying 502 text/html");
});
