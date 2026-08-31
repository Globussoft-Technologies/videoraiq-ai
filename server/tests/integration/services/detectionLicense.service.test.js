/**
 * Admin licensing & detection restrictions (core/v2/clientConfig/detectionLicense.service.js)
 * as enforced by the enable path every V2 client screen goes through,
 * ChannelsService.toggleDetection.
 *
 * Three rules, all owned by the superadmin:
 *   1. Admin.purchasedCameras caps the number of DISTINCT cameras running any
 *      detection.
 *   2. ClientDetectionAllocation.cameraAllocation caps the cameras a single
 *      detection type may run on.
 *   3. ClientDetectionAllocation.enabled decides whether the detection exists
 *      for the client at all.
 *
 * Unconfigured means denied — a client with no licence enables nothing.
 */
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
    handleDetectionStartStop: vi.fn().mockResolvedValue({ success: true }),
    handleDetectionUpdate: vi.fn().mockResolvedValue({ success: true }),
    registerChannel: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteChannel: vi.fn().mockResolvedValue(true) },
}));

const { default: ChannelsService } = await import(
  "../../../core/v2/channels/channels.service.js"
);
const { default: DetectionSettingsService } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.service.js"
);
const { default: Channel } = await import(
  "../../../core/v2/channels/channels.model.js"
);
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: DetectionAllocation } = await import(
  "../../../core/v2/clientConfig/clientDetectionAllocation.model.js"
);
const { CountPersonsDetectionSetting, VehiclDetectionSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
await import("../../../core/v2/NVR/nvr.model.js");
await import("../../../core/v2/profiles/profiles.model.js");
await import("../../../core/v2/authorizedUsers/authorizedUsers.model.js");
await import("../../../core/v2/users/users.model.js");

const USER_ID = "500";

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

/** A client with a camera licence and, optionally, detection allocations. */
async function makeClient({ purchasedCameras = 2, allocations = {} } = {}) {
  const admin = await Admin.create({
    user_id: USER_ID,
    login: "client",
    email: "client@test.com",
    purchasedCameras,
  });
  const rows = Object.entries(allocations).map(([settingType, cameraAllocation]) => ({
    adminId: admin._id,
    settingType,
    enabled: true,
    cameraAllocation,
  }));
  if (rows.length) await DetectionAllocation.insertMany(rows);
  return admin;
}

let channelSeq = 0;
async function makeCamera({ name, detections = {} } = {}) {
  channelSeq += 1;
  return Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: USER_ID,
    streamingPath: `/Streaming/Channels/${100 + channelSeq}`,
    localChannelId: String(channelSeq),
    name: name || `Cam-${channelSeq}`,
    isAdded: true,
    detections,
  });
}

function makeCountSetting() {
  return CountPersonsDetectionSetting.create({
    userId: USER_ID,
    settingType: "countPersonsSettings",
    name: "People Count",
    enabled: true,
    settings: {},
  });
}

function makeVehicleSetting() {
  return VehiclDetectionSetting.create({
    userId: USER_ID,
    settingType: "vehicleDetectionSettings",
    name: "ANPR",
    enabled: true,
    settings: {},
  });
}

function toggle(admin, channel, detectionType, enable) {
  const { req, res, next } = serviceCtx({
    user_id: USER_ID,
    adminId: admin._id.toString(),
    body: { channelId: channel._id.toString(), detectionType, enable },
  });
  return ChannelsService.toggleDetection(req, res, next).then(() => res);
}

