/**
 * Gap-fill for utils/sftpConnectionCheck.js — covers line 13 (the idle
 * auto-close timer callback firing closeSftpConnection()). The baseline
 * suite never lets the IDLE_TIMEOUT_MS timer fire; here we use fake timers
 * to fast-forward 30 minutes and assert the closure ran.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function makeMockClient() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    end: vi.fn().mockResolvedValue(undefined),
    sftp: { fake: true },
  };
}

let mockClients;
let mockClientCtor;

vi.mock("ssh2-sftp-client", () => {
  mockClientCtor = vi.fn(() => {
    const c = makeMockClient();
    mockClients.push(c);
    return c;
  });
  return { default: mockClientCtor };
});

beforeEach(() => {
  mockClients = [];
  vi.resetModules();
});

afterEach(async () => {
  vi.useRealTimers();
  try {
    const mod = await import("../../../utils/sftpConnectionCheck.js");
    await mod.closeSftpConnection();
  } catch {
    // ignore
  }
});

describe("sftpConnectionCheck idle timer", () => {
  it("idle timer fires closeSftpConnection() after the configured timeout", async () => {
    vi.useFakeTimers();

    const { checkSftpConnection } = await import(
      "../../../utils/sftpConnectionCheck.js"
    );

    const inst = await checkSftpConnection();
    expect(inst.end).not.toHaveBeenCalled();

    // IDLE_TIMEOUT_MS = 30 * 60 * 1000 — advance past it to fire the timer.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1000);

    // The timer callback calls closeSftpConnection() which ends the client.
    expect(inst.end).toHaveBeenCalledTimes(1);
  });
});
