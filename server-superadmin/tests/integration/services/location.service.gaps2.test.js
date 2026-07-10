/**
 * Gap-fill round 2 for location.service.js.
 *
 * v8 still reports as uncovered after .test/.catches/.fetchEmployee:
 *   49-51    create outer catch
 *   59-60    fetchLocations adminId-missing branch
 *   85-87    fetchLocations outer catch
 *   106-108  getLocationById outer catch
 *   124-125  updateLocation validation-fail (validationFailResp)
 *   146-150  updateLocation duplicate empLocationId arm
 *   177-179  updateLocation outer catch
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: LocationService } = await import(
  "../../../core/v1/locations/location.service.js"
);
const { default: Location } = await import(
  "../../../core/v1/locations/location.model.js"
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
  vi.restoreAllMocks();
});

describe("LocationService.create — outer catch (lines 49-51)", () => {
  it("returns 500 when Location.create rejects", async () => {
    vi.spyOn(Location, "create").mockImplementationOnce(() => {
      throw new Error("create-blew-up");
    });
    const { req, res, next } = serviceCtx({
      adminId,
      body: { locationName: "boom", empLocationId: "EMP-1" },
    });
    await LocationService.createLocation(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});

describe("LocationService.fetchLocations — adminId missing (lines 58-60)", () => {
  it("returns 400 'Admin context missing' when verified.userData.adminId is absent", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    // No adminId on verified — explicitly clear it.
    req.verified.userData.adminId = undefined;
    await LocationService.fetchLocations(req, res, next);
    expect(res.statusCode).toBe(400);
    const body = payload(res);
    expect(body.message).toMatch(/Admin context missing/i);
  });
});

describe("LocationService.fetchLocations — outer catch (lines 85-87)", () => {
  it("returns 500 when the Promise.all paginated query throws", async () => {
    vi.spyOn(Location, "find").mockImplementationOnce(() => {
      throw new Error("find-blew-up");
    });
    const { req, res, next } = serviceCtx({ adminId, query: {} });
    await LocationService.fetchLocations(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});

describe("LocationService.getLocationById — outer catch (lines 105-108)", () => {
  it("returns 500 when Location.findOne throws", async () => {
    vi.spyOn(Location, "findOne").mockImplementationOnce(() => {
      throw new Error("findOne-blew-up");
    });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: new mongoose.Types.ObjectId().toString() },
    });
    await LocationService.getLocationById(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});

describe("LocationService.updateLocation — validation fail (lines 122-125)", () => {
  it("returns 400 validationFailResp when the body fails Joi", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: new mongoose.Types.ObjectId().toString() },
      body: { locationName: 42 }, // must be string
    });
    await LocationService.updateLocation(req, res, next);
    expect(res.statusCode).toBe(400);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });
});

describe("LocationService.updateLocation — duplicate empLocationId (lines 145-150)", () => {
  it("returns 409 when another location in the org already has this empLocationId", async () => {
    await Location.create({
      adminId,
      locationName: "loc-a",
      empLocationId: "EMP-DUP",
    });
    const target = await Location.create({
      adminId,
      locationName: "loc-b",
      empLocationId: "EMP-ORIG",
    });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: target._id.toString() },
      body: { empLocationId: "EMP-DUP" },
    });
    await LocationService.updateLocation(req, res, next);
    expect(res.statusCode).toBe(409);
    const body = payload(res);
    expect(body.message).toMatch(/already exists/i);
  });
});

describe("LocationService.updateLocation — outer catch (lines 176-179)", () => {
  it("returns 500 when findByIdAndUpdate throws", async () => {
    const target = await Location.create({
      adminId,
      locationName: "to-throw",
      empLocationId: "EMP-T",
    });
    vi.spyOn(Location, "findByIdAndUpdate").mockImplementationOnce(() => {
      throw new Error("update-blew-up");
    });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: target._id.toString() },
      body: { locationName: "renamed" },
    });
    await LocationService.updateLocation(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});