describe("detection visibility restriction", () => {
  it("refuses to enable a detection the superadmin has not allocated", async () => {
    const admin = await makeClient({ purchasedCameras: 5, allocations: {} });
    const setting = await makeCountSetting();
    const camera = await makeCamera({
      detections: { countPersonsSettings: { id: setting._id, enabled: false } },
    });

    const res = await toggle(admin, camera, "countPersonsSettings", true);

    expect(res.statusCode).toBe(403);
    expect(payload(res).error.code).toBe("DETECTION_NOT_LICENSED");
  });

  it("hides unallocated detections from GET /detection-settings/types", async () => {
    const admin = await makeClient({
      purchasedCameras: 5,
      allocations: { countPersonsSettings: 2 },
    });
    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      adminId: admin._id.toString(),
    });

    await DetectionSettingsService.getDetectionTypes(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(Object.keys(payload(res).data.detectionTypes)).toEqual([
      "countPersonsSettings",
    ]);
  });

  it("returns no detection types at all for an unlicensed client", async () => {
    const admin = await makeClient({ purchasedCameras: 5, allocations: {} });
    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      adminId: admin._id.toString(),
    });

    await DetectionSettingsService.getDetectionTypes(req, res, next);

    expect(payload(res).data.detectionTypes).toEqual({});
  });
});

describe("no camera licence at all", () => {
  it("answers with a contact-support message, not deselect-a-camera", async () => {
    const admin = await makeClient({
      purchasedCameras: 0,
      allocations: { countPersonsSettings: 5 },
    });
    const setting = await makeCountSetting();
    const camera = await makeCamera({
      detections: { countPersonsSettings: { id: setting._id, enabled: false } },
    });

    const res = await toggle(admin, camera, "countPersonsSettings", true);

    expect(res.statusCode).toBe(403);
    expect(payload(res).error.code).toBe("NO_CAMERA_LICENSE");
    expect(payload(res).message).toBe(
      "You do not have any camera license. Please contact support to enable cameras."
    );
    // There is nothing to free, so no camera list is offered.
    expect(payload(res).error.cameras).toEqual([]);
  });

  it("takes precedence over the detection-not-licensed message", async () => {
    // Zero cameras AND no allocation: the camera licence is the more
    // fundamental problem and the one the user can actually act on.
    const admin = await makeClient({ purchasedCameras: 0, allocations: {} });
    const setting = await makeCountSetting();
    const camera = await makeCamera({
      detections: { countPersonsSettings: { id: setting._id, enabled: false } },
    });

    const res = await toggle(admin, camera, "countPersonsSettings", true);

    expect(payload(res).error.code).toBe("NO_CAMERA_LICENSE");
  });
});

