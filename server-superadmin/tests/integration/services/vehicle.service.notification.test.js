/**
 * Integration coverage for VehicleService.log — the notification branch
 * (lines 113-142 of vehicle.service.js) which the existing test files leave
 * uncovered. The pre-existing vehicle.service.test.js + vehicle.service.log.test.js
 * mock `handleProfileNotification` to always return `false`, short-circuiting
 * past the email-recipients lookup + MailHelper.vehicleLog call.
 *
 * This file mocks `handleProfileNotification` to return TRUE so the inner
 * recipients lookup + email dispatch arms execute, and additionally pins:
 *   - happy path: profile present + handleProfileNotification true + valid
 *     email recipients + channels.email true  →  MailHelper.vehicleLog
 *     invoked exactly once with the expected email list.
 *   - profile present + handleProfileNotification true + recipients list but
 *     channels.email FALSE  →  MailHelper.vehicleLog NOT invoked
 *     (boundary on `channel.profile.notification?.channels?.email`).
 *   - profile present + handleProfileNotification true + ZERO email
 *     recipients matched (because the seeded recipients are `phone` type)
 *     → MailHelper.vehicleLog NOT invoked (boundary on
 *     `emailAddresses.length`).
 *   - getVehicles error → 500 (catch branch).
 *   - getVehicleEntries error → 500 (catch branch — passes a non-ObjectId
 *     after mongoose.Types.ObjectId.isValid check by short-circuiting via
 *     mocked Vehicle.find that throws).
 *
 * Mocks: 3 (socket, jobs, mail) — same shape as vehicle.service.log.test.js.
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
  default: { handleProfileNotification: vi.fn().mockResolvedValue(true) },
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
const { default: Profile } = await import(
  "../../../core/v1/profiles/profiles.model.js"
);
const { default: RecipientModel } = await import(
  "../../../core/v1/verifyRecipients/recipients.model.js"
);
const MailHelper = (
  await import("../../../mailService/mail.helper.js")
).default;

let admin;
let nvr;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
  admin = await Admin.create({
    user_id: "vehicle-notif-1",
    login: "vnotif",
    email: "vnotif@test.com",
  });
  nvr = await NVR.create({
    userId: "vehicle-notif-1",
    nvrName: "TestNVR-N",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "nvr-N",
  });
});

async function seedChannelWithProfile({ emailEnabled, recipientType }) {
  const recipient = await RecipientModel.create({
    adminId: admin._id,
    type: recipientType,
    value:
      recipientType === "email" ? "alerts@example.com" : "+15555550100",
    verified: true,
  });
  const profile = await Profile.create({
    userType: "Admin",
    createdBy: admin._id,
    user: admin._id,
    status: "Active",
    basics: { profileName: "VehicleProfile" },
    notification: {
      notify: "Instant",
      recipients: [recipient._id],
      channels: { email: emailEnabled, smsWhatsapp: false, push: false, webhook: false },
    },
  });
  const channel = await Channel.create({
    nvrId: nvr._id,
    userId: "vehicle-notif-1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam-N",
    profile: profile._id,
  });
  return { channel, profile, recipient };
}

describe("VehicleService.log — notification branch (handleProfileNotification → true)", () => {
  it("dispatches MailHelper.vehicleLog when profile, email recipients, and channels.email are all set", async () => {
    const { channel } = await seedChannelWithProfile({
      emailEnabled: true,
      recipientType: "email",
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        vehicleNumber: "TN09ZZ0001",
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
        images: { vehicle: "http://cdn/v.jpg" },
      },
    });
    await VehicleService.log(req, res);

    expect(res.statusCode).toBe(201);
    expect(MailHelper.vehicleLog).toHaveBeenCalledTimes(1);
    const args = MailHelper.vehicleLog.mock.calls[0];
    // [emailAddresses, entry, nvrId, channel]
    expect(args[0]).toEqual(["alerts@example.com"]);
    expect(args[1]).toBeDefined();
    // entry should include the populated vehicle and the event we just pushed.
    expect(args[1].event.images.vehicle).toBe("http://cdn/v.jpg");
  });

  it("skips MailHelper.vehicleLog when channels.email is false", async () => {
    const { channel } = await seedChannelWithProfile({
      emailEnabled: false,
      recipientType: "email",
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        vehicleNumber: "TN09ZZ0002",
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
        images: { vehicle: "http://cdn/v.jpg" },
      },
    });
    await VehicleService.log(req, res);

    expect(res.statusCode).toBe(201);
    expect(MailHelper.vehicleLog).not.toHaveBeenCalled();
  });

  it("skips MailHelper.vehicleLog when there are no email-type recipients (only phone)", async () => {
    const { channel } = await seedChannelWithProfile({
      emailEnabled: true,
      recipientType: "phone", // type filter on RecipientModel.find excludes
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        vehicleNumber: "TN09ZZ0003",
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
        images: { vehicle: "http://cdn/v.jpg" },
      },
    });
    await VehicleService.log(req, res);

    expect(res.statusCode).toBe(201);
    expect(MailHelper.vehicleLog).not.toHaveBeenCalled();
  });
});

describe("VehicleService.getVehicles — catch branch", () => {
  it("returns 500 when Vehicle.find throws", async () => {
    const spy = vi
      .spyOn(Vehicle, "find")
      .mockImplementationOnce(() => {
        throw new Error("vehicle-find-boom");
      });

    const { req, res } = serviceCtx({ adminId: admin._id, query: {} });
    await VehicleService.getVehicles(req, res);

    expect(res.statusCode).toBe(500);
    spy.mockRestore();
  });
});

describe("VehicleService.getVehicleEntries — catch branch", () => {
  it("returns 500 when VehicleLog.find throws", async () => {
    const vehicle = await Vehicle.create({ vehicleNumber: "ZZ09AB0009" });
    const spy = vi.spyOn(VehicleLog, "find").mockImplementationOnce(() => {
      throw new Error("entries-find-boom");
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      params: { vehicleId: vehicle._id.toString() },
      query: {},
    });
    await VehicleService.getVehicleEntries(req, res);

    expect(res.statusCode).toBe(500);
    spy.mockRestore();
  });
});
