import { Router } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import config from "config";
import { createHash } from "node:crypto";

const router = Router();
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_MESSAGE_LENGTH = 16_000;
const AGENT_PROXY_HEADER = 'X-Agent-Backend-Key';
const sessionCache = new Map();
const pendingSignIns = new Map();

function configured(name, fallback) {
  return process.env[name] ?? (config.has(name) ? config.get(name) : fallback);
}

function timeout(name, fallback) {
  const value = Number(configured(name, fallback));
  return Number.isSafeInteger(value) && value >= 1_000 && value <= 300_000 ? value : fallback;
}

function error(res, status, errorCode, message) {
  return res.status(status).json({ errorCode, message });
}

function agentBaseUrl() {
  const raw = String(configured("DETECTION_AGENT_BASE_URL", configured("VIDEORAI_AGENT_BASE_URL", "")) || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const local = String(configured("APP_ENV", "")) === "local";
    if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))
      || parsed.username || parsed.password || parsed.search || parsed.hash
      || parsed.pathname !== "/") return null;
    return parsed.origin;
  } catch { return null; }
}

function gatewayHeaders() {
  const key = String(configured('VIDEORAI_AGENT_PROXY_KEY', '') || '').trim();
  return key ? { [AGENT_PROXY_HEADER]: key } : {};
}

async function agentSession(token, baseUrl, refresh = false) {
  if (sessionCache.size > 1000) {
    for (const [cachedKey, value] of sessionCache) if (value.expiresAt <= Date.now()) sessionCache.delete(cachedKey);
  }
  const key = createHash('sha256').update(token).digest('hex');
  const cached = sessionCache.get(key);
  if (!refresh && cached?.expiresAt - 300_000 > Date.now()) return cached.session;
  if (pendingSignIns.has(key)) return pendingSignIns.get(key);
  const signIn = (async () => {
    const response = await fetch(`${baseUrl}/agent/sign-in`, {
      method: 'POST', headers: { ...gatewayHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token }),
      signal: AbortSignal.timeout(timeout('DETECTION_AGENT_TIMEOUT_MS', 25_000)),
    });
    if (!response.ok) {
      sessionCache.delete(key);
      const body = await response.json().catch(() => null);
      const error = new Error('Agent sign-in failed');
      error.status = response.status;
      error.proxyKeyRequired = body?.errorCode === 'UNAUTHENTICATED' && body?.message === 'Backend proxy key required';
      throw error;
    }
    const data = await response.json();
    const expiresAt = Date.parse(data.expires_at);
    if (!data.session || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('Invalid agent session');
    sessionCache.set(key, { session: data.session, expiresAt });
    return data.session;
  })().finally(() => pendingSignIns.delete(key));
  pendingSignIns.set(key, signIn);
  return signIn;
}

async function access(req, res, next) {
  if (String(configured("DETECTION_AGENT_ENABLED", configured("VIDEORAI_AGENT_ENABLED", false))) !== "true") {
    return error(res, 503, "AGENT_DISABLED", "VideoraAI chat is not enabled.");
  }
  const baseUrl = agentBaseUrl();
  if (!baseUrl) return error(res, 503, "AGENT_DISABLED", "VideoraAI chat is not configured.");
  const token = req.get('x-access-token');
  if (!token || req.verified?.userData?.tokenType === 'detection-agent') return error(res, 401, 'UNAUTHENTICATED', 'A dashboard token is required.');
  if (req.path === '/sign-out' && !sessionCache.has(createHash('sha256').update(token).digest('hex'))) return res.json({ signed_out: true });
  try {
    const session = await agentSession(token, baseUrl);
    res.locals.agentChat = { baseUrl, session, token };
    return next();
  } catch (cause) {
    if (cause.proxyKeyRequired) {
      const keyConfigured = Boolean(configured('VIDEORAI_AGENT_PROXY_KEY', ''));
      return error(res, 502, keyConfigured ? 'AGENT_PROXY_KEY_REJECTED' : 'AGENT_PROXY_KEY_REQUIRED',
        keyConfigured ? 'Agent service gateway rejected the proxy key.' : 'Agent service gateway key is missing.');
    }
    const unauthorized = cause.status === 401 || cause.status === 403;
    return error(res, unauthorized ? 401 : 502, unauthorized ? 'UNAUTHENTICATED' : 'AGENT_UNAVAILABLE', 'Could not start an agent session.');
  }
}

function checkIds(req, res, next) {
  if ([req.params.cid, req.params.rid, req.params.aid].some((id) => id !== undefined && !ID.test(id))) {
    return error(res, 400, "INVALID_ID", "Invalid identifier.");
  }
  return next();
}

function agentError(res, upstream) {
  return upstream.json().then((body) => error(
    res, upstream.status,
    typeof body?.errorCode === "string" ? body.errorCode : "AGENT_ERROR",
    typeof body?.message === "string" ? body.message : "The agent request failed.",
  )).catch(() => error(res, 502, "AGENT_UNAVAILABLE", "The agent service returned an invalid response."));
}

