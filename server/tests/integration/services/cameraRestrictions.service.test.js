/**
 * Integration test for AuthorizedChannelService (cameraRestrictions) — the
 * tractable fetch paths against in-memory MongoDB. Each method responds via
 * `res.send(Response.xxx())`, so `res.statusCode` stays 200 and assertions
 * check `payload(res).status` instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: AuthorizedChannelService } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/channels/channels.model.js");
await import("../../../core/v1/departments/departments.model.js");
await import("../../../core/v1/locations/location.model.js");

let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
});

function seedNVR(over = {}) {
  return NVR.create({
    userId: "u1",
    nvrName: "NVR-1",
    brand: "hikvision",
    domain: "nvr.example.com",
    location: "HQ",
    localNvrId: "1",
    ...over,
  });
}

describe("AuthorizedChannelService.fetchChannels", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "u1",
      body: {},
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when no valid filters are provided", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "u1",
      body: {},
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the user's NVR locations when locations=true", async () => {
    await seedNVR();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "u1",
      body: { locations: true },
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(Array.isArray(payload(res).data)).toBe(true);
    expect(payload(res).data).toHaveLength(1);
  });
});

describe("AuthorizedChannelService.fetchLocations", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "u1",
      body: {},
    });
    await AuthorizedChannelService.fetchLocations(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns locations for an existing admin (no filters)", async () => {
    await seedNVR();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "u1",
      body: {},
    });
    await AuthorizedChannelService.fetchLocations(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toContain("HQ");
  });
});

describe("AuthorizedChannelService.fetchDepartments", () => {
  it("fails when there is no adminId", async () => {
    const { req, res, next } = serviceCtx({ user_id: "u1", body: {} });
    await AuthorizedChannelService.fetchDepartments(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns departments for an existing admin (no filters)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "u1",
      body: {},
    });
    await AuthorizedChannelService.fetchDepartments(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(Array.isArray(payload(res).data)).toBe(true);
  });
});

describe("AuthorizedChannelService.fetchNVRS", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "u1",
      body: {},
    });
    await AuthorizedChannelService.fetchNVRS(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns NVRs for an existing admin (no filters)", async () => {
    await seedNVR();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "u1",
      body: {},
    });
    await AuthorizedChannelService.fetchNVRS(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toHaveLength(1);
  });
});

describe("AuthorizedChannelService.fetchChannelByNVRsOrDepartment", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "u1",
      body: {},
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next
    );
    expect(payload(res).status).toBe("failed");
  });

  it("returns channels for an existing admin (no filters)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "u1",
      body: {},
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next
    );
    expect(payload(res).status).toBe("success");
    expect(Array.isArray(payload(res).data)).toBe(true);
  });
});
