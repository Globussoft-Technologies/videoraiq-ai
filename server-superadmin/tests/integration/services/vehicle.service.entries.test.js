/**
 * Extra integration coverage for VehicleService.getVehicleEntries — date-range
 * filter branches that the original vehicle.service.test.js doesn't exercise.
 * Mocks mirror the original file (socket / jobs / mail).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { vehicleLog: vi.fn().mockResolvedValue(undefined) },
}));

const { default: VehicleService } = await import(
  "../../../core/v1/vehicle/vehicle.service.js"
);
const { default: VehicleLog } = await import(
  "../../../core/v1/vehicle/vehicle.log.model.js"
);
const { default: Vehicle } = await import(
  "../../../core/v1/vehicle/vehicle.model.js"
);
// Register the populate target schemas.
await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/channels/channels.model.js");

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

describe("VehicleService.getVehicleEntries — date filters", () => {
  it("filters by startDate only (includes everything on/after startDate)", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "KA01AB1234" });
    // Force a log doc with a known createdAt by patching after create.
    const older = await VehicleLog.create({
      adminId,
      vehicleId: vehicle._id,
      events: [],
    });
    await VehicleLog.collection.updateOne(
      { _id: older._id },
      { $set: { createdAt: new Date("2026-01-01T10:00:00Z") } },
    );
    const newer = await VehicleLog.create({
      adminId,
      vehicleId: vehicle._id,
      events: [],
    });
    await VehicleLog.collection.updateOne(
      { _id: newer._id },
      { $set: { createdAt: new Date("2026-03-15T10:00:00Z") } },
    );

    const { req, res } = serviceCtx({
      adminId,
      params: { vehicleId: vehicle._id.toString() },
      query: { startDate: "2026-02-01" },
    });
    await VehicleService.getVehicleEntries(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.entries).toHaveLength(1);
  });

  it("filters by endDate only (includes everything up to endDate)", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "KA01AB1234" });
    const old = await VehicleLog.create({
      adminId,
      vehicleId: vehicle._id,
      events: [],
    });
    await VehicleLog.collection.updateOne(
      { _id: old._id },
      { $set: { createdAt: new Date("2026-01-01T10:00:00Z") } },
    );
    const recent = await VehicleLog.create({
      adminId,
      vehicleId: vehicle._id,
      events: [],
    });
    await VehicleLog.collection.updateOne(
      { _id: recent._id },
      { $set: { createdAt: new Date("2026-05-01T10:00:00Z") } },
    );

    const { req, res } = serviceCtx({
      adminId,
      params: { vehicleId: vehicle._id.toString() },
      query: { endDate: "2026-02-01" },
    });
    await VehicleService.getVehicleEntries(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.entries).toHaveLength(1);
  });

  it("filters by startDate AND endDate (inclusive range)", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "KA01AB1234" });
    const middle = await VehicleLog.create({
      adminId,
      vehicleId: vehicle._id,
      events: [],
    });
    await VehicleLog.collection.updateOne(
      { _id: middle._id },
      { $set: { createdAt: new Date("2026-03-15T10:00:00Z") } },
    );
    const outside = await VehicleLog.create({
      adminId,
      vehicleId: vehicle._id,
      events: [],
    });
    await VehicleLog.collection.updateOne(
      { _id: outside._id },
      { $set: { createdAt: new Date("2026-07-01T10:00:00Z") } },
    );

    const { req, res } = serviceCtx({
      adminId,
      params: { vehicleId: vehicle._id.toString() },
      query: { startDate: "2026-02-01", endDate: "2026-04-01" },
    });
    await VehicleService.getVehicleEntries(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.entries).toHaveLength(1);
  });
});
