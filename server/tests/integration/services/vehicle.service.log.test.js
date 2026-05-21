/**
 * Integration coverage for VehicleService.log — happy paths the existing
 * vehicle.service.test.js only touched the validation/404 branches of.
 *
 *   - new-vehicle branch: `Vehicle.findOne` returns null so the service
 *     creates the vehicle document inline before logging.
 *   - existing-vehicle branch: a pre-seeded Vehicle is reused.
 *   - channel.findById -> null returns 404 (covers the channel-not-found
 *     branch with a real admin + vehicle in place).
 *   - happy path with no profile attached (skips the notification branch).
 *
 * Mocks: 3 (mirror vehicle.service.test.js — socket, jobs, mail).
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
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);

let admin;
let nvr;
let channel;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "vehicle-user-1",
    login: "vlog",
    email: "vlog@test.com",
  });
  nvr = await NVR.create({
    userId: "vehicle-user-1",
    nvrName: "TestNVR",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "nvr-1",
  });
  channel = await Channel.create({
    nvrId: nvr._id,
    userId: "vehicle-user-1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam-A",
  });
});

describe("VehicleService.log — channel-not-found branch", () => {
  it("returns 404 when admin + vehicle exist but channel does not", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        vehicleNumber: "AA01BB1111",
        nvrId: nvr._id.toString(),
        channelId: new mongoose.Types.ObjectId().toString(),
        images: { vehicle: "http://cdn/v.jpg" },
      },
    });
    await VehicleService.log(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("VehicleService.log — happy paths", () => {
  it("creates a new vehicle + log entry when the plate is new", async () => {
    expect(await Vehicle.countDocuments()).toBe(0);

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        vehicleNumber: "kA01ab9999", // lowercase to verify upper-casing
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
        images: { vehicle: "http://cdn/v.jpg" },
      },
    });
    await VehicleService.log(req, res);

    expect(res.statusCode).toBe(201);
    const created = await Vehicle.findOne({ vehicleNumber: "KA01AB9999" });
    expect(created).toBeTruthy();
    const logs = await VehicleLog.find({ vehicleId: created._id });
    expect(logs).toHaveLength(1);
    expect(logs[0].events).toHaveLength(1);
    expect(logs[0].events[0].images.vehicle).toBe("http://cdn/v.jpg");
  });

  it("reuses the existing vehicle document instead of creating a new one", async () => {
    const existing = await Vehicle.create({ vehicleNumber: "MH02CD5678" });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        vehicleNumber: "MH02CD5678",
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
        images: { vehicle: "http://cdn/v.jpg" },
      },
    });
    await VehicleService.log(req, res);

    expect(res.statusCode).toBe(201);
    // Same vehicle, no duplicate plates.
    expect(await Vehicle.countDocuments({ vehicleNumber: "MH02CD5678" })).toBe(1);
    const logs = await VehicleLog.find({ vehicleId: existing._id });
    expect(logs).toHaveLength(1);
  });

  it("appends a second event to the same day's vehicle log", async () => {
    // First entry
    {
      const { req, res } = serviceCtx({
        adminId: admin._id,
        body: {
          adminId: admin._id.toString(),
          vehicleNumber: "DL05EE0001",
          nvrId: nvr._id.toString(),
          channelId: channel._id.toString(),
          images: { vehicle: "http://cdn/v1.jpg" },
        },
      });
      await VehicleService.log(req, res);
      expect(res.statusCode).toBe(201);
    }
    // Second entry, same day -> upsert pushes another event.
    {
      const { req, res } = serviceCtx({
        adminId: admin._id,
        body: {
          adminId: admin._id.toString(),
          vehicleNumber: "DL05EE0001",
          nvrId: nvr._id.toString(),
          channelId: channel._id.toString(),
          images: { vehicle: "http://cdn/v2.jpg" },
        },
      });
      await VehicleService.log(req, res);
      expect(res.statusCode).toBe(201);
    }

    const vehicle = await Vehicle.findOne({ vehicleNumber: "DL05EE0001" });
    const logs = await VehicleLog.find({ vehicleId: vehicle._id });
    expect(logs).toHaveLength(1); // upsert -> single doc
    expect(logs[0].events).toHaveLength(2);
  });
});
