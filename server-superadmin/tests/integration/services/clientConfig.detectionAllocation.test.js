import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

const { default: ClientConfigService } = await import(
  "../../../core/v1/clientConfig/clientConfig.service.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: Allocation } = await import(
  "../../../core/v1/clientConfig/clientDetectionAllocation.model.js"
);
const { redis } = await import("../../../utils/database.js");

const PPE = "personalProtectiveEquipmentSettings";

beforeAll(async () => connectMongo());
afterAll(async () => disconnectMongo());
beforeEach(async () => {
  vi.restoreAllMocks();
  await clearCollections();
  vi.spyOn(redis, "publish").mockResolvedValue(1);
});

describe("detection allocation revocation", () => {
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
});
