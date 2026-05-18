/**
 * Integration test for ShiftService — exercises every CRUD method against a
 * real (in-memory) MongoDB.
 *
 * Note: the services call `res.status(X).json(Response.xxx(...))` where the
 * Response helper itself returns `{ statusCode, body }`. So the captured
 * response object is double-nested — `res._body.body` holds the real
 * `{ status, message, data }`. `payload()` below unwraps it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { makeReqRes } from "../../helpers/factory.js";

const { default: ShiftService } = await import(
  "../../../core/v1/shifts/shifts.service.js"
);
const { default: Shift } = await import(
  "../../../core/v1/shifts/shifts.model.js"
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

/** Build a req/res pair with an authenticated admin attached. */
function ctx(overrides = {}) {
  const { req, res, next } = makeReqRes();
  req.verified = { userData: { adminId: adminId.toString() } };
  Object.assign(req, overrides);
  return { req, res, next };
}

/** Unwrap the double-nested response body. */
const payload = (res) => res._body?.body;

const validShift = () => ({
  name: "Morning Shift",
  color: "#ff0000",
  timings: { monday: { enabled: false } },
});

describe("ShiftService.createShift", () => {
  it("creates a shift and returns 201", async () => {
    const { req, res, next } = ctx({ body: validShift() });
    await ShiftService.createShift(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.shift.name).toBe("Morning Shift");
    expect(await Shift.countDocuments()).toBe(1);
  });

  it("stamps the shift with the caller's adminId", async () => {
    const { req, res, next } = ctx({ body: validShift() });
    await ShiftService.createShift(req, res, next);
    const doc = await Shift.findOne();
    expect(doc.adminId.toString()).toBe(adminId.toString());
  });

  it("returns 400 with validation errors for a bad body", async () => {
    const { req, res, next } = ctx({ body: { name: "ab" } }); // too short, no color
    await ShiftService.createShift(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
    expect(Array.isArray(payload(res).error)).toBe(true);
  });
});

describe("ShiftService.getAllShifts", () => {
  beforeEach(async () => {
    for (const name of ["Alpha", "Beta", "Gamma"]) {
      await Shift.create({ adminId, name, color: "#000" });
    }
  });

  it("returns all shifts with a total count", async () => {
    const { req, res, next } = ctx({ query: {} });
    await ShiftService.getAllShifts(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(3);
    expect(payload(res).data.shifts).toHaveLength(3);
  });

  it("filters by name (case-insensitive regex)", async () => {
    const { req, res, next } = ctx({ query: { name: "alph" } });
    await ShiftService.getAllShifts(req, res, next);
    expect(payload(res).data.shifts).toHaveLength(1);
    expect(payload(res).data.shifts[0].name).toBe("Alpha");
  });

  it("honors skip + limit", async () => {
    const { req, res, next } = ctx({ query: { skip: 1, limit: 1 } });
    await ShiftService.getAllShifts(req, res, next);
    expect(payload(res).data.shifts).toHaveLength(1);
    expect(payload(res).data.total).toBe(3);
  });
});

describe("ShiftService.getShiftById", () => {
  it("returns the requested shift", async () => {
    const shift = await Shift.create({ adminId, name: "X", color: "#000" });
    const { req, res, next } = ctx({ params: { id: shift._id.toString() } });
    await ShiftService.getShiftById(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.shift._id.toString()).toBe(shift._id.toString());
  });

  it("returns 200 with null for an unknown id", async () => {
    const { req, res, next } = ctx({
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await ShiftService.getShiftById(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.shift).toBeNull();
  });

  it("returns 400 for a malformed id", async () => {
    const { req, res, next } = ctx({ params: { id: "not-an-objectid" } });
    await ShiftService.getShiftById(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("ShiftService.updateShift", () => {
  it("updates an existing shift", async () => {
    const shift = await Shift.create({ adminId, name: "Old", color: "#000" });
    const { req, res, next } = ctx({
      params: { id: shift._id.toString() },
      body: { name: "Renamed" },
    });
    await ShiftService.updateShift(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.shift.name).toBe("Renamed");
  });

  it("returns 400 when the shift does not exist", async () => {
    const { req, res, next } = ctx({
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { name: "Whatever" },
    });
    await ShiftService.updateShift(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toMatch(/not found/i);
  });

  it("returns 400 for an invalid update body", async () => {
    const shift = await Shift.create({ adminId, name: "Old", color: "#000" });
    const { req, res, next } = ctx({
      params: { id: shift._id.toString() },
      body: { name: "ab" }, // below min length
    });
    await ShiftService.updateShift(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("ShiftService.deleteShift", () => {
  it("deletes the shift", async () => {
    const shift = await Shift.create({ adminId, name: "Doomed", color: "#000" });
    const { req, res, next } = ctx({ params: { id: shift._id.toString() } });
    await ShiftService.deleteShift(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(await Shift.countDocuments()).toBe(0);
  });
});

describe("ShiftService.getShiftList", () => {
  it("returns a trimmed { _id, name } list scoped to the admin", async () => {
    await Shift.create({ adminId, name: "Mine", color: "#000" });
    await Shift.create({
      adminId: new mongoose.Types.ObjectId(),
      name: "Other",
      color: "#000",
    });
    const { req, res, next } = ctx();
    await ShiftService.getShiftList(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.shifts).toHaveLength(1);
    expect(payload(res).data.shifts[0].name).toBe("Mine");
  });
});
