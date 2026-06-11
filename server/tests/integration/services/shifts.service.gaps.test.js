/**
 * Gap-fill for ShiftService — exercises the catch blocks of `updateShift`
 * (lines 112-116) and `getShiftList` (lines 145-149). These branches are
 * skipped by the baseline integration suite because every happy/validation
 * path returns before throwing.
 *
 * We mock the Shift model methods to throw so the catch arms run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReqRes } from "../../helpers/factory.js";

// Mock the model BEFORE importing the service.
vi.mock("../../../core/v1/shifts/shifts.model.js", () => ({
  default: {
    findByIdAndUpdate: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    findByIdAndDelete: vi.fn(),
    create: vi.fn(),
  },
}));

const { default: ShiftService } = await import(
  "../../../core/v1/shifts/shifts.service.js"
);
const { default: Shift } = await import(
  "../../../core/v1/shifts/shifts.model.js"
);

function ctx(overrides = {}) {
  const { req, res, next } = makeReqRes();
  req.verified = { userData: { adminId: "admin-1" } };
  Object.assign(req, overrides);
  return { req, res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShiftService.updateShift catch (gap-fill)", () => {
  it("returns 400 with the error message when findByIdAndUpdate throws", async () => {
    Shift.findByIdAndUpdate.mockRejectedValueOnce(new Error("db is down"));
    const { req, res, next } = ctx({
      params: { id: "507f1f77bcf86cd799439011" },
      body: { name: "Renamed shift" },
    });
    await ShiftService.updateShift(req, res, next);
    expect(res.statusCode).toBe(400);
    // Response.errorResp shape: { statusCode, body: { status, message, error } }
    const body = res._body?.body || res._body;
    expect(body.message || body.error?.message).toMatch(/Failed to update shift|db is down/);
  });
});

describe("ShiftService.getShiftList catch (gap-fill)", () => {
  it("returns 400 when Shift.find throws", async () => {
    // The chained .sort() pattern: make find() return a thenable that throws.
    Shift.find.mockImplementationOnce(() => ({
      sort: () => Promise.reject(new Error("query exploded")),
    }));
    const { req, res, next } = ctx();
    await ShiftService.getShiftList(req, res, next);
    expect(res.statusCode).toBe(400);
    const body = res._body?.body || res._body;
    expect(body.message || body.error?.message).toMatch(/Failed to get shift list|query exploded/);
  });
});

describe("ShiftService.getAllShifts catch (gap-fill)", () => {
  it("returns 400 when Shift.find().skip().limit().sort() rejects", async () => {
    // The service calls Shift.find(q).skip(s).limit(l).sort({...}) in
    // Promise.all alongside Shift.countDocuments(q). Make find chain reject.
    Shift.find.mockImplementationOnce(() => ({
      skip: () => ({
        limit: () => ({
          sort: () => Promise.reject(new Error("get-all-exploded")),
        }),
      }),
    }));
    Shift.countDocuments.mockResolvedValueOnce(0);
    const { req, res, next } = ctx({ query: {} });
    await ShiftService.getAllShifts(req, res, next);
    expect(res.statusCode).toBe(400);
    const body = res._body?.body || res._body;
    expect(body.message || body.error?.message).toMatch(/Failed to get shifts|get-all-exploded/);
  });
});

describe("ShiftService.deleteShift catch (gap-fill)", () => {
  it("returns 400 when findByIdAndDelete throws", async () => {
    Shift.findByIdAndDelete.mockRejectedValueOnce(new Error("delete-failed"));
    const { req, res, next } = ctx({ params: { id: "507f1f77bcf86cd799439011" } });
    await ShiftService.deleteShift(req, res, next);
    expect(res.statusCode).toBe(400);
    const body = res._body?.body || res._body;
    expect(body.message || body.error?.message).toMatch(/Failed to delete shift|delete-failed/);
  });
});

describe("ShiftService.createShift catch (gap-fill)", () => {
  it("returns 400 when Shift.create throws", async () => {
    Shift.create.mockRejectedValueOnce(new Error("create-failed"));
    const { req, res, next } = ctx({
      body: { name: "Test Shift", color: "#000", timings: { monday: { enabled: false } } },
    });
    await ShiftService.createShift(req, res, next);
    expect(res.statusCode).toBe(400);
    const body = res._body?.body || res._body;
    expect(body.message || body.error?.message).toMatch(/Failed to create shift|create-failed/);
  });
});

describe("ShiftService.getShiftById catch (gap-fill)", () => {
  it("returns 400 when findById throws (e.g. malformed ObjectId)", async () => {
    Shift.findById = vi.fn().mockRejectedValueOnce(new Error("cast-failed"));
    const { req, res, next } = ctx({ params: { id: "not-an-objectid" } });
    await ShiftService.getShiftById(req, res, next);
    expect(res.statusCode).toBe(400);
    const body = res._body?.body || res._body;
    expect(body.message || body.error?.message).toMatch(/Failed to get shift by id|cast-failed/);
  });
});
