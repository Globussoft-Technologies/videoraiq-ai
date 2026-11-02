/**
 * X-Ray mode — every switch and tunable, in one file.
 *
 * WHY THIS FILE EXISTS AND WHY IT IMPORTS ALMOST NOTHING
 *
 * `routes/v2/v2.js` imports this module statically to decide whether to mount
 * /api/v2/xray at all. A static ESM import always executes, flag or no flag, so
 * this file must stay free of side effects: no Mongoose models (compiling one
 * builds its indexes against the live database), no axios clients, no `ws`
 * server, no network, no filesystem. Only `config`, which every other module
 * already loads anyway.
 *
 * Contract: docs/xray/00_CONTRACT.md §3 (the master flag), §10 (timeouts),
 * §12 (model fps). That document is the authority; this file only reads values.
 *
 *
 * RESOLUTION ORDER — environment variable, then config file, then default
 *
 * Copied from core/v2/adminStorage/adminStorage.resolver.js:18-38, the house
 * pattern for an optional feature. A deployer can switch X-ray on with an env
 * var alone and never edit the (encrypted, out-of-repo) config directory.
 *
 * `config.has()` guards EVERY read. A bare `config.get()` throws on a missing
 * key — deliberately, see the LICENSING_ENABLED note in
 * core/v2/clientConfig/detectionLicense.service.js:25-29 — and the shared test
 * harness (tests/setup.js) injects a fixed NODE_CONFIG with no `xray` section.
 * One bare `config.get` here would turn the whole existing suite red the moment
 * anything imports this file.
 *
 *
 * EVERY KNOB, AND WHAT HAPPENS IF YOU LEAVE IT ALONE
 *
 *   XRAY_ENABLED          false  The master switch. False means the routes are
 *                                never mounted, the WS server never binds, and
 *                                nothing in this directory is even loaded.
 *   XRAY_SERVICE_URL      ''     Base URL of the Python X-ray service.
 *   XRAY_API_KEY          ''     Shared service key -> X-API-Key header (§6).
 *   XRAY_JWT_SECRET       ''     HS256 secret for the service token (§6).
 *                                Falls back to the JWT_SECRET_KEY env var,
 *                                which is what the Python side already calls it
 *                                (python config/settings.py:1472). NOT the same
 *                                value as Node's own jwt.secretKey.
 *   XRAY_JWT_TTL_SEC      120    Service-token lifetime. Contract caps it at
 *                                300; anything larger is clamped, not rejected.
 *   XRAY_SERVICE_TIMEOUT_MS 15000  Node -> service HTTP timeout (§10).
 *   XRAY_IDLE_TIMEOUT_SEC 45     No heartbeat for this long -> reap (§10).
 *   XRAY_REAP_INTERVAL_SEC 15    How often the idle sweep runs.
 *   XRAY_CLOSE_MAX_ATTEMPTS 5    Give up closing a session after this many
 *                                failures, and tell the browser.
 *   XRAY_WS_PORT          5055   Port the Python service dials into (§8).
 *   XRAY_WS_PATH          /internal/xray/ws   Path on that port.
 *   XRAY_WS_PING_SEC      20     Keepalive ping interval; a missed pong kills
 *                                the connection.
 *   XRAY_LICENSE_CHECK    auto   auto -> follow the platform's LICENSING_ENABLED
 *                                on   -> always require an allocation
 *                                off  -> never check (XRAY_ENABLED is the only gate)
 *   XRAY_LICENSE_SETTING_TYPE  xRayMode  Allocation key the superadmin writes.
 *
 * Config-file equivalents live under an `xray` object and use camelCase:
 * `xray.enabled`, `xray.serviceUrl`, `xray.apiKey`, `xray.jwtSecret`,
 * `xray.jwtTtlSec`, `xray.serviceTimeoutMs`, `xray.idleTimeoutSec`,
 * `xray.reapIntervalSec`, `xray.closeMaxAttempts`, `xray.wsPort`, `xray.wsPath`, `xray.wsPingSec`,
 * `xray.licenseCheck`, `xray.licenseSettingType`.
 */
import config from "config";

/** Truthy strings only — "true"/"1"/"yes"/"on". Anything else is false. */
const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const num = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const str = (value, fallback = "") => {
  if (value === undefined || value === null) return fallback;
  const trimmed = String(value).trim();
  return trimmed === "" ? fallback : trimmed;
};

/** `config.has` can itself throw on a malformed config; never let it escape. */
const fromConfig = (key) => {
  try {
    return config.has(key) ? config.get(key) : undefined;
  } catch {
    return undefined;
  }
};

