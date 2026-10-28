import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createApiCache, requestCacheIdentity } from "../../../services/apiCache.service.js";
import { fakeApiCacheRedis } from "../../helpers/fakeApiCacheRedis.js";

const success = data => ({ statusCode: 200, body: { status: "success", data } });
let redis, cache, app, verified, calls, response, dependencies, available;
beforeEach(() => {
  redis = fakeApiCacheRedis();
  available = true;
  cache = createApiCache({ getClient: () => available ? redis : null });
  verified = { userData: { adminId: "admin-1", timezone: "Asia/Kolkata" } };
  calls = 0;
  response = () => success({ calls: ++calls });
  dependencies = ["shifts"];
  app = express();
  app.use(express.json());
  // Represents auth and permission checks, which always precede caching.
  app.use((req, res, next) => {
    if (req.get("x-denied")) return res.status(403).json({ denied: true });
    req.verified = verified;
    next();
  });
  app.post("/read", cache.read(dependencies, 15), (_req, res) => res.send(response()));
});
const read = (app, body = {}) => request(app).post("/read").send(body);

describe("shared API read cache", () => {
  it("preserves response bodies and caches repeated JSON/send responses until expiry", async () => {
    const first = await read(app);
    expect((await read(app)).body).toEqual(first.body);
    expect(calls).toBe(1);
    redis.advance(15001);
    expect((await read(app)).body.body.data.calls).toBe(2);
  });

  it("invalidates cached data immediately after a write", async () => {
    await read(app);
    await cache.invalidate(["shifts"]);
    expect((await read(app)).body.body.data.calls).toBe(2);
  });

  it("keeps unrelated domains cached", async () => {
    await read(app);
    await cache.invalidate(["attendance"]);
    await read(app);
    expect(calls).toBe(1);
  });

  it("never resurrects old entries when a revision is evicted or Redis reconnects", async () => {
    await read(app);
    await cache.invalidate(["shifts"]);
    await read(app);
    redis.values.delete("videoraiq:api-cache:v1:revision:shifts");
    expect((await read(app)).body.body.data.calls).toBe(3);
    await redis.set("videoraiq:api-cache:v1:epoch", "reconnected");
    expect((await read(app)).body.body.data.calls).toBe(4);
  });

  it("isolates tenants, members, access restrictions, timezone, body, and query filters", async () => {
    await read(app);
    verified.userData.adminId = "admin-2";
    await read(app);
    verified.userData.memberId = "member-1";
    await read(app);
    verified.authorizedChannel = { channels: ["camera-1"] };
    await read(app);
    verified.userData.timezone = "Asia/Dubai";
    await read(app);
    await read(app, { locations: ["Office"] });
    await request(app).post("/read?skip=10").send({});
    expect(calls).toBe(7);
  });

  it("normalizes timezone aliases and object key order without accepting browser timezone as authority", () => {
    const req = { method: "POST", baseUrl: "/api/v2", path: "/read", verified,
      query: { b: "2", a: "1" }, body: {} };
    const key = requestCacheIdentity(req);
    verified.userData.timezone = "Asia/Calcutta";
    req.query = { a: "1", b: "2" };
    expect(requestCacheIdentity(req)).toBe(key);
    req.body.timezone = "America/New_York";
    expect(JSON.parse(requestCacheIdentity(req)).timezone).toBe("Asia/Kolkata");
  });

  it("checks access on every request even when the response is cached", async () => {
    await read(app);
    expect((await request(app).post("/read").set("x-denied", "yes").send({})).status).toBe(403);
    expect(calls).toBe(1);
  });

  it("bypasses anonymous requests, exports and explicit cache refreshes", async () => {
    verified = {};
    await read(app);
    await read(app);
    verified = { userData: { adminId: "admin-1" } };
    await request(app).post("/read?export=true").send({});
    await request(app).post("/read?export=true").send({});
    await request(app).post("/read").set("Cache-Control", "no-cache").send({});
    await request(app).post("/read").set("Cache-Control", "no-cache").send({});
    expect(calls).toBe(6);
  });

  it("never caches application errors returned with HTTP 200", async () => {
    response = () => { calls++; return { statusCode: 400, body: { status: "failed" } }; };
    await read(app);
    await read(app);
    expect(calls).toBe(2);
  });

  it("falls back to the original handler when Redis is unavailable or fails", async () => {
    available = false;
    expect((await read(app)).status).toBe(200);
    available = true;
    redis.get = vi.fn().mockRejectedValue(new Error("Redis down"));
    expect((await read(app)).status).toBe(200);
    await expect(cache.invalidate(["shifts"])).resolves.toBeUndefined();
    redis.multi = () => { throw new Error("Redis down"); };
    await expect(cache.invalidate(["shifts"])).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it("ignores corrupt cache entries and failed cache writes", async () => {
    redis.get = vi.fn().mockResolvedValue("{broken");
    redis.mget = vi.fn().mockResolvedValue(["epoch", "shifts-revision"]);
    expect((await read(app)).status).toBe(200);
    redis.get.mockResolvedValue(null);
    redis.set = vi.fn().mockRejectedValue(new Error("Redis full"));
    expect((await read(app)).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does not cache oversized responses", async () => {
    response = () => { calls++; return success("x".repeat(513 * 1024)); };
    await read(app);
    await read(app);
    expect(calls).toBe(2);
  });

  it("keeps retrying incomplete successful results when the endpoint policy rejects caching", async () => {
    const retryApp = express();
    retryApp.use((req, _res, next) => { req.verified = verified; next(); });
    retryApp.get("/cameras", cache.read(["channels"], 900, {
      canCache: payload => payload.body.data.channels.every(channel => channel.streamingUrl),
    }), (_req, res) => {
      calls++;
      res.json(success({ channels: [{ streamingUrl: calls < 2 ? null : "https://stream.test/live" }] }));
    });
    expect((await request(retryApp).get("/cameras")).body.body.data.channels[0].streamingUrl).toBeNull();
    await request(retryApp).get("/cameras");
    await request(retryApp).get("/cameras");
    expect(calls).toBe(2);
  });

  it("makes stale fills unreachable when a write races an in-flight read", async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    let started;
    const reached = new Promise(resolve => { started = resolve; });
    const slowApp = express();
    slowApp.use((req, _res, next) => { req.verified = verified; next(); });
    slowApp.get("/slow", cache.read(["shifts"], 15), async (_req, res) => {
      const snapshot = ++calls;
      if (snapshot === 1) { started(); await pending; }
      res.json(success(snapshot));
    });
    const first = request(slowApp).get("/slow").then(r => r);
    await reached;
    await cache.invalidate(["shifts"]);
    finish();
    await first;
    expect((await request(slowApp).get("/slow")).body.body.data).toBe(2);
  });
});
