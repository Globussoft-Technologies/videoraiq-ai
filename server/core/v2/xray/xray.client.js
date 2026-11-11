/**
 * The X-ray service client — the only file in Node that makes an HTTP request
 * to the Python X-ray service. Contract §6.
 *
 * It owns three things and nothing else: credentials, transport failure, and
 * the naming boundary (delegated to xray.translate.js). It makes no
 * authorisation or licensing decisions — those are the service layer's, in
 * Phase 3 — and it never retries.
 *
 *
 * CREDENTIALS — two on every request, both required (contract §6)
 *
 *   X-API-Key: <XRAY_API_KEY>        the shared service key, same convention
 *                                   as sam3_service
 *   Authorization: Bearer <JWT>      HS256, signed with the secret shared with
 *                                   the Python box, claims
 *                                   { sub: "videoraiq-backend", iat, exp },
 *                                   exp <= 5 minutes out
 *
 * The token is minted PER REQUEST and never cached. The plan is explicit about
 * this, and the reason is worth stating: a cached token is a bearer credential
 * sitting in process memory for its whole lifetime, and a long-lived one is a
 * replayable credential if it ever leaks. Minting costs an HMAC of a ~100-byte
 * payload — microseconds, against a 15-second network timeout.
 *
 *
 * FAILURE — never a raw 500, never a stack, never a retry
 *
 * Three kinds of failure, deliberately treated differently:
 *
 *  1. The service answered with a contract §10 body. Its `error` code is passed
 *     through UNCHANGED, with its own HTTP status. Contract §10: "Node passes
 *     the service's error code through unchanged." No remapping, no swallowing,
 *     no prettifying — the frontend switches on that string.
 *
 *  2. The service answered, but not in the contract's shape (an HTML 502 from a
 *     reverse proxy, an empty body, a stack trace). There is no code to pass
 *     through, so one is chosen by status class and the raw body is logged, not
 *     forwarded.
 *
 *  3. The request never completed — connection refused, DNS failure, timeout.
 *     Mapped to `503 service_unavailable`, which is retryable, because the GPU
 *     box being briefly absent is a transient condition and the browser can
 *     sensibly offer "try again".
 *
 * Nothing here retries. A timeout on `POST /sessions` may well have started a
 * session on the far side, and retrying would strand a second GPU slot. The
 * reaper on both ends is what cleans that up (contract §10).
 */
import axios from "axios";
import jwt from "jsonwebtoken";
import logger from "../../../utils/logger.js";
import {
  xrayServiceUrl,
  xrayApiKey,
  xrayJwtSecret,
  xrayJwtTtlSec,
  xrayServiceTimeoutMs,
} from "./xray.config.js";
import { XRAY_ERRORS, xrayFail, xrayOk } from "./xray.errors.js";
import {
  sessionFromService,
  promptFromService,
  statusFromService,
  sessionToService,
  promptToService,
} from "./xray.translate.js";

/** Contract §6: the `sub` claim the service expects. */
export const JWT_SUBJECT = "videoraiq-backend";

/**
 * Mint a short-lived service token.
 *
 * `jwt.sign` adds `iat` itself and derives `exp` from `expiresIn`, so the three
 * claims contract §6 requires are all present. The controlled local test can
 * backdate both timestamps by at most 30 seconds for measured host clock skew;
 * this shortens remaining validity without extending the token lifetime.
 */
const mintServiceToken = () => {
  const secret = xrayJwtSecret();
  if (!secret) return null;
  const requestedBackdate = Number(process.env.XRAY_LOCAL_JWT_BACKDATE_SEC || 0);
  const backdate = process.env.XRAY_LOCAL_TEST_MODE === "true" &&
    Number.isFinite(requestedBackdate)
    ? Math.min(30, Math.max(0, Math.trunc(requestedBackdate))) : 0;
  const claims = { sub: JWT_SUBJECT };
  if (backdate) claims.iat = Math.floor(Date.now() / 1000) - backdate;
  return jwt.sign(claims, secret, {
    algorithm: "HS256",
    expiresIn: xrayJwtTtlSec(),
  });
};

/**
 * Everything needed for one request, or a reason it cannot be made.
 *
 * Config is read per call rather than captured at import so that a deployer
 * flipping a value, and a test setting an env var, both take effect without a
 * process restart.
 */
