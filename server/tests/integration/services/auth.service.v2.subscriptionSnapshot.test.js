import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";

const { default: AUTHService } = await import(
  "../../../core/v2/Auth/auth.service.js"
);
const { default: Admin } = await import(
  "../../../core/v2/admin/admin.model.js"
);

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(clearCollections);

describe("v2 subscription snapshot persistence", () => {
  it("stores the authenticated subscription and normalized current plan", async () => {
    const admin = await Admin.create({
      user_id: "13",
      login: "pavank",
      email: "pavan.kumar@example.com",
    });

    await AUTHService.persistSubscriptionSnapshot(
      admin._id,
      { 4: "2026-09-23" },
      {
        id: 4,
        name: "Free Lifetime",
        expiresAt: "2026-09-23T23:59:59.999Z",
      },
    );

    const updated = await Admin.findById(admin._id).lean();
    expect(updated.subscriptionSnapshot).toMatchObject({
      subscriptions: { 4: "2026-09-23" },
      planId: "4",
      planName: "Free Lifetime",
      expiresAt: new Date("2026-09-23T23:59:59.999Z"),
      source: "amember_login",
    });
    expect(updated.subscriptionSnapshot.syncedAt).toBeInstanceOf(Date);
  });
});
