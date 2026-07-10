/**
 * Unit test for checkActivePlanSocket — the socket-flavoured plan check.
 * It calls next(err) on failure and next() on success. We mock the auth
 * service's isPlanActive the same way the original checkActivePlan test does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/Auth/auth.service.js", () => {
  const isPlanActive = vi.fn();
  return {
    default: { isPlanActive },
    isPlanActive,
  };
});

const { checkActivePlanSocket } = await import(
  "../../../middlewares/checkActivePlan.js"
);
const authServiceModule = await import("../../../core/v1/Auth/auth.service.js");
const authService = authServiceModule.default;

beforeEach(() => {
  authService.isPlanActive.mockReset();
});

function runSocket(user) {
  return new Promise((resolve) => {
    const socket = { user };
    const calls = [];
    checkActivePlanSocket(socket, (err) => {
      calls.push(err);
      resolve(calls);
    });
  });
}

describe("checkActivePlanSocket", () => {
  it("rejects when there is no userSubscriptionType on socket.user", async () => {
    const calls = await runSocket({});
    expect(calls[0]).toBeInstanceOf(Error);
    expect(calls[0].message).toMatch(/expired/i);
  });

  it("rejects when the plan is inactive", async () => {
    authService.isPlanActive.mockReturnValue(false);
    const calls = await runSocket({
      userSubscriptionType: { p1: "2000-01-01" },
    });
    expect(calls[0]).toBeInstanceOf(Error);
    expect(calls[0].message).toMatch(/expired/i);
  });

  it("calls next() with no error when the plan is active", async () => {
    authService.isPlanActive.mockReturnValue(true);
    const calls = await runSocket({
      userSubscriptionType: { p1: "2099-12-31" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeUndefined();
  });

  it("rejects with a wrapped error when isPlanActive throws", async () => {
    authService.isPlanActive.mockImplementation(() => {
      throw new Error("boom");
    });
    const calls = await runSocket({
      userSubscriptionType: { p1: "2099-12-31" },
    });
    expect(calls[0]).toBeInstanceOf(Error);
    expect(calls[0].message).toMatch(/Failed to validate subscription/i);
  });
});