const requestContext = () => {
  const baseUrl = xrayServiceUrl();
  const apiKey = xrayApiKey();
  const token = mintServiceToken();

  // A misconfigured relay must fail here, loudly and before the network, rather
  // than send an unauthenticated request and surface the service's 401 as if
  // the user had done something wrong.
  const missing = [];
  if (!baseUrl) missing.push("XRAY_SERVICE_URL");
  if (!apiKey) missing.push("XRAY_API_KEY");
  if (!token) missing.push("XRAY_JWT_SECRET (or JWT_SECRET_KEY)");
  if (missing.length) {
    logger.error(`[XRAY] cannot call the X-ray service — not configured: ${missing.join(", ")}`);
    return { error: xrayFail(503, XRAY_ERRORS.SERVICE_UNAVAILABLE, "X-ray is not configured", false) };
  }

  return {
    baseUrl,
    headers: {
      "X-API-Key": apiKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: xrayServiceTimeoutMs(),
  };
};

/** Transport-level error codes that mean "the request never arrived". */
const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNABORTED", // axios' own timeout
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
]);

/**
 * Turn an axios rejection into an `xrayFail`.
 *
 * `label` is the operation, for the log line only — it never reaches the client.
 */
const failureFrom = (error, label) => {
  const response = error?.response;

  // (3) The request never completed.
  if (!response) {
    const code = error?.code || "unknown";
    const timedOut = code === "ECONNABORTED" || code === "ETIMEDOUT" || /timeout/i.test(error?.message || "");
    logger.error(
      `[XRAY] ${label}: no response from the X-ray service (${code}${timedOut ? ", timed out" : ""})`,
    );
    if (timedOut || UNREACHABLE_CODES.has(code)) {
      return xrayFail(
        503,
        XRAY_ERRORS.SERVICE_UNAVAILABLE,
        timedOut ? "The X-ray service did not respond in time" : "The X-ray service is unreachable",
        true,
      );
    }
    // Something else entirely — a bug in this client, a bad URL. Not retryable:
    // repeating it would fail identically.
    return xrayFail(502, XRAY_ERRORS.SERVICE_UNAVAILABLE, "The X-ray service call failed", false);
  }

  const status = response.status;
  const body = response.data;

  // (1) A contract §10 body. Pass the code through untouched.
  if (body && typeof body === "object" && typeof body.error === "string" && body.error) {
    // A 401/403 on THIS hop is a credential mismatch between Node and the
    // Python box, not anything the user did. The code is still forwarded
    // unchanged, because §10 says so and the frontend must not be lied to about
    // what happened — but it is logged as the operator problem it is.
    if (status === 401 || status === 403) {
      logger.error(
        `[XRAY] ${label}: the X-ray service rejected our credentials (${status} ${body.error}). ` +
          "Check that XRAY_API_KEY matches and that XRAY_JWT_SECRET is the same value as the " +
          "Python side's JWT_SECRET_KEY.",
      );
    }
    return xrayFail(
      status,
      body.error,
      typeof body.message === "string" ? body.message : undefined,
      typeof body.retryable === "boolean" ? body.retryable : undefined,
    );
  }

  // (2) A response, but not in the contract's shape. Log the raw body once —
  // truncated, because an HTML error page is thousands of characters — and
  // choose a code by status class.
  const preview = typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body || null).slice(0, 200);
  logger.error(`[XRAY] ${label}: unparseable ${status} from the X-ray service: ${preview}`);

  if (status >= 500) {
    return xrayFail(503, XRAY_ERRORS.SERVICE_UNAVAILABLE, "The X-ray service failed", true);
  }
  return xrayFail(502, XRAY_ERRORS.INTERNAL_ERROR, "The X-ray service sent an unexpected response", false);
};

/**
 * One request. Returns `xrayOk(translated)` or `xrayFail(...)`; never throws for
 * an HTTP or transport failure.
 *
 * `validateStatus` is left at the axios default (2xx resolves, everything else
 * rejects) so every non-2xx goes through `failureFrom` and there is one path for
 * errors rather than two.
 */
