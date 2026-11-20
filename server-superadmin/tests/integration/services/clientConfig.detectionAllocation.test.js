import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

vi.mock("../../../utils/database.js", () => ({
  redis: { publish: vi.fn().mockResolvedValue(1) },
}));

const { default: ClientConfigService } = await import(
  "../../../core/v1/clientConfig/clientConfig.service.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: Allocation } = await import(
  "../../../core/v1/clientConfig/clientDetectionAllocation.model.js"
);
const { default: CameraDetection } = await import(
  "../../../core/v1/clientConfig/clientCameraDetection.model.js"
);
const { default: Channel } = await import("../../../core/v1/channels/channels.model.js");
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { redis } = await import("../../../utils/database.js");
const { default: DetectionCatalog } = await import("../../../core/v1/detectionCatalog/detectionCatalog.model.js");
const { default: DetectionCatalogService } = await import("../../../core/v1/detectionCatalog/detectionCatalog.service.js");

const PPE = "personalProtectiveEquipmentSettings";
const STOCK_COUNTING = "loadingUnloadingStockCountingSettings";
const BLURRED_CAMERA = "blurredCameraDetectionSettings";

beforeAll(async () => connectMongo());
afterAll(async () => disconnectMongo());
beforeEach(async () => {
  vi.restoreAllMocks();
  await clearCollections();
  vi.spyOn(redis, "publish").mockResolvedValue(1);
});

