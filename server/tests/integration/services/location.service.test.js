/**
 * Integration test for LocationService — CRUD against in-memory MongoDB.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: LocationService } = await import(
  "../../../core/v1/locations/location.service.js"
);
const { default: Location } = await import(
  "../../../core/v1/locations/location.model.js"
);
const { default: AuthorizedUser } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: AuthorizedChannel } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);
const { default: NVR } = await import(
  "../../../core/v1/NVR/nvr.model.js"
);

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

describe("LocationService.createLocation", () => {
  it("creates a location (201)", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      body: { locationName: "Head Office" },
    });
    await LocationService.createLocation(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    expect(await Location.countDocuments()).toBe(1);
  });

  it("returns 400 when the admin context is missing", async () => {
    const { req, res, next } = serviceCtx({ body: { locationName: "X" } });
    await LocationService.createLocation(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a missing locationName", async () => {
    const { req, res, next } = serviceCtx({ adminId, body: {} });
    await LocationService.createLocation(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 for a duplicate name (case-insensitive)", async () => {
    await Location.create({ adminId, locationName: "Head Office" });
    const { req, res, next } = serviceCtx({
      adminId,
      body: { locationName: "head office" },
    });
    await LocationService.createLocation(req, res, next);
    expect(res.statusCode).toBe(409);
  });
});

describe("LocationService.fetchLocations", () => {
  beforeEach(async () => {
    await Location.create({ adminId, locationName: "warehouse" });
    await Location.create({ adminId, locationName: "office" });
    await Location.create({
      adminId: new mongoose.Types.ObjectId(),
      locationName: "elsewhere",
    });
  });

  it("returns locations scoped to the admin with a total count", async () => {
    const { req, res, next } = serviceCtx({ adminId, query: {} });
    await LocationService.fetchLocations(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
    expect(payload(res).data.locations).toHaveLength(2);
  });

  it("filters by search term", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      query: { search: "ware" },
    });
    await LocationService.fetchLocations(req, res, next);
    expect(payload(res).data.locations).toHaveLength(1);
  });
});

describe("LocationService.getLocationById", () => {
  it("returns the location", async () => {
    const loc = await Location.create({ adminId, locationName: "hq" });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: loc._id.toString() },
    });
    await LocationService.getLocationById(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.locationName).toBe("hq");
  });

  it("returns 400 when id is missing", async () => {
    const { req, res, next } = serviceCtx({ adminId, query: {} });
    await LocationService.getLocationById(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown id", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: new mongoose.Types.ObjectId().toString() },
    });
    await LocationService.getLocationById(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});

describe("LocationService.updateLocation", () => {
  it("updates a location", async () => {
    const loc = await Location.create({ adminId, locationName: "old" });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: loc._id.toString() },
      body: { locationName: "newname" },
    });
    await LocationService.updateLocation(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Location.findById(loc._id);
    expect(reloaded.locationName).toBe("newname");
  });

  it("propagates canonical casing to all v1 location references", async () => {
    const loc = await Location.create({ adminId, locationName: "Bangalore" });
    const employee = await AuthorizedUser.create({
      adminId,
      email: "afzal@example.com",
      location: "bangalore",
    });
    const nvr = await NVR.create({
      userId: "1",
      nvrName: "NVR 1",
      brand: "hikvision",
      domain: "http://nvr.test",
      location: "BANGALORE",
      localNvrId: "local-1",
    });
    const restrictions = await AuthorizedChannel.create({
      adminId,
      userId: new mongoose.Types.ObjectId(),
      employeeLocations: ["bangalore", "Remote"],
      locations: ["BANGALORE", "Other"],
      nvrIds: [],
      departmentIds: [],
      channels: [],
    });
    const { req, res, next } = serviceCtx({
      adminId,
      user_id: "1",
      query: { id: loc._id.toString() },
      body: { locationName: "Bangalore" },
    });

    await LocationService.updateLocation(req, res, next);

    expect(res.statusCode).toBe(200);
    expect((await AuthorizedUser.findById(employee._id)).location).toBe("Bangalore");
    expect((await NVR.findById(nvr._id)).location).toBe("Bangalore");
    const updatedRestrictions = await AuthorizedChannel.findById(restrictions._id);
    expect(updatedRestrictions.employeeLocations).toEqual(["Bangalore", "Remote"]);
    expect(updatedRestrictions.locations).toEqual(["Bangalore", "Other"]);
  });

  it("returns 404 for an unknown id", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: new mongoose.Types.ObjectId().toString() },
      body: { locationName: "x" },
    });
    await LocationService.updateLocation(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 when renaming onto an existing name", async () => {
    await Location.create({ adminId, locationName: "taken" });
    const loc = await Location.create({ adminId, locationName: "mine" });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: loc._id.toString() },
      body: { locationName: "taken" },
    });
    await LocationService.updateLocation(req, res, next);
    expect(res.statusCode).toBe(409);
  });
});

describe("LocationService.deleteLocation", () => {
  it("deletes the location and ensures a default exists", async () => {
    const loc = await Location.create({ adminId, locationName: "doomed" });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: loc._id.toString() },
    });
    await LocationService.deleteLocation(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await Location.findById(loc._id)).toBeNull();
    const def = await Location.findOne({ locationName: /^default/i });
    expect(def).not.toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: new mongoose.Types.ObjectId().toString() },
    });
    await LocationService.deleteLocation(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});
