/**
 * Integration tests for the remaining lower-complexity Mongoose models:
 * authorizedChannels, Profile, and DashboardSidebarConfig.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: AuthorizedChannels } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);
const { default: Profile } = await import(
  "../../../core/v1/profiles/profiles.model.js"
);
const { default: DashboardSidebar } = await import(
  "../../../core/v1/dashboard/dashboardSidebar.model.js"
);

beforeAll(async () => {
  await connectMongo();
  await DashboardSidebar.syncIndexes();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("authorizedChannels model", () => {
  const adminId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  it("requires adminId and userId", async () => {
    await expect(AuthorizedChannels.create({ adminId })).rejects.toThrow();
    await expect(AuthorizedChannels.create({ userId })).rejects.toThrow();
  });

  it("creates with empty access arrays", async () => {
    const ac = await AuthorizedChannels.create({ adminId, userId });
    expect(ac.locations).toEqual([]);
    expect(ac.nvrIds).toEqual([]);
    expect(ac.channels).toEqual([]);
    expect(ac.departmentIds).toEqual([]);
  });

  it("stores location strings and ObjectId references", async () => {
    const ac = await AuthorizedChannels.create({
      adminId,
      userId,
      locations: ["HQ", "Branch"],
      nvrIds: [new mongoose.Types.ObjectId()],
      channels: [new mongoose.Types.ObjectId()],
    });
    expect(ac.locations).toEqual(["HQ", "Branch"]);
    expect(ac.nvrIds).toHaveLength(1);
    expect(ac.channels).toHaveLength(1);
  });
});

describe("Profile model", () => {
  const user = new mongoose.Types.ObjectId();

  it("requires userType, createdBy, and user", async () => {
    await expect(Profile.create({ user })).rejects.toThrow();
  });

  it("only allows userType Admin or users", async () => {
    await expect(
      Profile.create({ userType: "Robot", createdBy: user, user })
    ).rejects.toThrow();
    await expect(
      Profile.create({ userType: "Admin", createdBy: user, user })
    ).resolves.toBeDefined();
  });

  it("defaults status to Inactive", async () => {
    const p = await Profile.create({
      userType: "Admin",
      createdBy: user,
      user,
    });
    expect(p.status).toBe("Inactive");
  });

  it("nested notification defaults apply when a notification block is set", async () => {
    const p = await Profile.create({
      userType: "Admin",
      createdBy: user,
      user,
      notification: {},
    });
    expect(p.notification.notify).toBe("Digest");
    expect(p.notification.digestEveryMinutes).toBe(15);
    expect(p.notification.channels.email).toBe(false);
  });

  it("validates the notification.notify enum", async () => {
    await expect(
      Profile.create({
        userType: "Admin",
        createdBy: user,
        user,
        notification: { notify: "Telepathy" },
      })
    ).rejects.toThrow();
  });
});

describe("DashboardSidebarConfig model", () => {
  const adminId = new mongoose.Types.ObjectId();

  it("requires adminId", async () => {
    await expect(DashboardSidebar.create({})).rejects.toThrow();
  });

  it("enforces one config per admin (unique adminId)", async () => {
    await DashboardSidebar.create({ adminId });
    await expect(DashboardSidebar.create({ adminId })).rejects.toThrow();
  });

  it("defaults detectionConfigs to an empty array", async () => {
    const d = await DashboardSidebar.create({
      adminId: new mongoose.Types.ObjectId(),
    });
    expect(d.detectionConfigs).toEqual([]);
  });

  it("validates a detectionConfig's detectionType enum", async () => {
    await expect(
      DashboardSidebar.create({
        adminId: new mongoose.Types.ObjectId(),
        detectionConfigs: [{ detectionType: "notReal" }],
      })
    ).rejects.toThrow();
  });

  it("accepts a valid detectionConfig with defaults", async () => {
    const d = await DashboardSidebar.create({
      adminId: new mongoose.Types.ObjectId(),
      detectionConfigs: [{ detectionType: "countPersons" }],
    });
    expect(d.detectionConfigs[0].isEnabled).toBe(false);
    expect(d.detectionConfigs[0].allowedDetection).toBe(true);
  });
});