describe("detection allocation revocation", () => {
  it("uses the selected client's display name for the allocation row and toggle response", async () => {
    const [custom, defaults] = await Admin.create([
      { user_id: "rename-client", login: "rename-client", email: "rename@test.com", purchasedCameras: 5,
        detectionDisplayNames: { [PPE]: "Safety Gear" } },
      { user_id: "default-client", login: "default-client", email: "defaults@test.com", purchasedCameras: 5 },
    ]);
    await DetectionCatalog.create({ settingType: PPE, name: "PPE Detection" });
    for (const [admin, name] of [[custom, "Safety Gear"], [defaults, "PPE Detection"]]) {
      const config = serviceCtx({ params: { adminId: String(admin._id) } });
      await ClientConfigService.getConfig(config.req, config.res);
      expect(payload(config.res).data.detections).toContainEqual(expect.objectContaining({ settingType: PPE, name }));
    }

    const allocation = serviceCtx({
      params: { adminId: String(custom._id), settingType: PPE },
      body: { cameraAllocation: 3, enabled: true },
    });
    await ClientConfigService.updateDetectionAllocation(allocation.req, allocation.res);
    expect(payload(allocation.res).data).toMatchObject({ settingType: PPE, name: "Safety Gear", enabled: true });
  });

  it("renames and restores only the selected client's detection", async () => {
    const [target, other] = await Admin.create([
      { user_id: "target-client", login: "target-client", email: "target@test.com" },
      { user_id: "other-client", login: "other-client", email: "other@test.com" },
    ]);
    await DetectionCatalog.create({ settingType: PPE, name: "PPE Detection" });
    const params = { adminId: String(target._id), settingType: PPE };
    const renamed = serviceCtx({ params, body: { displayName: " Safety Gear ", adminId: String(other._id) } });
    await ClientConfigService.updateDetectionDisplayName(renamed.req, renamed.res);
    expect(payload(renamed.res).data).toEqual({ settingType: PPE, name: "Safety Gear", displayName: "Safety Gear" });
    expect((await Admin.findById(target._id).lean()).detectionDisplayNames[PPE]).toBe("Safety Gear");
    expect((await Admin.findById(other._id).lean()).detectionDisplayNames?.[PPE]).toBeUndefined();
    expect(redis.publish).toHaveBeenCalledWith("detectionDisplayNames:update", JSON.stringify({ adminId: params.adminId }));

    const invalid = serviceCtx({ params: { ...params, settingType: "__proto__" }, body: { displayName: "Invalid" } });
    await ClientConfigService.updateDetectionDisplayName(invalid.req, invalid.res);
    expect(invalid.res.statusCode).toBe(400);

    const restored = serviceCtx({ params, body: { displayName: null } });
    await ClientConfigService.updateDetectionDisplayName(restored.req, restored.res);
    expect(payload(restored.res).data).toEqual({ settingType: PPE, name: "PPE Detection", displayName: null });
    expect((await Admin.findById(target._id).lean()).detectionDisplayNames?.[PPE]).toBeUndefined();
  });

  it.each([
    ["machine operations detection", "machineOpsDetectionSettings"],
    ["gender and age detection", "genderAgeDetectionSettings"],
    ["emotion detection", "emotionDetectionSettings"],
    ["loading/unloading stock counting", STOCK_COUNTING],
    ["sack loading/unloading", "sackLoadingUnloadingSettings"],
    ["blurred camera detection", BLURRED_CAMERA],
  ])("licenses %s with a camera allocation", async (_label, settingType) => {
    const admin = await Admin.create({
      user_id: "stock-client",
      login: "stock-client",
      email: "stock-client@test.com",
      purchasedCameras: 5,
    });
    const { req, res } = serviceCtx({
      params: { adminId: String(admin._id), settingType },
      body: { cameraAllocation: 3, enabled: true },
    });

    await ClientConfigService.updateDetectionAllocation(req, res);

    expect(payload(res).data).toMatchObject({
      settingType,
      cameraAllocation: 3,
      enabled: true,
    });
  });

  it("lists emotion in client licenses and the detection catalog before the publisher catches up", async () => {
    const admin = await Admin.create({
      user_id: "emotion-client", login: "emotion-client", email: "emotion@test.com", purchasedCameras: 5,
    });
    await DetectionCatalog.create({ settingType: PPE, name: "PPE Detection" });
    await Allocation.create({
      adminId: admin._id, settingType: "emotionDetectionSettings", cameraAllocation: 2, enabled: true,
    });

    const config = serviceCtx({ params: { adminId: String(admin._id) } });
    await ClientConfigService.getConfig(config.req, config.res);
    expect(payload(config.res).data.detections).toContainEqual(expect.objectContaining({
      settingType: "emotionDetectionSettings", name: "Emotion Detection", cameraAllocation: 2, enabled: true,
    }));

    const catalog = serviceCtx();
    await DetectionCatalogService.list(catalog.req, catalog.res);
    expect(payload(catalog.res).data.detections).toContainEqual(expect.objectContaining({
      settingType: "emotionDetectionSettings", name: "Emotion Detection", clientCount: 1,
    }));
  });

  it("turns a detection off and publishes a revoke when allocation reaches zero", async () => {
    const admin = await Admin.create({
      user_id: "client-1",
      login: "client-1",
      email: "client-1@test.com",
      purchasedCameras: 5,
    });
    await Allocation.create({
      adminId: admin._id,
      settingType: PPE,
      cameraAllocation: 2,
      enabled: true,
    });
    const { req, res } = serviceCtx({
      params: { adminId: String(admin._id), settingType: PPE },
      // This mirrors the admin UI request: it may still carry enabled:true
      // while the stepper has just reached zero.
      body: { cameraAllocation: 0, enabled: true },
    });

    await ClientConfigService.updateDetectionAllocation(req, res);

    expect(payload(res).data).toMatchObject({ cameraAllocation: 0, enabled: false });
    expect(await Allocation.findOne({ adminId: admin._id, settingType: PPE }).lean())
      .toMatchObject({ cameraAllocation: 0, enabled: false });
    expect(redis.publish).toHaveBeenCalledWith(
      "detectionAllocation:update",
      expect.stringContaining('"enabled":false'),
    );
  });

  it("does not revoke a detection while it retains a positive allocation", async () => {
    const admin = await Admin.create({
      user_id: "client-2",
      login: "client-2",
      email: "client-2@test.com",
      purchasedCameras: 5,
    });
    const { req, res } = serviceCtx({
      params: { adminId: String(admin._id), settingType: PPE },
      body: { cameraAllocation: 2, enabled: true },
    });

    await ClientConfigService.updateDetectionAllocation(req, res);

    expect(payload(res).data).toMatchObject({ cameraAllocation: 2, enabled: true });
  });

  it("removes the most recently assigned camera when the allocation is reduced", async () => {
    const admin = await Admin.create({
      user_id: "client-3",
      login: "client-3",
      email: "client-3@test.com",
      purchasedCameras: 5,
    });
    const nvr = await NVR.create({
      userId: admin.user_id,
      nvrName: "NVR-1",
      brand: "hikvision",
      domain: "nvr.local",
      location: "HQ",
      localNvrId: "client-3-nvr",
    });
    const cameras = await Promise.all([1, 2, 3].map((index) => Channel.create({
      nvrId: nvr._id,
      userId: admin.user_id,
      streamingPath: `/stream/client-3/${index}`,
      localChannelId: String(index),
      name: `Camera ${index}`,
      isAdded: true,
    })));
    await Allocation.create({
      adminId: admin._id,
      settingType: PPE,
      cameraAllocation: 3,
      enabled: true,
      cameraSelectionConfigured: true,
    });
    const assignments = await CameraDetection.insertMany(cameras.map((camera) => ({
      adminId: admin._id,
      cameraId: camera._id,
      settingType: PPE,
      enabled: true,
    })));
    for (let index = 0; index < assignments.length; index += 1) {
      await CameraDetection.collection.updateOne(
        { _id: assignments[index]._id },
        { $set: { updatedAt: new Date(`2026-09-21T10:00:0${index}.000Z`) } },
      );
    }

    const { req, res } = serviceCtx({
      params: { adminId: String(admin._id), settingType: PPE },
      body: { cameraAllocation: 2, enabled: true },
    });
    await ClientConfigService.updateDetectionAllocation(req, res);

    expect(payload(res).data).toMatchObject({
      cameraAllocation: 2,
      enabled: true,
      removedCameraIds: [String(cameras[2]._id)],
    });
    expect(await CameraDetection.findById(assignments[2]._id).lean())
      .toMatchObject({ enabled: false });
    expect(await CameraDetection.countDocuments({
      adminId: admin._id,
      settingType: PPE,
      enabled: true,
    })).toBe(2);
    expect(redis.publish).toHaveBeenCalledWith(
      "detectionAllocation:update",
      expect.stringContaining(`"cameraId":"${cameras[2]._id}"`),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      "detectionAllocation:update",
      expect.stringContaining('"scope":"camera"'),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      "detectionAllocation:update",
      expect.stringContaining('"revokeRunningDetection":true'),
    );
  });
});