async function forward(req, res, method, path, body) {
  try {
    const send = () => fetch(`${res.locals.agentChat.baseUrl}${path}`, {
      method,
      headers: {
        ...gatewayHeaders(),
        Authorization: `Bearer ${res.locals.agentChat.session}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeout("DETECTION_AGENT_TIMEOUT_MS", timeout("VIDEORAI_AGENT_TIMEOUT_MS", 25_000))),
    });
    let upstream = await send();
    if (upstream.status === 401) {
      res.locals.agentChat.session = await agentSession(res.locals.agentChat.token, res.locals.agentChat.baseUrl, true);
      upstream = await send();
    }
    res.set("Cache-Control", "no-store");
    if (!upstream.ok) return agentError(res, upstream);
    if (!upstream.headers.get("content-type")?.includes("application/json")) {
      return error(res, 502, "AGENT_UNAVAILABLE", "The agent service returned an invalid response.");
    }
    return res.status(upstream.status).json(await upstream.json());
  } catch (cause) {
    const timedOut = cause?.name === "TimeoutError" || cause?.name === "AbortError";
    return error(res, timedOut ? 504 : 502, timedOut ? "AGENT_TIMEOUT" : "AGENT_UNAVAILABLE", "The agent service did not respond.");
  }
}

router.use(access);
router.post("/conversations", (req, res) => forward(req, res, "POST", "/agent/conversations"));
router.get("/conversations", (req, res) => forward(req, res, "GET", "/agent/conversations"));
router.get("/conversations/:cid", checkIds, (req, res) => forward(req, res, "GET", `/agent/conversations/${req.params.cid}`));
router.delete("/conversations/:cid", checkIds, (req, res) => forward(req, res, "DELETE", `/agent/conversations/${req.params.cid}`));
router.post("/conversations/:cid/messages", checkIds, (req, res) => {
  const { request_id: requestId, message } = req.body || {};
  if (typeof requestId !== "string" || !ID.test(requestId) || typeof message !== "string"
    || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    return error(res, 400, "INVALID_MESSAGE", "A valid request_id and message are required.");
  }
  return forward(req, res, "POST", `/agent/conversations/${req.params.cid}/messages`, { request_id: requestId, message });
});
router.get("/runs/:rid", checkIds, (req, res) => forward(req, res, "GET", `/agent/runs/${req.params.rid}`));
router.post("/runs/:rid/cancel", checkIds, (req, res) => forward(req, res, "POST", `/agent/runs/${req.params.rid}/cancel`));
router.post("/runs/:rid/recover", checkIds, (req, res) => forward(req, res, "POST", `/agent/runs/${req.params.rid}/recover`));

router.post('/actions/:aid/decision', checkIds, (req, res) => {
  const { decision, proposalVersion, digest } = req.body || {};
  if (!['approve', 'cancel'].includes(decision) || !Number.isSafeInteger(proposalVersion) || typeof digest !== 'string' || !digest)
    return error(res, 400, 'INVALID_REQUEST', 'Invalid decision.');
  return forward(req, res, 'POST', `/agent/actions/${req.params.aid}/decision`, { decision, proposalVersion, digest });
});
router.get('/capabilities', (req, res) => forward(req, res, 'GET', '/agent/capabilities'));
router.get('/actions/:aid/preview', checkIds, async (req, res) => {
  try {
    const send = () => fetch(`${res.locals.agentChat.baseUrl}/agent/actions/${req.params.aid}/preview`, {
      headers: { ...gatewayHeaders(), Authorization: `Bearer ${res.locals.agentChat.session}` },
      signal: AbortSignal.timeout(timeout('DETECTION_AGENT_TIMEOUT_MS', 25_000)),
    });
    let upstream = await send();
    if (upstream.status === 401) {
      res.locals.agentChat.session = await agentSession(res.locals.agentChat.token, res.locals.agentChat.baseUrl, true);
      upstream = await send();
    }
    if (!upstream.ok) return agentError(res, upstream);
    if (!upstream.headers.get('content-type')?.includes('image/jpeg')) return error(res, 502, 'AGENT_UNAVAILABLE', 'Invalid preview response.');
    return res.status(200).set('Cache-Control', 'no-store').type('image/jpeg').send(Buffer.from(await upstream.arrayBuffer()));
  } catch { return error(res, 502, 'AGENT_UNAVAILABLE', 'The preview is unavailable.'); }
});
router.post('/sign-out', async (req, res) => {
  const { token, baseUrl, session } = res.locals.agentChat;
  try { await fetch(`${baseUrl}/agent/sign-out`, { method: 'POST', headers: { ...gatewayHeaders(), Authorization: `Bearer ${session}` }, signal: AbortSignal.timeout(5000) }); }
  catch { /* Clear the local session even if the agent is unavailable. */ }
  sessionCache.delete(createHash('sha256').update(token).digest('hex'));
  return res.json({ signed_out: true });
});

router.get("/runs/:rid/events", checkIds, async (req, res) => {
  const rawAfter = req.query.after ?? req.get("Last-Event-ID") ?? "0";
  if (!/^\d+$/.test(String(rawAfter)) || !Number.isSafeInteger(Number(rawAfter))) {
    return error(res, 400, "INVALID_ID", "Invalid event cursor.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout("VIDEORAI_AGENT_STREAM_TIMEOUT_MS", 60_000));
  res.once("close", () => controller.abort());
  try {
    const send = () => fetch(`${res.locals.agentChat.baseUrl}/agent/runs/${req.params.rid}/events?after=${rawAfter}`, {
      headers: { ...gatewayHeaders(), Authorization: `Bearer ${res.locals.agentChat.session}`, Accept: "text/event-stream" },
      signal: controller.signal,
    });
    let upstream = await send();
    if (upstream.status === 401) {
      res.locals.agentChat.session = await agentSession(res.locals.agentChat.token, res.locals.agentChat.baseUrl, true);
      upstream = await send();
    }
    if (!upstream.ok) return agentError(res, upstream);
    if (!upstream.body || !upstream.headers.get("content-type")?.includes("text/event-stream")) {
      return error(res, 502, "AGENT_UNAVAILABLE", "The agent service returned an invalid event stream.");
    }
    res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    if (!res.headersSent) error(res, controller.signal.aborted ? 504 : 502, controller.signal.aborted ? "AGENT_TIMEOUT" : "AGENT_UNAVAILABLE", "The agent event stream ended unexpectedly.");
    else res.end();
  } finally {
    clearTimeout(timer);
  }
});

export default router;
