import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

vi.mock("../../../utils/helperFunctions.js", () => ({
  autoSyncLocations: vi.fn().mockResolvedValue(undefined),
  syncPermissionLocations: vi.fn().mockResolvedValue(undefined),
  syncStevinrockLogPermissions: vi.fn().mockResolvedValue(undefined),
  syncAlertsAnalyticsPermissions: vi.fn().mockResolvedValue(undefined),
}));

const { default: AUTHService } = await import(
  "../../../core/v2/Auth/auth.service.js"
);

beforeEach(() => {
  fetchMock.mockReset();
});

describe("v2 AUTHService.fetchUserDataByName", () => {
  it("authenticates an email directly without a username lookup", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        user_id: "42",
        login: "alice",
        email: "alice@example.com",
      }),
    });

    const result = await AUTHService.fetchUserDataByName({
      login: "alice@example.com",
      pass: "secret",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("login=alice%40example.com");
  });

  it("resolves an exact username to email and validates the same password", async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          ok: false,
          code: 1,
          msg: "Username or password is incorrect",
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          _total: 1,
          0: {
            user_id: "42",
            login: "alice",
            email: "alice@example.com",
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          user_id: "42",
          login: "alice",
          email: "alice@example.com",
        }),
      });

    const result = await AUTHService.fetchUserDataByName({
      login: "alice",
      pass: "secret",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain("login=alice");
    expect(fetchMock.mock.calls[1][0]).toContain("%5Blogin%5D=alice");
    expect(fetchMock.mock.calls[2][0]).toContain("login=alice%40example.com");
    expect(fetchMock.mock.calls[2][0]).toContain("pass=secret");
  });

  it("returns the original authentication failure when username is unknown", async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ ok: false, code: 1, msg: "Invalid login" }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ _total: 0 }),
      });

    const result = await AUTHService.fetchUserDataByName({
      login: "unknown-user",
      pass: "wrong",
    });

    expect(result).toEqual({ ok: false, code: 1, msg: "Invalid login" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