describe("detection visibility beyond the detection screens", () => {
  it("keeps unlicensed detectors out of the global-schedule camera list", async () => {
    const { default: GlobalScheduleService } = await import(
      "../../../core/v2/globalSchedule/globalSchedule.service.js"
    );
    const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");

    const admin = await makeClient({
      purchasedCameras: 5,
      allocations: { countPersonsSettings: 5 },
    });
    const nvr = await NVR.create({
      userId: USER_ID,
      nvrName: "NVR-1",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "nvr-1",
    });
    const countSetting = await makeCountSetting();
    const vehicleSetting = await makeVehicleSetting();
    await Channel.create({
      nvrId: nvr._id,
      userId: USER_ID,
      streamingPath: "/Streaming/Channels/901",
      localChannelId: "901",
      name: "Mixed Camera",
      isAdded: true,
      detections: {
        // Licensed, and on -> schedulable.
        countPersonsSettings: { id: countSetting._id, enabled: true },
        // NOT licensed -> must not be offered for scheduling.
        vehicleDetectionSettings: { id: vehicleSetting._id, enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      adminId: admin._id.toString(),
      params: { nvrId: nvr._id.toString() },
    });
    await GlobalScheduleService.getNvrCameras(req, res, next);

    expect(res.statusCode).toBe(200);
    const configured = payload(res).data.configuredCameras;
    expect(configured).toHaveLength(1);
    expect(configured[0].configuredDetectors.map((d) => d.settingType)).toEqual([
      "countPersonsSettings",
    ]);
  });

  it("forces the log page off for an unlicensed detection", async () => {
    const { default: LogsConfigService } = await import(
      "../../../core/v2/logsConfiguration/logsConfiguration.service.js"
    );

    // ANPR licensed, Crusher and Person Count not.
    const admin = await makeClient({
      purchasedCameras: 5,
      allocations: { vehicleDetectionSettings: 5 },
    });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      adminId: admin._id.toString(),
    });
    await LogsConfigService.getLogsConfiguration(req, res, next);

    expect(res.statusCode).toBe(200);
    const logs = payload(res).data;
    expect(logs.anprLogs).toBe(true);
    // ...unlicensed ones lose theirs, despite defaulting to true.
    expect(logs.crusherLogs).toBe(false);
    expect(logs.personCountLogs).toBe(false);
    expect(logs.waterSpillLogs).toBe(false);
    expect(logs.deskAbsenceLogs).toBe(false);
    // Non-detection logs are never touched by licensing.
    expect(logs.attendanceLogs).toBe(true);
    expect(logs.accessLogs).toBe(true);
    expect(logs.trackLogs).toBe(true);
    expect(logs.taggedUsers).toBe(true);
    // These are not detection outputs, so they stay available whatever is
    // licensed: a face-library view and a presence timeline.
    expect(logs.detectedUsers).toBe(true);
    expect(logs.visibilityLogs).toBe(true);
  });

  it("keeps only the licensed detection's log page, plus the ungated ones", async () => {
    const { default: LogsConfigService } = await import(
      "../../../core/v2/logsConfiguration/logsConfiguration.service.js"
    );

    // Desk Absence licensed -> both its pages stay, and nothing else does.
    const admin = await makeClient({
      purchasedCameras: 5,
      allocations: { deskAbsenceSettings: 5 },
    });
    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      adminId: admin._id.toString(),
    });
    await LogsConfigService.getLogsConfiguration(req, res, next);

    const logs = payload(res).data;
    expect(logs.deskAbsenceLogs).toBe(true);
    expect(logs.anprLogs).toBe(false);
    // Not detection-gated, so these survive regardless.
    expect(logs.detectedUsers).toBe(true);
    expect(logs.visibilityLogs).toBe(true);
  });
});

describe("camera licence restriction", () => {
  it("refuses a third camera when the client has licensed two", async () => {
    const admin = await makeClient({
      purchasedCameras: 2,
      allocations: { countPersonsSettings: 5 },
    });
    const setting = await makeCountSetting();
    await makeCamera({
      name: "In-Use A",
      detections: { countPersonsSettings: { id: setting._id, enabled: true } },
    });
    await makeCamera({
      name: "In-Use B",
      detections: { countPersonsSettings: { id: setting._id, enabled: true } },
    });
    const third = await makeCamera({
      name: "Third",
      detections: { countPersonsSettings: { id: setting._id, enabled: false } },
    });

    const res = await toggle(admin, third, "countPersonsSettings", true);

    expect(res.statusCode).toBe(403);
    expect(payload(res).message).toBe(
      "You have exceeded your purchased camera license limit. Please deselect an existing camera to continue."
    );
    expect(payload(res).error.code).toBe("CAMERA_LICENSE_EXCEEDED");
    // The refusal names the cameras holding a slot so the UI can offer them for
    // deselection, each with the detections that would be switched off.
    expect(payload(res).error.cameras.map((c) => c.name).sort()).toEqual([
      "In-Use A",
      "In-Use B",
    ]);
    expect(payload(res).error.cameras[0].detections).toEqual([
      "countPersonsSettings",
    ]);
  });

  it("lets the third camera through once an existing one is deselected", async () => {
    const admin = await makeClient({
      purchasedCameras: 2,
      allocations: { countPersonsSettings: 5 },
    });
    const setting = await makeCountSetting();
    const first = await makeCamera({
      name: "In-Use A",
      detections: { countPersonsSettings: { id: setting._id, enabled: true } },
    });
    await makeCamera({
      name: "In-Use B",
      detections: { countPersonsSettings: { id: setting._id, enabled: true } },
    });
    const third = await makeCamera({
      name: "Third",
      detections: { countPersonsSettings: { id: setting._id, enabled: false } },
    });

    // Disabling is never blocked — that is what makes the refusal recoverable.
    const off = await toggle(admin, first, "countPersonsSettings", false);
    expect(off.statusCode).toBe(200);

    const res = await toggle(admin, third, "countPersonsSettings", true);
    expect(res.statusCode).toBe(200);
  });

  it("does not spend a second slot for a camera that already holds one", async () => {
    const admin = await makeClient({
      purchasedCameras: 1,
      allocations: { countPersonsSettings: 5, vehicleDetectionSettings: 5 },
    });
    const countSetting = await makeCountSetting();
    const vehicleSetting = await makeVehicleSetting();
    const camera = await makeCamera({
      name: "Only Camera",
      detections: {
        countPersonsSettings: { id: countSetting._id, enabled: true },
        vehicleDetectionSettings: { id: vehicleSetting._id, enabled: false },
      },
    });

    // The licence is per camera, not per detection — a second detection on the
    // same camera is free, and zone count never enters into it.
    const res = await toggle(admin, camera, "vehicleDetectionSettings", true);
    expect(res.statusCode).toBe(200);
  });
});