/** Environment wins, then the config file, then the default. */
const resolve = (envKey, configKey, cast, fallback) =>
  cast(
    process.env[envKey] !== undefined ? process.env[envKey] : fromConfig(configKey),
    fallback,
  );

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// ---------------------------------------------------------------------------
// The master flag
// ---------------------------------------------------------------------------

/**
 * Read on every call rather than cached at import, so a test can flip
 * process.env.XRAY_ENABLED between cases. The cost is one env lookup; the mount
 * decision in v2.js happens exactly once at boot regardless.
 */
export const isXrayEnabled = () => resolve("XRAY_ENABLED", "xray.enabled", bool, false);

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------

/** Trailing slashes stripped so `${base}/sessions` never doubles up. */
export const xrayServiceUrl = () =>
  resolve("XRAY_SERVICE_URL", "xray.serviceUrl", str, "").replace(/\/+$/, "");

export const xrayApiKey = () => resolve("XRAY_API_KEY", "xray.apiKey", str, "");

/**
 * The service-token secret. Contract §6 names it JWT_SECRET_KEY because that is
 * what the Python repo already calls it; XRAY_JWT_SECRET is offered first so a
 * deployer who does not want to introduce a bare JWT_SECRET_KEY into Node's
 * environment has a namespaced alternative.
 *
 * This is NOT Node's `jwt.secretKey` (which signs user login tokens) and NOT
 * `Backend.token` (which verifies inbound python-backend calls). Three distinct
 * secrets; mixing them up would let a user token act as a service token.
 */
export const xrayJwtSecret = () => {
  const explicit = resolve("XRAY_JWT_SECRET", "xray.jwtSecret", str, "");
  if (explicit) return explicit;
  return str(process.env.JWT_SECRET_KEY, "");
};

export const xrayJwtTtlSec = () =>
  clamp(resolve("XRAY_JWT_TTL_SEC", "xray.jwtTtlSec", num, 120), 30, 300);

export const xrayServiceTimeoutMs = () =>
  clamp(resolve("XRAY_SERVICE_TIMEOUT_MS", "xray.serviceTimeoutMs", num, 15_000), 1_000, 120_000);

export const xrayIdleTimeoutSec = () =>
  clamp(resolve("XRAY_IDLE_TIMEOUT_SEC", "xray.idleTimeoutSec", num, 45), 15, 3_600);

export const xrayReapIntervalSec = () =>
  clamp(resolve("XRAY_REAP_INTERVAL_SEC", "xray.reapIntervalSec", num, 15), 5, 600);

/**
 * How many times the reaper tries to close a session before giving up on it.
 *
 * A failed close leaves the record LIVE on purpose so the next sweep retries —
 * otherwise Node forgets a GPU slot the service is still holding. But "retry
 * forever" is not a terminal state either: if the X-ray service is simply gone,
 * the session stays live and the browser sits there with no masks and no error,
 * waiting indefinitely.
 *
 * So the retries are bounded. After this many failures the session is marked
 * `ended/internal_error` and the browser is TOLD — contract §10: "Service
 * unreachable ⇒ sessions marked ended/internal_error and the frontend told,
 * not left spinning."
 *
 * At the default 15s sweep interval, 5 attempts is about a minute of trying
 * before the slot is written off.
 */
export const xrayCloseMaxAttempts = () =>
  clamp(resolve("XRAY_CLOSE_MAX_ATTEMPTS", "xray.closeMaxAttempts", num, 5), 1, 100);

export const xrayWsPort = () =>
  clamp(resolve("XRAY_WS_PORT", "xray.wsPort", num, 5055), 1, 65_535);

export const xrayWsPath = () => {
  const path = resolve("XRAY_WS_PATH", "xray.wsPath", str, "/internal/xray/ws");
  return path.startsWith("/") ? path : `/${path}`;
};

export const xrayWsPingSec = () =>
  clamp(resolve("XRAY_WS_PING_SEC", "xray.wsPingSec", num, 20), 5, 300);

/**
 * How long a session id may be unknown to this process before an inbound
 * message for it is taken as proof the session is gone.
 *
 * "Unknown" conflates two states that look identical in a single message: a
 * session that has ENDED, and one that has just been BORN and is not written
 * down yet. The service starts streaming the moment it has a session -- its
 * pump is an asyncio task created before `POST /sessions` returns -- so its
 * first `state` frame can reach this process while `createSession` is still
 * between the service's 200 and its Mongo write. Treating that as "gone"
 * makes Node kill the session it is in the middle of creating. Measured
 * against the real Python service: `session ... open` and `asking the service
 * to close (no_session)` landed in the same second, every time.
 *
 * `holdSession` (xray.fanout.js) closes that window inside one process. This
 * grace window covers the case it cannot: with more than one Node process the
 * service's single WebSocket lands on ONE of them while `POST /sessions` may
 * have been served by ANOTHER, so the process receiving the frame has no hold
 * and only Mongo to go on -- and it is racing the other process's write.
 *
 * The cost of being generous is a few seconds of masks for a session that has
 * genuinely ended; the cost of being strict is that no session starts at all.
 */
