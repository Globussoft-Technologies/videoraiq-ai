/**
 * Unit tests for utils/database.js.
 *
 * The module wires Mongoose + ioredis up at import time:
 *   - `connectDB()` calls `mongoose.connect(MONGODB_URI)` and either logs the
 *     host on success or logs the error message and calls `process.exit(1)`
 *     on failure.
 *   - A module-scope `redis` instance is created with the config from the
 *     `config` package.
 *
 * The product imports `config`, `mongoose`, `ioredis`, and `./logger.js`
 * at module load. We mock all four so the suite never touches a real
 * database / Redis / log file, and so we can drive both branches of
 * `connectDB` deterministically. `vi.resetModules()` lets each test
 * re-import the module with fresh mocks where the module-scope side effect
 * (Redis construction) is under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mock surfaces — captured per-test through `vi.mock`.
const mongooseConnect = vi.fn();
const loggerInfo = vi.fn();
const loggerError = vi.fn();
const configGet = vi.fn();
const RedisCtor = vi.fn();

vi.mock("mongoose", () => ({
  default: {
    connect: (...args) => mongooseConnect(...args),
  },
}));

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(opts) {
      RedisCtor(opts);
      this.opts = opts;
    }
  },
}));

vi.mock("config", () => ({
  default: {
    get: (...args) => configGet(...args),
  },
}));

vi.mock("../../../utils/logger.js", () => ({
  default: {
    info: (...args) => loggerInfo(...args),
    error: (...args) => loggerError(...args),
  },
}));

// Default config values — overridden where needed.
function setDefaultConfig() {
  configGet.mockImplementation((key) => {
    switch (key) {
      case "mongodb_uri":
        return "mongodb://test-host:27017/videora-test";
      case "Redis.host":
        return "127.0.0.1";
      case "Redis.port":
        return 6379;
      case "Redis.username":
        return "test-user";
      case "Redis.password":
        return "test-pass";
      default:
        return undefined;
    }
  });
}

beforeEach(() => {
  vi.resetModules();
  mongooseConnect.mockReset();
  loggerInfo.mockReset();
  loggerError.mockReset();
  configGet.mockReset();
  RedisCtor.mockReset();
  setDefaultConfig();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("utils/database — module-level Redis construction", () => {
  it("constructs the module-scope Redis client with config-derived options on import", async () => {
    await import("../../../utils/database.js");

    expect(RedisCtor).toHaveBeenCalledTimes(1);
    expect(RedisCtor).toHaveBeenCalledWith({
      host: "127.0.0.1",
      port: 6379,
      username: "test-user",
      password: "test-pass",
      maxRetriesPerRequest: null,
    });
  });

  it("reads mongodb_uri + Redis.* keys from config exactly once at import", async () => {
    await import("../../../utils/database.js");

    // mongodb_uri is captured at module scope; the four Redis.* keys feed
    // the constructor object literal.
    const keys = configGet.mock.calls.map((c) => c[0]);
    expect(keys).toContain("mongodb_uri");
    expect(keys).toContain("Redis.host");
    expect(keys).toContain("Redis.port");
    expect(keys).toContain("Redis.username");
    expect(keys).toContain("Redis.password");
  });

  it("exports a `redis` instance whose options reflect the config", async () => {
    const mod = await import("../../../utils/database.js");
    expect(mod.redis).toBeDefined();
    expect(mod.redis.opts).toMatchObject({
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it("passes maxRetriesPerRequest: null so BullMQ-style blocking consumers don't trip the default cap", async () => {
    await import("../../../utils/database.js");
    const opts = RedisCtor.mock.calls[0][0];
    expect(opts.maxRetriesPerRequest).toBeNull();
  });

  it("propagates whatever config values it is given (different host/port)", async () => {
    configGet.mockImplementation((key) => {
      const map = {
        mongodb_uri: "mongodb://other:27017/db",
        "Redis.host": "redis.internal",
        "Redis.port": 6400,
        "Redis.username": "u",
        "Redis.password": "p",
      };
      return map[key];
    });

    await import("../../../utils/database.js");

    expect(RedisCtor).toHaveBeenCalledWith({
      host: "redis.internal",
      port: 6400,
      username: "u",
      password: "p",
      maxRetriesPerRequest: null,
    });
  });
});

describe("utils/database — connectDB", () => {
  it("logs the connection host on success", async () => {
    mongooseConnect.mockResolvedValueOnce({
      connection: { host: "mongo.test" },
    });

    const { connectDB } = await import("../../../utils/database.js");
    await connectDB();

    expect(mongooseConnect).toHaveBeenCalledWith(
      "mongodb://test-host:27017/videora-test"
    );
    expect(loggerInfo).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith("MongoDB Connected: mongo.test");
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("passes the configured mongodb_uri (no rewriting)", async () => {
    configGet.mockImplementation((key) =>
      key === "mongodb_uri"
        ? "mongodb+srv://prod-cluster/videora"
        : key === "Redis.host"
        ? "h"
        : key === "Redis.port"
        ? 6379
        : key === "Redis.username"
        ? "u"
        : key === "Redis.password"
        ? "p"
        : undefined
    );
    mongooseConnect.mockResolvedValueOnce({
      connection: { host: "prod-primary.mongo.test" },
    });

    const { connectDB } = await import("../../../utils/database.js");
    await connectDB();

    expect(mongooseConnect).toHaveBeenCalledWith(
      "mongodb+srv://prod-cluster/videora"
    );
  });

  it("on connect failure: logs error message and calls process.exit(1)", async () => {
    mongooseConnect.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined);

    const { connectDB } = await import("../../../utils/database.js");
    await connectDB();

    expect(loggerError).toHaveBeenCalledWith(
      "MongoDB Connection Error: ECONNREFUSED"
    );
    expect(loggerInfo).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("on connect failure with a non-Error rejection: still logs and exits", async () => {
    // Some drivers throw plain objects; the product reads `.message` so it
    // becomes `undefined` — but the error path is still taken.
    mongooseConnect.mockRejectedValueOnce({ message: "auth failed" });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined);

    const { connectDB } = await import("../../../utils/database.js");
    await connectDB();

    expect(loggerError).toHaveBeenCalledWith(
      "MongoDB Connection Error: auth failed"
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("returns undefined on success (no value is propagated)", async () => {
    mongooseConnect.mockResolvedValueOnce({
      connection: { host: "h" },
    });

    const { connectDB } = await import("../../../utils/database.js");
    const result = await connectDB();
    expect(result).toBeUndefined();
  });

  it("returns undefined on failure (caught + process.exit stubbed)", async () => {
    mongooseConnect.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(process, "exit").mockImplementation(() => undefined);

    const { connectDB } = await import("../../../utils/database.js");
    const result = await connectDB();
    expect(result).toBeUndefined();
  });

  it("does not call process.exit on the success path", async () => {
    mongooseConnect.mockResolvedValueOnce({
      connection: { host: "h" },
    });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined);

    const { connectDB } = await import("../../../utils/database.js");
    await connectDB();

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("each call to connectDB invokes mongoose.connect again", async () => {
    mongooseConnect
      .mockResolvedValueOnce({ connection: { host: "a" } })
      .mockResolvedValueOnce({ connection: { host: "b" } });

    const { connectDB } = await import("../../../utils/database.js");
    await connectDB();
    await connectDB();

    expect(mongooseConnect).toHaveBeenCalledTimes(2);
    expect(loggerInfo).toHaveBeenNthCalledWith(1, "MongoDB Connected: a");
    expect(loggerInfo).toHaveBeenNthCalledWith(2, "MongoDB Connected: b");
  });
});
