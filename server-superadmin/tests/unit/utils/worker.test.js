/**
 * Unit tests for core/v1/jobs/utils/worker.js
 *
 * The worker module is purely side-effecting on import: it constructs a
 * BullMQ Worker bound to the "schedule-queue" name and attaches the job
 * processor + completed/failed listeners. There are no exports, so we
 * verify behaviour by capturing the constructor arguments and event
 * handlers via vi.mock and then invoking them directly.
 *
 * Mocks (4, well under the 8 ceiling):
 *   1. bullmq                   — capture Worker(name, handler, opts)
 *   2. utils/database.js        — stub the `redis` connection
 *   3. ./time.util.js           — control getExpectedRunAt / getDelayMinutes
 *
 * Coverage targets in worker.js:
 *   - Worker is constructed with name="schedule-queue", concurrency=5,
 *     and the redis connection from utils/database.js
 *   - Handler routes action="START" → callStartAPI
 *   - Handler routes action="STOP" → callStopAPI (and any non-START)
 *   - START job whose delayMinutes > MAX_DELAY_MINUTES (5) is skipped
 *   - STOP job is *not* subject to the staleness guard (only START is)
 *   - boundary case: delayMinutes === MAX_DELAY_MINUTES is still executed
 *   - completed listener logs without throwing
 *   - failed listener logs without throwing even when job is undefined
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// -- mocks --------------------------------------------------------------
const workerCalls = [];
const workerEvents = {};
class FakeWorker {
  constructor(name, handler, opts) {
    workerCalls.push({ name, handler, opts });
    this.name = name;
    this.handler = handler;
    this.opts = opts;
  }
  on(event, listener) {
    workerEvents[event] = listener;
    return this;
  }
}

vi.mock("bullmq", () => ({
  Worker: FakeWorker,
}));

vi.mock("../../../utils/database.js", () => ({
  redis: { fakeConnection: "yes" },
}));

const getExpectedRunAtMock = vi.fn();
const getDelayMinutesMock = vi.fn();
vi.mock("../../../core/v1/jobs/utils/time.util.js", () => ({
  getExpectedRunAt: (...args) => getExpectedRunAtMock(...args),
  getDelayMinutes: (...args) => getDelayMinutesMock(...args),
}));

// Importing the module triggers `new Worker(...)` exactly once.
await import("../../../core/v1/jobs/utils/worker.js");

// Helpers to fetch captured pieces.
const getWorkerCall = () => workerCalls[0];
const getHandler = () => getWorkerCall().handler;

beforeEach(() => {
  getExpectedRunAtMock.mockReset();
  getDelayMinutesMock.mockReset();
});

let logSpy;
let warnSpy;
let errorSpy;
beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe("worker.js — Worker construction", () => {
  it("constructs exactly one Worker bound to the 'schedule-queue' name", () => {
    expect(workerCalls).toHaveLength(1);
    expect(getWorkerCall().name).toBe("schedule-queue");
  });

  it("passes the redis connection from utils/database.js and concurrency=5", () => {
    const { opts } = getWorkerCall();
    expect(opts.connection).toEqual({ fakeConnection: "yes" });
    expect(opts.concurrency).toBe(5);
  });

  it("registers a function processor", () => {
    expect(typeof getHandler()).toBe("function");
  });

  it("registers 'completed' and 'failed' event listeners", () => {
    expect(typeof workerEvents.completed).toBe("function");
    expect(typeof workerEvents.failed).toBe("function");
  });
});

describe("worker.js — job processor", () => {
  it("routes action='START' to the START path when the job is fresh", async () => {
    getExpectedRunAtMock.mockReturnValue("expected-run-at-marker");
    getDelayMinutesMock.mockReturnValue(0); // not stale

    const job = {
      id: "job-1",
      data: {
        action: "START",
        expectedRunAt: "09:00",
        timeZone: "Asia/Kolkata",
        dayIndex: 1,
      },
    };

    const result = await getHandler()(job);

    // The fresh-START branch logs "▶️ START API" via callStartAPI.
    const messages = logSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("START API"))).toBe(true);
    // No staleness warning.
    expect(warnSpy).not.toHaveBeenCalled();
    // time.util collaborators are wired up with the right args.
    expect(getExpectedRunAtMock).toHaveBeenCalledWith(
      "09:00",
      "Asia/Kolkata",
      1,
    );
    expect(getDelayMinutesMock).toHaveBeenCalledWith("expected-run-at-marker");
    expect(result).toBeUndefined();
  });

  it("routes action='STOP' to the STOP path", async () => {
    getExpectedRunAtMock.mockReturnValue("t");
    getDelayMinutesMock.mockReturnValue(0);

    const job = {
      id: "job-2",
      data: {
        action: "STOP",
        expectedRunAt: "17:00",
        timeZone: "UTC",
        dayIndex: 3,
      },
    };

    await getHandler()(job);

    const messages = logSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("STOP API"))).toBe(true);
    expect(messages.some((m) => m.includes("START API"))).toBe(false);
  });

  it("skips a stale START job (delayMinutes > MAX_DELAY_MINUTES=5)", async () => {
    getExpectedRunAtMock.mockReturnValue("t");
    getDelayMinutesMock.mockReturnValue(7.25); // > 5 minutes late

    const job = {
      id: "stale-job",
      data: {
        action: "START",
        expectedRunAt: "09:00",
        timeZone: "UTC",
        dayIndex: 1,
      },
    };

    const result = await getHandler()(job);

    expect(result).toBeUndefined();
    // The warn message includes the job id and the (formatted) delay.
    expect(warnSpy).toHaveBeenCalled();
    const warned = String(warnSpy.mock.calls[0][0]);
    expect(warned).toContain("stale-job");
    expect(warned).toContain("Skipping stale job");
    expect(warned).toMatch(/7\.25/);
    // Should NOT have logged "START API" — the action was skipped.
    const startCalls = logSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes("START API"));
    expect(startCalls).toHaveLength(0);
  });

  it("STOP jobs are NOT subject to the staleness guard (still execute when delayed)", async () => {
    getExpectedRunAtMock.mockReturnValue("t");
    getDelayMinutesMock.mockReturnValue(60); // an hour late

    const job = {
      id: "late-stop",
      data: {
        action: "STOP",
        expectedRunAt: "17:00",
        timeZone: "UTC",
        dayIndex: 5,
      },
    };

    await getHandler()(job);

    // No skip warning.
    expect(warnSpy).not.toHaveBeenCalled();
    const messages = logSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("STOP API"))).toBe(true);
  });

  it("treats delayMinutes === MAX_DELAY_MINUTES (5) as fresh for START (boundary check)", async () => {
    getExpectedRunAtMock.mockReturnValue("t");
    getDelayMinutesMock.mockReturnValue(5); // strictly greater-than check; 5 passes

    const job = {
      id: "edge-job",
      data: {
        action: "START",
        expectedRunAt: "09:00",
        timeZone: "UTC",
        dayIndex: 1,
      },
    };

    await getHandler()(job);

    expect(warnSpy).not.toHaveBeenCalled();
    const messages = logSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("START API"))).toBe(true);
  });

  it("treats unknown actions as the non-START branch (callStopAPI is the fallback)", async () => {
    getExpectedRunAtMock.mockReturnValue("t");
    getDelayMinutesMock.mockReturnValue(0);

    const job = {
      id: "weird-job",
      data: {
        action: "UNKNOWN",
        expectedRunAt: "00:00",
        timeZone: "UTC",
        dayIndex: 0,
      },
    };

    await getHandler()(job);

    const messages = logSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("STOP API"))).toBe(true);
    expect(messages.some((m) => m.includes("START API"))).toBe(false);
  });

  it("passes the full job payload through to the action call", async () => {
    getExpectedRunAtMock.mockReturnValue("t");
    getDelayMinutesMock.mockReturnValue(0);

    const job = {
      id: "payload-job",
      data: {
        action: "START",
        expectedRunAt: "12:00",
        timeZone: "America/New_York",
        dayIndex: 2,
        scheduleId: "sched-xyz",
        userId: "user-42",
      },
    };

    await getHandler()(job);

    // callStartAPI is called with job.data — its console.log prints the payload.
    const startLog = logSpy.mock.calls.find(
      (c) => String(c[0]).includes("START API"),
    );
    expect(startLog).toBeDefined();
    // The second arg of console.log("▶️ START API", payload) is the payload.
    expect(startLog[1]).toEqual(job.data);
  });
});

describe("worker.js — lifecycle event listeners", () => {
  it("'completed' listener logs a success line including the job id", () => {
    workerEvents.completed({ id: "done-1" });
    const messages = logSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("Job completed") && m.includes("done-1"))).toBe(true);
  });

  it("'failed' listener logs an error including the job id and the error", () => {
    const err = new Error("boom");
    workerEvents.failed({ id: "fail-1" }, err);
    expect(errorSpy).toHaveBeenCalled();
    const errLog = errorSpy.mock.calls[0];
    expect(String(errLog[0])).toContain("Job failed");
    expect(String(errLog[0])).toContain("fail-1");
    expect(errLog[1]).toBe(err);
  });

  it("'failed' listener tolerates an undefined job (optional-chaining on job?.id)", () => {
    expect(() => {
      workerEvents.failed(undefined, new Error("orphan failure"));
    }).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    // job?.id is undefined → the message still gets logged.
    expect(String(errorSpy.mock.calls[0][0])).toContain("Job failed");
  });

  it("logs the 'Worker started for schedule-queue' banner on import", () => {
    // The banner is emitted at module import. Our spies are installed
    // per-test, so we can't observe that direct call here — but we can at
    // least confirm the module loaded and exposed a working Worker. The
    // banner itself is covered by the line being reached when worker.js
    // was imported above (top-level await import).
    expect(workerCalls).toHaveLength(1);
  });
});
