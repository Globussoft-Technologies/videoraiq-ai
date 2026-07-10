import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReqRes, futureTimestamp, pastTimestamp } from "../../helpers/factory.js";

// Mock the auth service to keep checkActivePlan a pure middleware test.
vi.mock("../../../core/v1/Auth/auth.service.js", () => {
  const isPlanActive = vi.fn();
  return {
    default: {
      isPlanActive,
      revokeAttendanceService: vi.fn(),
      revokeDetectionService: vi.fn(),
    },
    isPlanActive,
  };
});

const { checkActivePlan } = await import("../../../middlewares/checkActivePlan.js");
const authServiceModule = await import("../../../core/v1/Auth/auth.service.js");
const authService = authServiceModule.default;

beforeEach(() => {
  authService.isPlanActive.mockReset();
});

describe("checkActivePlan", () => {
  it("returns 403 / planExpiredResp when userData has no subscription", async () => {
    const { req, res, next } = makeReqRes();
    req.verified = { userData: {} };

    await checkActivePlan(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res._body?.body?.message).toMatch(/expired/i);
    expect(next.calls).toHaveLength(0);
  });

  it("calls next() when plan is active", async () => {
    authService.isPlanActive.mockReturnValue(true);
    const { req, res, next } = makeReqRes();
    req.verified = {
      userData: {
        userSubscriptionType: { 1001: new Date(Date.now() + 86400e3).toISOString() },
      },
    };

    await checkActivePlan(req, res, next);

    expect(next.calls).toHaveLength(1);
    expect(authService.isPlanActive).toHaveBeenCalledOnce();
  });

  it("returns 403 when plan is inactive", async () => {
    authService.isPlanActive.mockReturnValue(false);
    const { req, res, next } = makeReqRes();
    req.verified = {
      userData: {
        userSubscriptionType: { 1001: new Date(Date.now() - 86400e3).toISOString() },
      },
    };

    await checkActivePlan(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next.calls).toHaveLength(0);
  });

  it("returns 500 + diagnostic when the underlying check throws", async () => {
    authService.isPlanActive.mockImplementation(() => {
      throw new Error("boom");
    });
    const { req, res, next } = makeReqRes();
    req.verified = {
      userData: { userSubscriptionType: { 1: "2099-12-31" } },
    };

    await checkActivePlan(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res._body?.error).toMatch(/boom/);
    expect(next.calls).toHaveLength(0);
  });
});
