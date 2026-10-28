import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import moment from "moment-timezone";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { apiCache, cacheReads, CACHE_DOMAINS, createApiCache, invalidateApiCache } from "../../../services/apiCache.service.js";
import { fakeApiCacheRedis } from "../../helpers/fakeApiCacheRedis.js";

vi.mock("../../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

const { default: ShiftV1 } = await import("../../../core/v1/shifts/shifts.model.js");
const { default: ShiftV2 } = await import("../../../core/v2/shifts/shifts.model.js");
const { default: ShiftSchedule } = await import("../../../core/v2/shifts/shiftSchedule.model.js");
let cache = createApiCache({ getClient: () => null });
// Use the real routers/controllers/services with deterministic Redis transport.
const originalRead = cacheReads.shifts;
cacheReads.shifts = (req, res, next) => cache.read(CACHE_DOMAINS.shifts, 900)(req, res, next);
const { default: v1Routes } = await import("../../../core/v1/shifts/shifts.routes.js");
const { default: v2Routes } = await import("../../../core/v2/shifts/shifts.routes.js");
cacheReads.shifts = originalRead;

const schema = new mongoose.Schema({ name: { type: String, unique: true } });
schema.plugin(invalidateApiCache, { domains: ["shifts"] });
const HookModel = mongoose.model("CacheHookTest", schema);
let app, adminId, invalidateSpy;
beforeAll(async () => { await connectMongo(); await HookModel.init(); });
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  const redis = fakeApiCacheRedis();
  cache = createApiCache({ getClient: () => redis });
  invalidateSpy = vi.spyOn(apiCache, "invalidate").mockImplementation(cache.invalidate);
  adminId = new mongoose.Types.ObjectId();
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.verified = { userData: { adminId: String(adminId), timezone: "Asia/Kolkata" },
      authorizedChannel: null, permissionConfig: [] };
    next();
  });
  app.use("/api/v1/shifts", v1Routes);
  app.use("/api/v2/shifts", v2Routes);
});
afterEach(() => { vi.restoreAllMocks(); });

const list = async (version = "v2") => {
  const res = await request(app).get(`/api/${version}/shifts/list`);
  expect(res.status).toBe(200);
  expect(res.body.body.status).toBe("success");
  return res.body.body.data.shifts;
};

describe("shared v1/v2 cache invalidation against MongoDB", () => {
  it("serves cached reads and immediately refreshes BOTH versions after a v2 create", async () => {
    expect(ShiftV1).toBe(ShiftV2);
    const find = vi.spyOn(ShiftV1, "find");
    expect(await list("v1")).toEqual([]);
    expect(await list("v1")).toEqual([]);
    expect(await list("v2")).toEqual([]);
    expect(await list("v2")).toEqual([]);
    expect(find).toHaveBeenCalledTimes(2);
    const create = await request(app).post("/api/v2/shifts").send({ name: "New Shift", startTime: "09:00", endTime: "18:00" });
    expect(create.body.body.status).toBe("success");
    expect((await list("v1")).map(s => s.name)).toEqual(["New Shift"]);
    expect((await list("v2")).map(s => s.name)).toEqual(["New Shift"]);
  });

  it("refreshes a warmed v2 list after v1 model saves and deletes", async () => {
    const shift = await ShiftV1.create({ adminId, name: "Before" });
    expect((await list())[0].name).toBe("Before");
    shift.name = "After";
    await shift.save();
    expect((await list())[0].name).toBe("After");
    await shift.deleteOne();
    expect(await list()).toEqual([]);
  });

  it("refreshes after background bulk updates and deletes", async () => {
    const shift = await ShiftV1.create({ adminId, name: "Before" });
    await list();
    await ShiftV2.bulkWrite([{ updateOne: { filter: { _id: shift._id }, update: { $set: { name: "Bulk" } } } }]);
    expect((await list())[0].name).toBe("Bulk");
    await ShiftV1.deleteMany({ adminId });
    expect(await list()).toEqual([]);
  });

  it("invalidates shift assignment counts when the daily schedule changes", async () => {
    const shift = await ShiftV2.create({ adminId, name: "Scheduled" });
    const find = vi.spyOn(ShiftV2, "find");
    await list();
    await list();
    expect(find).toHaveBeenCalledTimes(1);
    await ShiftSchedule.create({ adminId, employee: new mongoose.Types.ObjectId(),
      shiftId: shift._id, date: moment.tz("Asia/Kolkata").format("YYYY-MM-DD") });
    await list();
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("invalidates on every supported database write form", async () => {
    for (const write of [
      () => HookModel.create({ name: "one" }),
      () => HookModel.insertMany([{ name: "two" }]),
      () => HookModel.updateOne({ name: "one" }, { name: "three" }),
      () => HookModel.updateMany({}, { $set: { name: "four" } }),
      () => HookModel.replaceOne({ name: "four" }, { name: "five" }),
      () => HookModel.findOneAndUpdate({ name: "five" }, { name: "six" }),
      () => HookModel.findOneAndReplace({ name: "six" }, { name: "seven" }),
      () => HookModel.findOneAndDelete({ name: "seven" }),
      () => HookModel.deleteOne({ name: "absent" }),
      () => HookModel.deleteMany({}),
      () => HookModel.bulkWrite([{ insertOne: { document: { name: "bulk" } } }]),
    ]) {
      // Each operation gets a clean collection so unique names don't collide.
      await HookModel.collection.deleteMany({});
      await HookModel.create({ name: "one" });
      invalidateSpy.mockClear();
      try { await write(); } catch (error) {
        // The initial create intentionally collides; its error path must also
        // invalidate while preserving the original duplicate-key error.
        if (error.code !== 11000) throw error;
      }
      expect(invalidateSpy).toHaveBeenCalledWith(["shifts"]);
    }
  });

  it("invalidates successful partial bulk writes without hiding the error", async () => {
    await HookModel.create({ name: "duplicate" });
    invalidateSpy.mockClear();
    await expect(HookModel.bulkWrite([
      { insertOne: { document: { name: "duplicate" } } },
      { insertOne: { document: { name: "persisted" } } },
    ], { ordered: false })).rejects.toMatchObject({ code: 11000 });
    expect(await HookModel.exists({ name: "persisted" })).toBeTruthy();
    expect(invalidateSpy).toHaveBeenCalledWith(["shifts"]);
  });
});
