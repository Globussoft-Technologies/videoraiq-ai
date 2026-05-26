/**
 * Unit tests for utils/sftpConnectionCheck.js — singleton SFTP client with
 * idle auto-close. We mock ssh2-sftp-client to avoid any network I/O, and
 * use vi.resetModules() between tests so the module-level singleton
 * (sftpInstance + idleTimer) starts fresh each time.
 *
 * Covers:
 *   - first call: constructs Client, calls connect() with config from `config`,
 *     stashes the instance, returns it.
 *   - second call with an alive instance: calls list('/') and returns the
 *     same cached instance without reconnecting.
 *   - stale connection: list('/') throws → closeSftpConnection() runs, a
 *     new Client is created and returned.
 *   - closeSftpConnection: calls .end() and clears the singleton; is a noop
 *     when no instance is held; swallows .end() errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Build a fresh mock for ssh2-sftp-client per test so each instance keeps its
// own connect / list / end spies.
function makeMockClient() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    end: vi.fn().mockResolvedValue(undefined),
    // checkSftpConnection peeks at `.sftp` to decide if the instance is alive.
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
  // Reset the ctor reference each time we resetModules so the spy survives.
});

afterEach(async () => {
  // Best-effort cleanup: clear any lingering idle timer / singleton so the
  // next test starts clean. We re-import to get the same module instance the
  // test used; if it was never imported this is a noop.
  try {
    const mod = await import("../../../utils/sftpConnectionCheck.js");
    await mod.closeSftpConnection();
  } catch {
    // ignore
  }
});

describe("checkSftpConnection", () => {
  it("connects, stashes the instance, and returns it on first call", async () => {
    const { checkSftpConnection } = await import(
      "../../../utils/sftpConnectionCheck.js"
    );

    const inst = await checkSftpConnection();

    expect(mockClients).toHaveLength(1);
    const client = mockClients[0];
    expect(client.connect).toHaveBeenCalledTimes(1);
    // sftpConfig pulls from config.get("SFTP.*") — tests/setup.js seeds:
    //   IP=127.0.0.1, Port=22, user-name=test-sftp-user, Password=test-sftp-pass
    expect(client.connect).toHaveBeenCalledWith({
      host: "127.0.0.1",
      port: 22,
      username: "test-sftp-user",
      password: "test-sftp-pass",
    });
    expect(inst).toBe(client);
  });

  it("returns the cached alive instance and probes it with list('/')", async () => {
    const { checkSftpConnection } = await import(
      "../../../utils/sftpConnectionCheck.js"
    );

    const first = await checkSftpConnection();
    // Second call: list('/') resolves, so the cached instance is reused.
    const second = await checkSftpConnection();

    expect(second).toBe(first);
    expect(mockClients).toHaveLength(1); // no new Client constructed
    expect(first.list).toHaveBeenCalledWith("/");
    expect(first.connect).toHaveBeenCalledTimes(1);
  });

  it("reconnects when the cached instance is stale (list throws)", async () => {
    const { checkSftpConnection } = await import(
      "../../../utils/sftpConnectionCheck.js"
    );

    const first = await checkSftpConnection();
    // Make the alive-probe fail → forces closeSftpConnection() + reconnect.
    first.list.mockRejectedValueOnce(new Error("connection lost"));

    const second = await checkSftpConnection();

    expect(mockClients).toHaveLength(2);
    expect(first.end).toHaveBeenCalledTimes(1);
    expect(second).toBe(mockClients[1]);
    expect(mockClients[1].connect).toHaveBeenCalledTimes(1);
  });
});

describe("closeSftpConnection", () => {
  it("ends the active instance and clears the singleton", async () => {
    const { checkSftpConnection, closeSftpConnection } = await import(
      "../../../utils/sftpConnectionCheck.js"
    );

    const inst = await checkSftpConnection();
    await closeSftpConnection();
    expect(inst.end).toHaveBeenCalledTimes(1);

    // After close, the next call should construct a brand-new client.
    const next = await checkSftpConnection();
    expect(next).not.toBe(inst);
    expect(mockClients).toHaveLength(2);
  });

  it("is a noop when no instance is held", async () => {
    const { closeSftpConnection } = await import(
      "../../../utils/sftpConnectionCheck.js"
    );

    // Should not throw and should not touch any client.
    await expect(closeSftpConnection()).resolves.toBeUndefined();
    expect(mockClients).toHaveLength(0);
  });

  it("swallows errors thrown by client.end()", async () => {
    const { checkSftpConnection, closeSftpConnection } = await import(
      "../../../utils/sftpConnectionCheck.js"
    );

    const inst = await checkSftpConnection();
    inst.end.mockRejectedValueOnce(new Error("end failed"));

    await expect(closeSftpConnection()).resolves.toBeUndefined();
    expect(inst.end).toHaveBeenCalledTimes(1);

    // Singleton must still be cleared even when end() rejected.
    const next = await checkSftpConnection();
    expect(next).not.toBe(inst);
  });
});
