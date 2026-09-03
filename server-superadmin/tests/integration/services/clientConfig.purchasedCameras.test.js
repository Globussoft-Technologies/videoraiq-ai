/**
 * updatePurchasedCameras must mark the licence as EXPLICITLY set — including
 * a deliberate 0 to block a client — via planCamerasGranted. Without it, a
 * client this screen has never touched looks identical (bare
 * purchasedCameras: 0) to one the superadmin just blocked on purpose, and
 * server's own default-camera grant (grantPlanDefaultCameras /
 * reconcileAddedCameraLicenses in server/core/v2/clientConfig/
 * detectionLicense.service.js) would silently overwrite the block on that
 * client's next login or at the next boot reconciliation.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: ClientConfigService } = await import(
  "../../../core/v1/clientConfig/clientConfig.service.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: NVRModel } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Channel } = await import("../../../core/v1/channels/channels.model.js");
const { redis } = await import("../../../utils/database.js");

beforeAll(async () => { await connectMongo(); });
afterAll(async () => { await disconnectMongo(); });
beforeEach(async () => {
  vi.restoreAllMocks();
  await clearCollections();
  vi.spyOn(redis, "publish").mockResolvedValue(1);
});

const makeAdmin = (over = {}) =>
  Admin.create({ user_id: "u1", login: "t", email: "t@test.com", ...over });

const makeNvrWithCameras = async (userId, count) => {
  const nvr = await NVRModel.create({
    userId,
    nvrName: "N1",
    brand: "hikvision",
    domain: "d1",
    location: "L1",
    localNvrId: "ln1",
  });
  for (let i = 0; i < count; i += 1) {
    await Channel.create({
      nvrId: nvr._id,
      userId,
      streamingPath: `/s/${i}`,
      localChannelId: String(i),
      name: `Cam-${i}`,
      isAdded: true,
    });
  }
  return nvr;
};

describe("updatePurchasedCameras — marks the licence as explicitly set", () => {
  it("sets planCamerasGranted alongside a normal (non-zero) value", async () => {
    const admin = await makeAdmin();
    await makeNvrWithCameras(admin.user_id, 5);

    const { req, res, next } = serviceCtx({ params: { adminId: admin._id.toString() }, body: { purchasedCameras: 3 } });
    await ClientConfigService.updatePurchasedCameras(req, res, next);

    expect(payload(res).data.purchasedCameras).toBe(3);
    const fresh = await Admin.findById(admin._id).lean();
    expect(fresh.purchasedCameras).toBe(3);
    expect(fresh.planCamerasGranted).toBe(true);
  });

  it("sets planCamerasGranted when deliberately setting the licence to 0", async () => {
    const admin = await makeAdmin();

    const { req, res, next } = serviceCtx({ params: { adminId: admin._id.toString() }, body: { purchasedCameras: 0 } });
    await ClientConfigService.updatePurchasedCameras(req, res, next);

    const fresh = await Admin.findById(admin._id).lean();
    expect(fresh.purchasedCameras).toBe(0);
    // This is the bit that matters: a bare 0 alone cannot be told apart from
    // "never configured" — the flag is what makes this block stick.
    expect(fresh.planCamerasGranted).toBe(true);
  });
});

// The other half of this guarantee — that grantPlanDefaultCameras actually
// respects planCamerasGranted and never overrides a client already at that
// state — is covered on the client-backend side, in
// server/tests/integration/services/planDefaultCameras.test.js
// ("never overwrites a licence the superadmin already set" and the one-time
// tests). The two backends are separate packages, so it is verified there
// rather than cross-imported into this suite.
