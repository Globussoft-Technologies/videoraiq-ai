import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import config from "config";
import { getRequestTimezone } from "../utils/timezone.js";

// A separate connection keeps optional caching independent of BullMQ/session
// commands, whose existing connection deliberately waits indefinitely.
const PREFIX = "videoraiq:api-cache:v1";
const MAX_BYTES = 512 * 1024;
let client;
let ready = false;

function connection() {
  if (process.env.API_CACHE_ENABLED === "false" ||
      (process.env.NODE_ENV === "test" && process.env.API_CACHE_ENABLED !== "true")) return null;
  if (!client) {
    client = new Redis({
      host: config.get("Redis.host"), port: config.get("Redis.port"),
      username: config.get("Redis.username"), password: config.get("Redis.password"),
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
      commandTimeout: 100, connectTimeout: 300,
      retryStrategy: () => 5000,
    });
    client.on("error", () => { ready = false; });
    client.on("close", () => { ready = false; });
    client.on("ready", async () => {
      try {
        // Old entries cannot survive a reconnect after missed invalidations.
        await client.set(`${PREFIX}:epoch`, randomUUID());
        ready = true;
      } catch { ready = false; }
    });
    client.connect().catch(() => {});
  }
  return ready && client.status === "ready" ? client : null;
}

function stable(value) {
  if (value == null || typeof value !== "object") return value;
  if (typeof value.toJSON === "function") return stable(value.toJSON());
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

export function requestCacheIdentity(req) {
  const user = req.verified?.userData;
  if (!user?.adminId) return null; // Never cache anonymous/service-only requests.
  const timezone = getRequestTimezone(req).replace(/^Asia\/Calcutta$/i, "Asia/Kolkata");
  return JSON.stringify(stable({
    path: req.baseUrl + req.path, method: req.method,
    // Include verified claims/scope rather than trusting browser identity.
    user: { ...user, timezone }, access: req.verified.authorizedChannel,
    permissions: req.verified.permissionConfig, apiKey: req.verified.apiKey,
    timezone, day: new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()),
    query: req.query, body: req.body,
  }));
}

export function createApiCache({ getClient = connection } = {}) {
  async function revision(redis, domains) {
    const keys = [`${PREFIX}:epoch`, ...domains.map(d => `${PREFIX}:revision:${d}`)];
    let values = await redis.mget(...keys);
    if (!values[0]) return null;
    // A missing/evicted revision must never reuse an old "null revision" key.
    if (values.some(value => !value)) {
      await Promise.all(keys.slice(1).filter((_key, index) => !values[index + 1])
        .map(key => redis.set(key, randomUUID(), "NX")));
      values = await redis.mget(...keys);
      if (values.some(value => !value)) return null;
    }
    return JSON.stringify(values);
  }

  async function invalidate(domains) {
    try {
      const redis = getClient();
      if (!redis) return;
      // Fixed-size revision keys avoid SCAN/KEYS and races with in-flight reads.
      const transaction = redis.multi();
      for (const domain of domains) transaction.set(`${PREFIX}:revision:${domain}`, randomUUID());
      await transaction.exec();
    } catch { /* Cache availability must never fail a database write. */ }
  }

  function read(domains, ttlSeconds, { canCache = () => true } = {}) {
    return async (req, res, next) => {
      let redis, key;
      try {
        const identity = requestCacheIdentity(req);
        if (!identity || req.query?.export || /no-cache|no-store/i.test(req.get?.("Cache-Control") || "")) return next();
        redis = getClient();
        if (!redis) return next();
        const version = await revision(redis, domains);
        if (!version) return next();
        key = `${PREFIX}:data:${createHash("sha256").update(identity + version).digest("hex")}`;
        const cached = await redis.get(key);
        if (cached) {
          const entry = JSON.parse(cached);
          if (entry?.body?.body?.status === "success") {
            return res.status(entry.status).json(entry.body);
          }
        }
      } catch { return next(); }

      let captured = false;
      function capture(body) {
        if (captured || !body || typeof body !== "object") return;
        captured = true;
        if (res.statusCode !== 200 || body.statusCode !== 200 || body.body?.status !== "success") return;
        try {
          if (!canCache(body)) return;
          const value = JSON.stringify({ status: res.statusCode, body });
          if (Buffer.byteLength(value) <= MAX_BYTES) {
            // Use the revision from BEFORE the DB read: a concurrent write
            // makes this entry unreachable even if it finishes filling later.
            Promise.resolve(redis.set(key, value, "EX", ttlSeconds)).catch(() => {});
          }
        } catch { /* Serialization/caching cannot change the original response. */ }
      }
      const json = res.json;
      const send = res.send;
      res.json = function (body) { capture(body); return json.call(this, body); };
      res.send = function (body) { capture(body); return send.call(this, body); };
      return next();
    };
  }
  return { read, invalidate };
}

export const apiCache = createApiCache();

// Model-level hooks cover shared v1/v2 models, scheduled work and bulk writes.
// Collection-wide revisions deliberately favor correctness over narrow eviction.
export function invalidateApiCache(schema, { domains }) {
  const invalidate = async () => { await apiCache.invalidate(domains); };
  const invalidateOnError = function (error, _result, next) {
    // An unordered bulk operation may persist some rows before reporting an
    // error. Preserve that error while also discarding possibly stale reads.
    apiCache.invalidate(domains).then(() => next(error), () => next(error));
  };
  for (const operation of ["save", "insertMany", "bulkWrite", "updateOne", "updateMany",
    "replaceOne", "findOneAndUpdate", "findOneAndReplace", "findOneAndDelete", "deleteMany"]) {
    schema.post(operation, invalidate);
    schema.post(operation, invalidateOnError);
  }
  schema.post("deleteOne", { document: true, query: true }, invalidate);
  schema.post("deleteOne", { document: true, query: true }, invalidateOnError);
}

export const CACHE_DOMAINS = {
  departments: ["departments", "employees", "access"],
  shifts: ["shifts", "employees", "departments", "schedule", "admin", "access"],
  nvrs: ["nvrs", "admin", "access"],
  channels: ["channels", "nvrs", "departments", "admin", "access"],
  attendance: ["attendance", "employees", "shifts", "schedule", "attendanceSettings", "departments", "channels", "nvrs", "admin", "access"],
  dashboard: ["incidents", "channels", "nvrs", "admin", "access"],
};

// Both API versions use the same policy, defined once here.
export const cacheReads = {
  departments: apiCache.read(CACHE_DOMAINS.departments, 900),
  shifts: apiCache.read(CACHE_DOMAINS.shifts, 900),
  nvrs: apiCache.read(CACHE_DOMAINS.nvrs, 900),
  channels: apiCache.read(CACHE_DOMAINS.channels, 900, {
    // URL registration can fail while the endpoint still reports success.
    // Preserve its existing retry-on-next-request behavior in that case.
    canCache: payload => (payload.body?.data?.channels || []).every(channel => channel.streamingUrl),
  }),
  attendance: apiCache.read(CACHE_DOMAINS.attendance, 15),
  dashboard: apiCache.read(CACHE_DOMAINS.dashboard, 10),
};
