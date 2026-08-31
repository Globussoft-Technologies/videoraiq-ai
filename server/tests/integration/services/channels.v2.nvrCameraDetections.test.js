import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionStartStop: vi.fn().mockResolvedValue({}),
    registerChannel: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteChannel: vi.fn().mockResolvedValue(true) },
}));

const { default: ChannelsService } = await import(
  "../../../core/v2/channels/channels.service.js"
);
const { default: Channel } = await import(
  "../../../core/v2/channels/channels.model.js"
);
const { default: Admin } = await import(
  "../../../core/v2/admin/admin.model.js"
);
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: DetectionAllocation } = await import(
  "../../../core/v2/clientConfig/clientDetectionAllocation.model.js"
);
await import("../../../core/v2/profiles/profiles.model.js");
await import("../../../core/v2/detectionSettings/detectionSettings.model.js");
await import("../../../core/v2/authorizedUsers/authorizedUsers.model.js");
await import("../../../core/v2/users/users.model.js");

beforeAll(async () => {
  await connectMongo();
});

afterAll(async () => {
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();
});

function makeChannel(over = {}) {
  return Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: "u1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Lobby Cam",
    isAdded: true,
    ...over,
  });
}

/**
 * License detection types for a client. Detections the superadmin has not
 * allocated are invisible to the client (detectionLicense.service.js), so any
 * test expecting a detection to be returned has to grant it first.
 */
function licenseDetections(adminId, settingTypes) {
  return DetectionAllocation.insertMany(
    settingTypes.map((settingType) => ({
      adminId,
      settingType,
      enabled: true,
      cameraAllocation: 10,
    }))
  );
}

function makeNvr(over = {}) {
  return NVR.create({
    userId: "1",
    nvrName: "NVR-1",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "loc-1",
    ...over,
  });
}