describe("detection-wise camera limit", () => {
  it("refuses a second camera for a detection allocated to one", async () => {
    const admin = await makeClient({
      purchasedCameras: 10,
      allocations: { vehicleDetectionSettings: 1 },
    });
    const setting = await makeVehicleSetting();
    await makeCamera({
      name: "Camera A",
      detections: { vehicleDetectionSettings: { id: setting._id, enabled: true } },
    });
    const cameraB = await makeCamera({
      name: "Camera B",
      detections: { vehicleDetectionSettings: { id: setting._id, enabled: false } },
    });

    const res = await toggle(admin, cameraB, "vehicleDetectionSettings", true);

    expect(res.statusCode).toBe(403);
    expect(payload(res).message).toBe(
      "You have reached the camera limit for ANPR Detection. Remove it from another camera to enable it here."
    );
    expect(payload(res).error.code).toBe("DETECTION_CAMERA_LIMIT_REACHED");
    expect(payload(res).error.limit).toBe(1);
    expect(payload(res).error.cameras.map((c) => c.name)).toEqual(["Camera A"]);
  });

  it("allows the second camera once the detection is removed from the first", async () => {
    const admin = await makeClient({
      purchasedCameras: 10,
      allocations: { vehicleDetectionSettings: 1 },
    });
    const setting = await makeVehicleSetting();
    const cameraA = await makeCamera({
      name: "Camera A",
      detections: { vehicleDetectionSettings: { id: setting._id, enabled: true } },
    });
    const cameraB = await makeCamera({
      name: "Camera B",
      detections: { vehicleDetectionSettings: { id: setting._id, enabled: false } },
    });

    await toggle(admin, cameraA, "vehicleDetectionSettings", false);
    const res = await toggle(admin, cameraB, "vehicleDetectionSettings", true);

    expect(res.statusCode).toBe(200);
  });

  it("does not let one detection's limit block a different detection", async () => {
    const admin = await makeClient({
      purchasedCameras: 10,
      allocations: { vehicleDetectionSettings: 1, countPersonsSettings: 2 },
    });
    const vehicleSetting = await makeVehicleSetting();
    const countSetting = await makeCountSetting();
    await makeCamera({
      name: "Camera A",
      detections: {
        vehicleDetectionSettings: { id: vehicleSetting._id, enabled: true },
      },
    });
    const cameraB = await makeCamera({
      name: "Camera B",
      detections: {
        countPersonsSettings: { id: countSetting._id, enabled: false },
      },
    });

    const res = await toggle(admin, cameraB, "countPersonsSettings", true);
    expect(res.statusCode).toBe(200);
  });
});
