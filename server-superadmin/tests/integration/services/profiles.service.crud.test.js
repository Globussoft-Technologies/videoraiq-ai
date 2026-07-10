/**
 * Extra coverage for ProfilesService — fills in the methods the existing
 * profiles tests skip:
 *   - bulkDeleteProfiles: happy path + 404 + 500
 *   - getProfileById: happy + not-found + cast error
 *   - deleteProfile: happy path + 500
 *   - getProfiles: search + sort branches
 *
 * Mocks: 0 — in-memory Mongo + the existing fs/encryption pipeline.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: ProfilesService } = await import(
  "../../../core/v1/profiles/profiles.service.js"
);
const { default: Profile } = await import(
  "../../../core/v1/profiles/profiles.model.js"
);
await import("../../../core/v1/admin/admin.model.js");
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

function seedProfile(over = {}) {
  return Profile.create({
    userType: "Admin",
    createdBy: adminId,
    user: adminId,
    basics: { profileName: "Seeded" },
    ...over,
  });
}

describe("ProfilesService.bulkDeleteProfiles", () => {
  it("returns 404 when no profiles match the provided ids", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      body: { ids: [new mongoose.Types.ObjectId().toString()] },
    });
    await ProfilesService.bulkDeleteProfiles(req, res, next);
    expect(res.statusCode).toBe(404);
    expect(payload(res).status).toBe("failed");
  });

  it("deletes the matching profiles and returns 200", async () => {
    const p1 = await seedProfile();
    const p2 = await seedProfile({ basics: { profileName: "Second" } });
    const { req, res, next } = serviceCtx({
      adminId,
      body: { ids: [p1._id.toString(), p2._id.toString()] },
    });
    await ProfilesService.bulkDeleteProfiles(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/2 profiles deleted/);
    expect(await Profile.countDocuments()).toBe(0);
  });

  it("returns 400 when ids is not an array", async () => {
    const { req, res, next } = serviceCtx({ adminId, body: { ids: "nope" } });
    await ProfilesService.bulkDeleteProfiles(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when deleteMany is given a malformed id", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      body: { ids: ["not-an-objectid"] },
    });
    await ProfilesService.bulkDeleteProfiles(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
  });
});

describe("ProfilesService.getProfileById", () => {
  it("returns the profile for a valid id", async () => {
    const p = await seedProfile();
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: p._id.toString() },
    });
    await ProfilesService.getProfileById(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.profile.basics.profileName).toBe("Seeded");
  });

  it("returns 400 when the profile is not found", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await ProfilesService.getProfileById(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 400 when the id triggers a cast error", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: "not-a-valid-objectid" },
    });
    await ProfilesService.getProfileById(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });
});

describe("ProfilesService.deleteProfile", () => {
  it("returns 400 when the profile is not found", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await ProfilesService.deleteProfile(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("deletes an existing profile (200)", async () => {
    const p = await seedProfile();
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: p._id.toString() },
    });
    await ProfilesService.deleteProfile(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(await Profile.findById(p._id)).toBeNull();
  });

  it("returns 400 when a malformed id triggers a cast error", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: "not-a-valid-objectid" },
    });
    await ProfilesService.deleteProfile(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });
});

describe("ProfilesService.getProfiles — query branches", () => {
  it("filters by `name` (case-insensitive regex on basics.profileName)", async () => {
    await seedProfile({ basics: { profileName: "Alpha Watcher" } });
    await seedProfile({ basics: { profileName: "Beta Watcher" } });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { name: "alpha", skip: 0, limit: 10 },
    });
    await ProfilesService.getProfiles(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);
    expect(payload(res).data.profiles[0].basics.profileName).toBe(
      "Alpha Watcher"
    );
  });

  it("supports ascending sort on a mapped sort field", async () => {
    await seedProfile({ basics: { profileName: "Bravo" } });
    await seedProfile({ basics: { profileName: "Alpha" } });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { orderBy: "name", sort: "asc" },
    });
    await ProfilesService.getProfiles(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(2);
    // Ascending → Alpha first
    expect(payload(res).data.profiles[0].basics.profileName).toBe("Alpha");
  });
});
