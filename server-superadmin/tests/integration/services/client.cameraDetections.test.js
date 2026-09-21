import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

const { default: ClientService } = await import(
  "../../../core/v1/client/client.service.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Channel } = await import("../../../core/v1/channels/channels.model.js");
const { default: Allocation } = await import(
  "../../../core/v1/clientConfig/clientDetectionAllocation.model.js"
);
const { default: CameraDetection } = await import(
  "../../../core/v1/clientConfig/clientCameraDetection.model.js"
);
const { redis } = await import("../../../utils/database.js");

const PPE = "personalProtectiveEquipmentSettings";

beforeAll(async () => connectMongo());
afterAll(async () => disconnectMongo());
beforeEach(async () => {
  await clearCollections();
  vi.restoreAllMocks();
  vi.spyOn(redis, "publish").mockResolvedValue(1);
});

const makeClient = async (userId = "client-1", allowance = 2) => {
  const admin = await Admin.create({
    user_id: userId,
    login: userId,
    email: `${userId}@test.com`,
  });
  await Allocation.create({
    adminId: admin._id,
    settingType: PPE,
    cameraAllocation: allowance,
    enabled: true,
  });
  const nvr = await NVR.create({
    userId,
    nvrName: "NVR-1",
    brand: "hikvision",
    domain: "nvr.local",
    location: "HQ",
    localNvrId: `${userId}-nvr`,
  });
  return { admin, nvr };
};

const makeCamera = (userId, nvrId, index, isAdded = true) =>
  Channel.create({
    nvrId,
    userId,
    streamingPath: `/stream/${userId}/${index}`,
    localChannelId: String(index),
    name: `Camera ${index}`,
    isAdded,
  });

const update = async (adminId, cameraId, enabled = true) => {
  const { req, res } = serviceCtx({
    params: { adminId: String(adminId), cameraId: String(cameraId) },
    body: { settingType: PPE, enabled },
  });
  await ClientService.updateCameraDetection(req, res);
  return res;
};

describe("client camera detection assignments", () => {
  it("allows exactly the purchased per-detection camera allocation", async () => {
    const { admin, nvr } = await makeClient();
    const cameras = await Promise.all([
      makeCamera(admin.user_id, nvr._id, 1),
      makeCamera(admin.user_id, nvr._id, 2),
      makeCamera(admin.user_id, nvr._id, 3),
    ]);

    expect(payload(await update(admin._id, cameras[0]._id)).status).toBe("success");
    expect(redis.publish).toHaveBeenCalledWith(
      "detectionAllocation:update",
      expect.stringContaining('"scope":"camera"'),
    );
    expect(payload(await update(admin._id, cameras[1]._id)).status).toBe("success");
    const allocation = await Allocation.findOne({ adminId: admin._id, settingType: PPE }).lean();
    expect(allocation.cameraSelectionConfigured).toBe(true);

    const third = await update(admin._id, cameras[2]._id);
    expect(third.statusCode).toBe(400);
    expect(payload(third).message).toContain("2 allowed");
    expect(await CameraDetection.countDocuments({ adminId: admin._id, enabled: true })).toBe(2);
  });

  it("does not let stale rows for removed cameras consume the allowance", async () => {
    const { admin, nvr } = await makeClient(undefined, 1);
    const removed = await makeCamera(admin.user_id, nvr._id, 1, false);
    const active = await makeCamera(admin.user_id, nvr._id, 2, true);
    await CameraDetection.create({
      adminId: admin._id,
      cameraId: removed._id,
      settingType: PPE,
      enabled: true,
    });

    expect(payload(await update(admin._id, active._id)).status).toBe("success");
  });

  it("makes a manually deselected camera slot flexible without revoking a running detection", async () => {
    const { admin, nvr } = await makeClient(undefined, 2);
    const camera = await makeCamera(admin.user_id, nvr._id, 1);

    expect(payload(await update(admin._id, camera._id, true)).status).toBe("success");
    redis.publish.mockClear();

    expect(payload(await update(admin._id, camera._id, false)).status).toBe("success");
    const [, message] = redis.publish.mock.calls[0];
    expect(JSON.parse(message)).toMatchObject({
      scope: "camera",
      cameraId: String(camera._id),
      settingType: PPE,
      enabled: false,
      revokeRunningDetection: false,
    });
  });

  it("rejects a camera that belongs to a different client", async () => {
    const first = await makeClient("client-1");
    const second = await makeClient("client-2");
    const foreignCamera = await makeCamera(second.admin.user_id, second.nvr._id, 1);

    const result = await update(first.admin._id, foreignCamera._id);
    expect(result.statusCode).toBe(404);
    expect(payload(result).message).toBe("Camera not found for this client");
  });

  it("returns allocation limits with the camera grid", async () => {
    const { admin, nvr } = await makeClient();
    await makeCamera(admin.user_id, nvr._id, 1);
    const { req, res } = serviceCtx({
      params: { adminId: String(admin._id) },
      query: {},
    });

    await ClientService.getClientCameras(req, res);

    expect(payload(res).data.detectionAllocations[PPE]).toBe(2);
  });
});