const call = async ({ method, path, data, label, translate }) => {
  const context = requestContext();
  if (context.error) return context.error;

  try {
    const response = await axios({
      method,
      url: `${context.baseUrl}${path}`,
      data,
      headers: context.headers,
      timeout: context.timeout,
    });
    return xrayOk(translate ? translate(response.data) : response.data, 200);
  } catch (error) {
    return failureFrom(error, label);
  }
};

class XrayClient {
  /**
   * `POST /sessions` — contract §6.
   *
   * A 200 is the service's promise that frames are flowing: it attaches the
   * shared-memory ring and waits for a real decoded frame before answering
   * (contract §4). So there is nothing to poll here, and a `503
   * stream_not_ready` means no session was created and none needs cleaning up.
   *
   * @param {object} session { cameraId, nvrId, adminId, userId, streamUrl }
   */
  async createSession(session) {
    return call({
      method: "post",
      path: "/sessions",
      data: sessionToService(session),
      label: "createSession",
      translate: sessionFromService,
    });
  }

  /**
   * `POST /sessions/{id}/prompt` — contract §6.
   *
   * A `409 frame_not_buffered` is forwarded, never retried (contract §10).
   */
  async addPrompt(sessionId, prompt) {
    return call({
      method: "post",
      path: `/sessions/${encodeURIComponent(sessionId)}/prompt`,
      data: promptToService(prompt),
      label: "addPrompt",
      translate: promptFromService,
    });
  }

  /**
   * `DELETE /sessions/{id}` — contract §6. Idempotent 200 on the service side
   * too, so deleting an already-gone session is a success here as well.
   */
  async closeSession(sessionId) {
    return call({
      method: "delete",
      path: `/sessions/${encodeURIComponent(sessionId)}`,
      label: "closeSession",
      translate: () => ({ isSuccess: true }),
    });
  }

  /**
   * `POST /sessions/{id}/heartbeat` — NOT in contract §6, and forwarded anyway.
   *
   * §10 puts the idle reap on "S + B, **both**", which the service cannot do
   * unless heartbeats reach it: its only other signal is the session's own
   * start time. The service session therefore implemented this endpoint and
   * recorded in docs/xray/status_service.md that "Node must forward the
   * frontend's 10 s heartbeat, or every session dies after 45 s".
   *
   * That is exactly what was measured before this existed: 211 masks, then
   * `ended/idle_timeout` at 45.3 s, while the browser was heartbeating on time
   * and Node was answering every one of them 200.
   *
   * A service too old to have the route answers a non-contract 404, which the
   * shared error handling turns into `internal_error` rather than
   * `session_not_found` — so the caller can tell "this service has no such
   * session" from "this service has no such endpoint".
   */
  async heartbeat(sessionId) {
    return call({
      method: "post",
      path: `/sessions/${encodeURIComponent(sessionId)}/heartbeat`,
      data: {},
      label: "heartbeat",
      translate: () => ({ isSuccess: true }),
    });
  }

  /** `DELETE /sessions/{id}/objects/{obj_id}` — contract §6. Idempotent. */
  async removeObject(sessionId, objId) {
    return call({
      method: "delete",
      path: `/sessions/${encodeURIComponent(sessionId)}/objects/${encodeURIComponent(objId)}`,
      label: "removeObject",
      translate: () => ({ isSuccess: true }),
    });
  }

  /**
   * `GET /sessions/{id}/status` — contract §6.
   *
   * Note the path difference between the two hops, which is deliberate in the
   * contract and easy to get wrong: the frontend calls Node's
   * `GET /sessions/:id`, and Node calls the service's `GET /sessions/{id}/status`.
   */
  async getStatus(sessionId) {
    return call({
      method: "get",
      path: `/sessions/${encodeURIComponent(sessionId)}/status`,
      label: "getStatus",
      translate: statusFromService,
    });
  }

  /**
   * `GET /health/ready` — contract §6. Unauthenticated on the service side, but
   * the credentials are harmless and this way there is one code path.
   *
   * For diagnostics only. Nothing in the request flow consults it: the session
   * endpoints report their own failures, and gating a user action on a separate
   * health probe would add a round trip and a race for no benefit.
   */
  async health() {
    return call({ method: "get", path: "/health/ready", label: "health" });
  }
}

export default new XrayClient();
