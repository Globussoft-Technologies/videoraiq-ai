/**
 * Integration test for VehicleService — log / getVehicles / getVehicleEntries
 * against in-memory MongoDB. Socket + jobs + mail are mocked.
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
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
// Register NVR + Channel schemas for the populate() paths.
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

describe("VehicleService.log", () => {
  it("returns 400 for an invalid body", async () => {
    const { req, res } = serviceCtx({ adminId, body: {} });
    await VehicleService.log(req, res);
    expect(res.statusCode).toBe(400);
    expect(res._body.success).toBe(false);
  });

  it("returns 404 when the admin does not exist", async () => {
    const { req, res } = serviceCtx({
      adminId,
      body: {
        adminId: new mongoose.Types.ObjectId().toString(),
        vehicleNumber: "KA01AB1234",
        nvrId: new mongoose.Types.ObjectId().toString(),
        channelId: new mongoose.Types.ObjectId().toString(),
        images: { vehicle: "http://cdn/v.jpg" },
      },
    });
    await VehicleService.log(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("VehicleService.getVehicles", () => {
  beforeEach(async () => {
    await Vehicle.create({ vehicleNumber: "KA01AB1234" });
    await Vehicle.create({ vehicleNumber: "MH02CD5678" });
  });

  it("returns all vehicles when no search term", async () => {
    const { req, res } = serviceCtx({ adminId, query: {} });
    await VehicleService.getVehicles(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.vehicles).toHaveLength(2);
  });

  it("filters vehicles by search term", async () => {
    const { req, res } = serviceCtx({ adminId, query: { search: "KA01" } });
    await VehicleService.getVehicles(req, res);
    expect(payload(res).data.vehicles).toHaveLength(1);
    expect(payload(res).data.vehicles[0].vehicleNumber).toBe("KA01AB1234");
  });
});

describe("VehicleService.getVehicleEntries", () => {
  it("rejects an invalid vehicle id (400)", async () => {
    const { req, res } = serviceCtx({
      adminId,
      params: { vehicleId: "bad-id" },
      query: {},
    });
    await VehicleService.getVehicleEntries(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns the vehicle's log entries", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "KA01AB1234" });
    await VehicleLog.create({ adminId, vehicleId: vehicle._id, events: [] });
    const { req, res } = serviceCtx({
      adminId,
      params: { vehicleId: vehicle._id.toString() },
      query: {},
    });
    await VehicleService.getVehicleEntries(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.entries).toHaveLength(1);
  });

  it("returns an empty list for a vehicle with no entries", async () => {
    const { req, res } = serviceCtx({
      adminId,
      params: { vehicleId: new mongoose.Types.ObjectId().toString() },
      query: {},
    });
    await VehicleService.getVehicleEntries(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.entries).toHaveLength(0);
  });
});