export const xrayWsUnknownGraceMs = () =>
  clamp(resolve("XRAY_WS_UNKNOWN_GRACE_MS", "xray.wsUnknownGraceMs", num, 3_000), 0, 60_000);

// ---------------------------------------------------------------------------
// Licensing
// ---------------------------------------------------------------------------

/**
 * "auto" | "on" | "off". Default "auto" = defer to the platform's own
 * LICENSING_ENABLED, so an on-premise install (where licensing is switched off
 * wholesale) does not suddenly need an X-ray allocation. "off" makes
 * XRAY_ENABLED the only gate; "on" forces the check even on-prem.
 */
export const xrayLicenseCheckMode = () => {
  const mode = resolve("XRAY_LICENSE_CHECK", "xray.licenseCheck", str, "auto").toLowerCase();
  return ["auto", "on", "off"].includes(mode) ? mode : "auto";
};

/**
 * The allocation row the superadmin writes to grant X-ray.
 *
 * Deliberately NOT a member of constants/detectionTypes.js. That catalogue is a
 * module-scope constant feeding the detection-type dropdown, the licence
 * payload and the superadmin catalogue sync, and an entry there cannot be
 * flag-gated — it would appear in all three with XRAY_ENABLED=false, breaking
 * contract §3. Decision D1 in docs/xray/status_backend.md.
 */
export const xrayLicenseSettingType = () =>
  resolve("XRAY_LICENSE_SETTING_TYPE", "xray.licenseSettingType", str, "xRayMode");

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

/**
 * What is missing before X-ray can actually talk to the Python service.
 *
 * Returns an array of human-readable strings, empty when fully configured. The
 * flag being on with no service URL is a misconfiguration worth saying out loud
 * at boot: the alternative is every session failing with a connection error and
 * nobody knowing why.
 *
 * Phase 1 only reports. Phase 2, which is the first code that actually dials
 * out, is where an unconfigured-but-enabled feature refuses to serve.
 */
export const xrayConfigProblems = () => {
  if (!isXrayEnabled()) return [];
  const problems = [];
  if (!xrayServiceUrl()) problems.push("XRAY_SERVICE_URL is not set");
  if (!xrayApiKey()) problems.push("XRAY_API_KEY is not set");
  if (!xrayJwtSecret()) {
    problems.push("XRAY_JWT_SECRET (or JWT_SECRET_KEY) is not set — service calls cannot be signed");
  }
  return problems;
};

/**
 * One-line, secret-free summary for the boot log. Secrets are reported as
 * set/missing, never echoed.
 */
export const xrayConfigSummary = () => ({
  enabled: isXrayEnabled(),
  serviceUrl: xrayServiceUrl() || "(unset)",
  apiKey: xrayApiKey() ? "set" : "(unset)",
  jwtSecret: xrayJwtSecret() ? "set" : "(unset)",
  jwtTtlSec: xrayJwtTtlSec(),
  serviceTimeoutMs: xrayServiceTimeoutMs(),
  idleTimeoutSec: xrayIdleTimeoutSec(),
  reapIntervalSec: xrayReapIntervalSec(),
  closeMaxAttempts: xrayCloseMaxAttempts(),
  wsPort: xrayWsPort(),
  wsPath: xrayWsPath(),
  wsPingSec: xrayWsPingSec(),
  wsUnknownGraceMs: xrayWsUnknownGraceMs(),
  licenseCheck: xrayLicenseCheckMode(),
  licenseSettingType: xrayLicenseSettingType(),
});

export default {
  isXrayEnabled,
  xrayServiceUrl,
  xrayApiKey,
  xrayJwtSecret,
  xrayJwtTtlSec,
  xrayServiceTimeoutMs,
  xrayIdleTimeoutSec,
  xrayReapIntervalSec,
  xrayCloseMaxAttempts,
  xrayWsPort,
  xrayWsPath,
  xrayWsPingSec,
  xrayWsUnknownGraceMs,
  xrayLicenseCheckMode,
  xrayLicenseSettingType,
  xrayConfigProblems,
  xrayConfigSummary,
};
