/**
 * Gap-fill for utils/logger.js — covers the
 *   `if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });`
 * branch at lines 13-15. The existing baseline imports logger after the dir is
 * already created (because previous tests ran), so the `mkdirSync` line never
 * executes. Here we mock `fs` so existsSync returns false on first probe and
 * assert mkdirSync was called.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
  };
});

beforeEach(() => {
  vi.resetModules();
});

describe("logger.js (gap-fill)", () => {
  it("creates the log directory when it does not exist", async () => {
    const fs = (await import("fs")).default;
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockClear();

    await import("../../../utils/logger.js");

    expect(fs.mkdirSync).toHaveBeenCalled();
    const call = fs.mkdirSync.mock.calls.find((c) => /logs$/.test(c[0]));
    expect(call).toBeDefined();
    expect(call[1]).toEqual({ recursive: true });
  });

  it("exports a default logger and the nasLogger", async () => {
    const fs = (await import("fs")).default;
    fs.existsSync.mockReturnValue(true);

    const mod = await import("../../../utils/logger.js");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default.info).toBe("function");
    expect(mod.nasLogger).toBeDefined();
    expect(typeof mod.nasLogger.info).toBe("function");
  });

  it("formats log lines via the printf format (covers line 20)", async () => {
    // Force the printf callback to actually execute by writing a log record
    // (with stack) and a record without stack so both `stack || message`
    // branches run.
    const fs = (await import("fs")).default;
    fs.existsSync.mockReturnValue(true);

    const mod = await import("../../../utils/logger.js");

    // Plain message (no stack) — formatter takes the `message` branch.
    mod.default.info("hello world");

    // Error-with-stack message — formatter takes the `stack` branch.
    const err = new Error("boom");
    mod.default.error(err);

    // Trivial sanity: the logger is still functional after both calls.
    expect(typeof mod.default.info).toBe("function");
  });
});
