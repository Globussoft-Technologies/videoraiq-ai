import { describe, expect, it, vi } from "vitest";
import {
  subscriptionStatusFromSnapshot,
} from "../../core/v1/client/client.service.js";
import clientService from "../../core/v1/client/client.service.js";
import AUTHService from "../../core/v1/Auth/auth.service.js";

describe("subscriptionStatusFromSnapshot", () => {
  const now = new Date("2026-09-21T12:00:00.000Z").getTime();

  it("marks a stored future expiry as active", () => {
    expect(subscriptionStatusFromSnapshot({
      syncedAt: "2026-09-21T10:00:00.000Z",
      expiresAt: "2026-09-23T23:59:59.999Z",
    }, now)).toEqual({
      expireDate: new Date("2026-09-23T23:59:59.999Z"),
      status: "active",
    });
  });

  it("marks a stored past expiry as expired", () => {
    expect(subscriptionStatusFromSnapshot({
      syncedAt: "2026-09-20T10:00:00.000Z",
      expiresAt: "2026-09-20T23:59:59.999Z",
    }, now)?.status).toBe("expired");
  });

  it("returns null for a missing snapshot so legacy users use the fallback", () => {
    expect(subscriptionStatusFromSnapshot(null, now)).toBeNull();
    expect(subscriptionStatusFromSnapshot({}, now)).toBeNull();
  });

  it("does not call the stale aMember access fallback when a snapshot exists", async () => {
    const accessLookup = vi.spyOn(AUTHService, "getAmemberAccessByUserId");

    const result = await clientService._getSubscriptionStatus("13", {
      syncedAt: "2026-09-21T10:00:00.000Z",
      expiresAt: "2026-09-23T23:59:59.999Z",
    });

    expect(result.status).toBe("active");
    expect(accessLookup).not.toHaveBeenCalled();
    accessLookup.mockRestore();
  });
});
