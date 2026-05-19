/**
 * Integration test for NVRService — the tractable read/delete/validation
 * paths against in-memory MongoDB. Device-I/O methods (register via brand
 * handlers, DigestFetch) are not exercised; DeleteService + brand handlers
 * are mocked.
 *
 * APP_ENV is "local" in tests → the local NVR schema (localNvrId-based).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteNVR: vi.fn().mockResolvedValue(true) },
}));
vi.mock("../../../core/v1/NVR/nvr.brands.js", () => ({
  default: {}, // no brand handlers → "Unsupported brand"
  updateHandlers: {},
}));

const { default: NVRService } = await import(
  "../../../core/v1/NVR/nvr.service.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

const USER_ID = "8001";

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

function makeNvr(over = {}) {
  return NVR.create({
    userId: USER_ID,
    nvrName: "NVR-1",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "local-1",
    ...over,
  });
}

describe("NVRService.getNvrById", () => {
  it("returns the NVR", async () => {
    const nvr = await makeNvr();
    const { req, res, next } = serviceCtx({ params: { id: nvr._id.toString() } });
    await NVRService.getNvrById(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.nvr._id.toString()).toBe(nvr._id.toString());
  });

  it("returns 400 for an unknown NVR", async () => {
    const { req, res, next } = serviceCtx({
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await NVRService.getNvrById(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("NVRService.allNvrs", () => {
  it("returns every NVR id with a total", async () => {
    await makeNvr({ localNvrId: "a" });
    await makeNvr({ localNvrId: "b" });
    const { req, res, next } = serviceCtx();
    await NVRService.allNvrs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(2);
  });
});

describe("NVRService.getAllNvrs", () => {
  it("returns 400 when the admin has no user_id", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: {},
    });
    await NVRService.getAllNvrs(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns the admin's NVRs", async () => {
    const admin = await Admin.create({
      user_id: USER_ID,
      login: "admin",
      email: "n@test.com",
    });
    await makeNvr();
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    await NVRService.getAllNvrs(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

describe("NVRService.getNVRLocations", () => {
  it("returns 400 without a user_id", async () => {
    const { req, res, next } = serviceCtx();
    await NVRService.getNVRLocations(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns the distinct locations for the user", async () => {
    await makeNvr({ localNvrId: "a", location: "HQ" });
    await makeNvr({ localNvrId: "b", location: "Branch" });
    const { req, res, next } = serviceCtx({ user_id: USER_ID });
    await NVRService.getNVRLocations(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.locations.sort()).toEqual(["Branch", "HQ"]);
  });
});

describe("NVRService.deleteNvr", () => {
  it("returns 400 when no id is given", async () => {
    const { req, res, next } = serviceCtx({ params: {} });
    await NVRService.deleteNvr(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an unknown NVR", async () => {
    const { req, res, next } = serviceCtx({ params: { id: "no-such-nvr" } });
    await NVRService.deleteNvr(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("deletes an NVR found by localNvrId", async () => {
    await makeNvr({ localNvrId: "del-me" });
    const { req, res, next } = serviceCtx({ params: { id: "del-me" } });
    await NVRService.deleteNvr(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

describe("NVRService.deleteAllNvrs", () => {
  it("returns 400 when there are no NVRs", async () => {
    const { req, res, next } = serviceCtx({ user_id: USER_ID });
    await NVRService.deleteAllNvrs(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("deletes all of the user's NVRs", async () => {
    await makeNvr({ localNvrId: "a" });
    await makeNvr({ localNvrId: "b" });
    const { req, res, next } = serviceCtx({ user_id: USER_ID });
    await NVRService.deleteAllNvrs(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

describe("NVRService.registerNvr", () => {
  it("returns 400 for an invalid body", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await NVRService.registerNvr(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an unsupported brand", async () => {
    // A body that passes registerNVR validation; brand handlers are mocked
    // empty so any brand resolves to "unsupported".
    const { req, res, next } = serviceCtx({
      body: {
        ip: "192.168.1.100",
        port: 80,
        rtspPort: 554,
        nvrName: "Lobby",
        username: "admin",
        password: "secret",
        brand: "hikvision",
        location: "HQ",
      },
    });
    await NVRService.registerNvr(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toMatch(/unsupported brand/i);
  });
});

describe("NVRService.addNvr", () => {
  it("returns 400 when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({ user_id: "9999", body: {} });
    await NVRService.addNvr(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});
