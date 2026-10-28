import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApiCacheRedis } from "../../helpers/fakeApiCacheRedis.js";

const transport = vi.hoisted(() => ({ client: null, options: null }));
vi.mock("ioredis", () => ({
  default: class {
    constructor(options) {
      transport.options = options;
      Object.assign(this, transport.client);
      return this;
    }
  },
}));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("optional API cache Redis connection", () => {
  it("bypasses cold/disconnected Redis, uses bounded commands, and rotates epoch after reconnect", async () => {
    const handlers = {};
    const redis = fakeApiCacheRedis();
    redis.status = "ready";
    redis.on = (name, handler) => { handlers[name] = handler; };
    redis.connect = vi.fn().mockResolvedValue(undefined);
    const set = vi.spyOn(redis, "set");
    transport.client = redis;
    vi.stubEnv("API_CACHE_ENABLED", "true");
    const { apiCache } = await import("../../../services/apiCache.service.js");
    const req = { method: "GET", baseUrl: "/api/v2", path: "/shifts", query: {},
      verified: { userData: { adminId: "admin-1" } } };
    const next = vi.fn();
    await apiCache.read(["shifts"], 15)(req, {}, next);
    expect(next).toHaveBeenCalledOnce();
    expect(transport.options).toMatchObject({ enableOfflineQueue: false, maxRetriesPerRequest: 0,
      commandTimeout: 100, connectTimeout: 300 });
    await handlers.ready();
    const firstEpoch = await redis.get("videoraiq:api-cache:v1:epoch");
    await apiCache.invalidate(["shifts"]);
    expect(set).toHaveBeenCalledWith("videoraiq:api-cache:v1:revision:shifts", expect.any(String));
    handlers.close();
    set.mockClear();
    await apiCache.invalidate(["shifts"]);
    expect(set).not.toHaveBeenCalled();
    await handlers.ready();
    expect(await redis.get("videoraiq:api-cache:v1:epoch")).not.toBe(firstEpoch);
  });

  it("does not open a connection when disabled", async () => {
    vi.stubEnv("API_CACHE_ENABLED", "false");
    transport.options = null;
    const { apiCache } = await import("../../../services/apiCache.service.js");
    await apiCache.invalidate(["shifts"]);
    expect(transport.options).toBeNull();
  });
});
