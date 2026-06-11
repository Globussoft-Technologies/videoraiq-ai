/**
 * Gap-fill for VehicleService — covers the `catch (error)` arm at lines
 * 150-155 of `logVehicleEntry`. Baseline tests only exercise the happy path
 * and validation guards; they never force the body to throw.
 *
 * We mock Vehicle.findOne to reject so control reaches the catch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReqRes } from "../../helpers/factory.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { vehicleLog: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../../core/v1/admin/admin.model.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../../../core/v1/vehicle/vehicle.model.js", () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));

const { default: VehicleService } = await import(
  "../../../core/v1/vehicle/vehicle.service.js"
);
const { default: Vehicle } = await import(
  "../../../core/v1/vehicle/vehicle.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

function ctx() {
  const { req, res, next } = makeReqRes();
  req.verified = {
    userData: {
      adminId: "507f1f77bcf86cd799439011",
      user_id: 1,
      _id: "507f1f77bcf86cd799439011",
    },
  };
  return { req, res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VehicleService.log catch (lines 150-155)", () => {
  it("returns 500 when Vehicle.findOne rejects after passing validation + admin lookup", async () => {
    Admin.findById.mockResolvedValueOnce({ _id: "a", user_id: 1 });
    Vehicle.findOne.mockRejectedValueOnce(new Error("db-out"));
    const { req, res, next } = ctx();
    req.body = {
      adminId: "507f1f77bcf86cd799439011",
      vehicleNumber: "KA01XY9999",
      nvrId: "507f1f77bcf86cd799439011",
      channelId: "507f1f77bcf86cd799439012",
      images: { vehicle: "https://img.test/v.png" },
    };
    await VehicleService.log(req, res, next);
    expect(res.statusCode).toBe(500);
    const body = res._body?.body || res._body;
    expect(body.message).toMatch(/Failed to log vehicle entry|db-out/);
  });
});
