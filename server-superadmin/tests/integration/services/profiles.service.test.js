/**
 * Integration test for ProfilesServices — CRUD against in-memory MongoDB.
 * File-export methods (archiver / fs) are not exercised here.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: ProfilesService } = await import(
  "../../../core/v1/profiles/profiles.service.js"
);
const { default: Profile } = await import(
  "../../../core/v1/profiles/profiles.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
await import("../../../core/v1/users/users.model.js");

const adminId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

/** A request body that satisfies createProfileValidator. */
function validBody() {
  return {
    basics: { profileName: "Profile A", days: {} },
    notification: {},
    evidenceSeverity: {},
    defaultDetectionSettings: { objects: {} },
  };
}

/** Persist a Profile directly. */
function seedProfile(over = {}) {
  return Profile.create({
    userType: "Admin",
    createdBy: adminId,
    user: adminId,
    basics: { profileName: "Seeded" },
    ...over,
  });
}

describe("ProfilesService.addProfile", () => {
  it("creates a profile (201)", async () => {
    const { req, res, next } = serviceCtx({ adminId, body: validBody() });
    await ProfilesService.addProfile(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    expect(await Profile.countDocuments()).toBe(1);
  });

  it("returns 400 for an invalid body", async () => {
    const { req, res, next } = serviceCtx({ adminId, body: {} });
    await ProfilesService.addProfile(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(res._body.success).toBe(false);
  });
});

describe("ProfilesService.getProfiles", () => {
  it("returns the admin's profiles with a total", async () => {
    await seedProfile();
    await seedProfile({ basics: { profileName: "Second" } });
    const { req, res, next } = serviceCtx({ adminId, query: {} });
    await ProfilesService.getProfiles(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(2);
  });

  it("filters profiles by name", async () => {
    await seedProfile({ basics: { profileName: "Alpha" } });
    await seedProfile({ basics: { profileName: "Beta" } });
    const { req, res, next } = serviceCtx({ adminId, query: { name: "alph" } });
    await ProfilesService.getProfiles(req, res, next);
    expect(payload(res).data.total).toBe(1);
  });
});

describe("ProfilesService.getProfileById", () => {
  it("returns the profile", async () => {
    const p = await seedProfile();
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: p._id.toString() },
    });
    await ProfilesService.getProfileById(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("fails for an unknown profile", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await ProfilesService.getProfileById(req, res, next);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe("ProfilesService.editProfile", () => {
  it("returns 400 when the profile does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { status: "Active" },
    });
    await ProfilesService.editProfile(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("ProfilesService.deleteProfile", () => {
  it("deletes a profile", async () => {
    const p = await seedProfile();
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: p._id.toString() },
    });
    await ProfilesService.deleteProfile(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await Profile.findById(p._id)).toBeNull();
  });

  it("returns 400 for an unknown profile", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await ProfilesService.deleteProfile(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("ProfilesService.bulkDeleteProfiles", () => {
  it("returns 400 when no ids are provided", async () => {
    const { req, res, next } = serviceCtx({ adminId, body: { ids: [] } });
    await ProfilesService.bulkDeleteProfiles(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when no profiles match", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      body: { ids: [new mongoose.Types.ObjectId().toString()] },
    });
    await ProfilesService.bulkDeleteProfiles(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("bulk-deletes the listed profiles", async () => {
    const a = await seedProfile();
    const b = await seedProfile();
    const { req, res, next } = serviceCtx({
      adminId,
      body: { ids: [a._id.toString(), b._id.toString()] },
    });
    await ProfilesService.bulkDeleteProfiles(req, res, next);
    expect(await Profile.countDocuments()).toBe(0);
  });
});