describe("v2 ChannelsService.getNvrCameraDetections", () => {
  it("groups cameras under their NVR and returns enabled detection names", async () => {
    const admin = await Admin.create({
      user_id: "42",
      login: "a",
      email: "a@test.com",
    });
    await licenseDetections(admin._id, [
      "countPersonsSettings",
      "vehicleDetectionSettings",
      "crowdDetectionSettings",
      "lightDetectionSettings",
    ]);
    const nvr1 = await makeNvr({
      userId: "42",
      nvrName: "NVR-A",
      localNvrId: "nvr-a",
    });
    const nvr2 = await makeNvr({
      userId: "42",
      nvrName: "NVR-B",
      localNvrId: "nvr-b",
    });

    await makeChannel({
      userId: "42",
      nvrId: nvr1._id,
      name: "Front Gate",
      control: 1,
      detections: {
        countPersonsSettings: { enabled: true },
        motionDetectionSettings: { enabled: false },
      },
    });
    await makeChannel({
      userId: "42",
      nvrId: nvr1._id,
      name: "Lobby",
      customName: "Lobby Custom",
      localChannelId: "2",
      control: 1,
      detections: {
        vehicleDetectionSettings: { enabled: true },
      },
    });
    await makeChannel({
      userId: "42",
      nvrId: nvr2._id,
      name: "Warehouse",
      localChannelId: "3",
      control: 1,
      detections: {
        crowdDetectionSettings: { enabled: true },
        lightDetectionSettings: { enabled: true },
      },
    });
    const stoppedCamera = await makeChannel({
      userId: "42",
      nvrId: nvr2._id,
      name: "Stopped Camera",
      localChannelId: "4",
      detections: {
        crowdDetectionSettings: { enabled: true },
      },
    });
    await Channel.updateOne({ _id: stoppedCamera._id }, { $set: { control: 0 } });
    await makeChannel({
      userId: "42",
      nvrId: nvr2._id,
      name: "No Detection Camera",
      localChannelId: "5",
      control: 1,
      detections: {
        crowdDetectionSettings: { enabled: false },
      },
    });

    const { req, res, next } = serviceCtx({
      params: { adminId: admin._id.toString() },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalNvrs).toBe(2);
    expect(payload(res).data.nvrs).toHaveLength(2);
    expect(payload(res).data.nvrs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nvrName: "NVR-A",
          cameras: expect.arrayContaining([
            expect.objectContaining({
              cameraName: "Front Gate",
              detections: ["Count Persons Detection"],
            }),
            expect.objectContaining({
              cameraName: "Lobby Custom",
              detections: ["ANPR Detection"],
            }),
          ]),
        }),
        expect.objectContaining({
          nvrName: "NVR-B",
          cameras: [
            expect.objectContaining({
              cameraName: "Warehouse",
              detections: ["Crowd Detection", "Light Detection"],
            }),
          ],
        }),
      ])
    );
  });

  it("restricts grouped cameras to authorized channels for members", async () => {
    const admin = await Admin.create({
      user_id: "55",
      login: "a",
      email: "a@test.com",
    });
    await licenseDetections(admin._id, [
      "countVehiclesSettings",
      "countPersonsSettings",
    ]);
    const nvr = await makeNvr({
      userId: "55",
      nvrName: "Member NVR",
      localNvrId: "member-nvr",
    });
    const allowedChannel = await makeChannel({
      userId: "55",
      nvrId: nvr._id,
      name: "Allowed Cam",
      control: 1,
      detections: {
        countVehiclesSettings: { enabled: true },
      },
    });
    await makeChannel({
      userId: "55",
      nvrId: nvr._id,
      localChannelId: "2",
      name: "Blocked Cam",
      control: 1,
      detections: {
        countPersonsSettings: { enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      params: { adminId: admin._id.toString() },
      memberId: "member-1",
      authorizedChannel: {
        channels: [allowedChannel._id],
      },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalNvrs).toBe(1);
    expect(payload(res).data.nvrs[0].cameras).toHaveLength(1);
    expect(payload(res).data.nvrs[0].cameras[0].cameraName).toBe(
      "Allowed Cam"
    );
    expect(payload(res).data.nvrs[0].cameras[0].detections).toEqual([
      "Count Vehicles Detection",
    ]);
  });

  it("excludes cameras that are stopped or have no enabled detections", async () => {
    const admin = await Admin.create({
      user_id: "77",
      login: "a",
      email: "a@test.com",
    });
    await licenseDetections(admin._id, ["countPersonsSettings"]);
    const nvr = await makeNvr({
      userId: "77",
      nvrName: "Filtered NVR",
      localNvrId: "filtered-nvr",
    });
    await makeChannel({
      userId: "77",
      nvrId: nvr._id,
      name: "Running Camera",
      control: 1,
      detections: {
        countPersonsSettings: { enabled: true },
      },
    });
    const stoppedFilteredCamera = await makeChannel({
      userId: "77",
      nvrId: nvr._id,
      localChannelId: "2",
      name: "Stopped Camera",
      detections: {
        countPersonsSettings: { enabled: true },
      },
    });
    await Channel.updateOne(
      { _id: stoppedFilteredCamera._id },
      { $set: { control: 0 } }
    );
    await makeChannel({
      userId: "77",
      nvrId: nvr._id,
      localChannelId: "3",
      name: "No Enabled Detection",
      control: 1,
      detections: {
        countPersonsSettings: { enabled: false },
      },
    });

    const { req, res, next } = serviceCtx({
      params: { adminId: admin._id.toString() },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalNvrs).toBe(1);
    expect(payload(res).data.nvrs[0].cameras).toHaveLength(1);
    expect(payload(res).data.nvrs[0].cameras[0].cameraName).toBe(
      "Running Camera"
    );
  });

  it("omits detections the superadmin has not licensed for this client", async () => {
    const admin = await Admin.create({
      user_id: "88",
      login: "a",
      email: "a@test.com",
    });
    // Only Crowd Detection is licensed; the camera is also running Light
    // Detection, which must not surface anywhere in the client UI.
    await licenseDetections(admin._id, ["crowdDetectionSettings"]);
    const nvr = await makeNvr({
      userId: "88",
      nvrName: "Licensed NVR",
      localNvrId: "licensed-nvr",
    });
    await makeChannel({
      userId: "88",
      nvrId: nvr._id,
      name: "Mixed Camera",
      control: 1,
      detections: {
        crowdDetectionSettings: { enabled: true },
        lightDetectionSettings: { enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      params: { adminId: admin._id.toString() },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.nvrs[0].cameras[0].detections).toEqual([
      "Crowd Detection",
    ]);
  });

  it("returns no cameras when the client has no licensed detections", async () => {
    const admin = await Admin.create({
      user_id: "99",
      login: "a",
      email: "a@test.com",
    });
    const nvr = await makeNvr({
      userId: "99",
      nvrName: "Unlicensed NVR",
      localNvrId: "unlicensed-nvr",
    });
    await makeChannel({
      userId: "99",
      nvrId: nvr._id,
      name: "Orphan Camera",
      control: 1,
      detections: {
        crowdDetectionSettings: { enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      params: { adminId: admin._id.toString() },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalNvrs).toBe(0);
  });

  it("returns 400 when adminId is missing", async () => {
    const { req, res, next } = serviceCtx({});
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toBe("Missing required adminId");
  });

  it("returns 404 when adminId does not exist", async () => {
    const { req, res, next } = serviceCtx({
      params: { adminId: new mongoose.Types.ObjectId().toString() },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(payload(res).message).toBe("Admin not found");
  });
});
