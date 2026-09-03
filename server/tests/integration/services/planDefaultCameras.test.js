/**
 * Plan-based default camera allowance, matched by aMember product NAME.
 *
 * A free-trial client starts at purchasedCameras 0, which under "unconfigured
 * means denied" would let them enable nothing at all — a trial they cannot use.
 * The trial product therefore grants a starting licence of 5.
 *
 * Matched by name, not product_id, because the ids differ between the dev and
 * production aMember installs while the title is the same in both.
 *
 * The grant is ONE-TIME: a superadmin who later changes the licence (including
 * back to 0, to block someone) must not have it undone at the next login.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("../../../services/python.service.js", () => ({
  default: { handleDetectionStartStop: vi.fn(), fetchDsDetectorNames: vi.fn() },
}));

const { connectMongo, disconnectMongo, clearCollections } = await import("../dbSetup.js");
const { defaultCamerasForPlan, grantPlanDefaultCameras, reconcileAddedCameraLicenses } =
  await import("../../../core/v2/clientConfig/detectionLicense.service.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { default: DetectionAllocation } = await import(
  "../../../core/v2/clientConfig/clientDetectionAllocation.model.js"
);
const { DETECTION_TYPES } = await import("../../../constants/detectionTypes.js");
const { redis } = await import("../../../utils/database.js");
const mongoose = (await import("mongoose")).default;

const ALL_TYPES = Object.keys(DETECTION_TYPES);

// The real dev catalogue: 5 Basic, 6 Free Trial, 7 Pro. Production may number
// them differently — which is exactly why the match is on the name.
const PRODUCTS = [
  { product_id: 5, title: "Basic Surveillance" },
  { product_id: 6, title: "Surveillance Free Trial" },
  { product_id: 7, title: "Pro Surveillance Plan" },
];
const TRIAL = "6";
const BASIC = "5";
const PRO = "7";

/** Stub aMember /products. The service caches, so clear it between tests. */
function mockProducts(payload = PRODUCTS) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  }));
}

beforeAll(async () => { await connectMongo(); });
afterAll(async () => { await disconnectMongo(); vi.unstubAllGlobals(); });
beforeEach(async () => {
  vi.restoreAllMocks();
  await clearCollections();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Jump past the product cache window so each test fetches fresh.
  vi.setSystemTime(Date.now() + 60 * 60 * 1000);
  mockProducts();
  // No real Redis in the test environment. grantPlanDefaultCameras publishes
  // fire-and-forget (never awaited on the caller's path), so leaving the real
  // client would just queue against an unreachable host — stub it so the live
  // -update call can actually be asserted on instead.
  vi.spyOn(redis, "publish").mockResolvedValue(1);
});

const makeAdmin = (over = {}) =>
  Admin.create({ user_id: "4242", login: "t", email: "t@test.com", ...over });

let channelSeq = 0;
const makeCamera = (userId, detections = {}) => {
  channelSeq += 1;
  return Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId,
    streamingPath: `/Streaming/Channels/${100 + channelSeq}`,
    localChannelId: String(channelSeq),
    name: `Cam-${channelSeq}`,
    isAdded: true,
    detections,
  });
};

describe("defaultCamerasForPlan — matched by product name", () => {
  it("grants 5 for Surveillance Free Trial", async () => {
    expect(await defaultCamerasForPlan({ [TRIAL]: "2026-09-23" })).toBe(5);
  });

  it("grants nothing for paid plans", async () => {
    expect(await defaultCamerasForPlan({ [BASIC]: "2026-12-01" })).toBe(0);
    expect(await defaultCamerasForPlan({ [PRO]: "2026-12-01" })).toBe(0);
  });

  it("takes the highest when several plans are held", async () => {
    expect(await defaultCamerasForPlan({ [PRO]: "x", [TRIAL]: "y" })).toBe(5);
  });

  it("matches regardless of case and spacing", async () => {
    mockProducts([{ product_id: 99, title: "  SURVEILLANCE   Free  Trial " }]);
    expect(await defaultCamerasForPlan({ 99: "x" })).toBe(5);
  });

  it("follows the name when production uses a different id", async () => {
    // Same product, different id — an id-keyed map would miss this entirely.
    mockProducts([{ product_id: 412, title: "Surveillance Free Trial" }]);
    expect(await defaultCamerasForPlan({ 412: "x" })).toBe(5);
  });

  it("accepts the object-keyed shape aMember can return", async () => {
    mockProducts({ 0: { product_id: 6, title: "Surveillance Free Trial" }, _total: 1 });
    expect(await defaultCamerasForPlan({ [TRIAL]: "x" })).toBe(5);
  });

  it("grants nothing when /products cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aMember down")));
    expect(await defaultCamerasForPlan({ [TRIAL]: "x" })).toBe(0);
  });

  it("is safe on missing or malformed input", async () => {
    expect(await defaultCamerasForPlan(undefined)).toBe(0);
    expect(await defaultCamerasForPlan(null)).toBe(0);
    expect(await defaultCamerasForPlan({})).toBe(0);
    expect(await defaultCamerasForPlan("nonsense")).toBe(0);
  });
});

describe("defaultCamerasForPlan — name straight off the token", () => {
  // Tokens minted upstream (created_from "EMP") carry currentPlan.name, and
  // verifyToken exposes the whole decoded payload — so no API call is needed.
  it("reads currentPlan.name without touching aMember", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const cameras = await defaultCamerasForPlan({
      currentPlan: { id: 6, name: "Surveillance Free Trial", expiresAt: "2026-09-23" },
      userSubscriptionType: { 6: "2026-09-23" },
    });

    expect(cameras).toBe(5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores a paid currentPlan", async () => {
    const cameras = await defaultCamerasForPlan({
      currentPlan: { id: 7, name: "Pro Surveillance Plan" },
      userSubscriptionType: { [PRO]: "x" },
    });
    expect(cameras).toBe(0);
  });

  it("falls back to id resolution when the token has no currentPlan", async () => {
    const cameras = await defaultCamerasForPlan({ userSubscriptionType: { [TRIAL]: "x" } });
    expect(cameras).toBe(5);
  });
});

describe("grantPlanDefaultCameras", () => {
  it("gives a trial client 5 cameras on first login", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    expect(await grantPlanDefaultCameras(admin, { [TRIAL]: "x" })).toBe(5);

    const fresh = await Admin.findById(admin._id).lean();
    expect(fresh.purchasedCameras).toBe(5);
    expect(fresh.planCamerasGranted).toBe(true);
  });

  it("gives a paying client with no cameras yet a flat default of 1", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    expect(await grantPlanDefaultCameras(admin, { [PRO]: "x" })).toBe(1);
    const fresh = await Admin.findById(admin._id).lean();
    expect(fresh.purchasedCameras).toBe(1);
    expect(fresh.planCamerasGranted).toBe(true);
  });

  it("gives a client with no recognisable plan the same flat default of 1", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    expect(await grantPlanDefaultCameras(admin, {})).toBe(1);
    expect((await Admin.findById(admin._id).lean()).purchasedCameras).toBe(1);
  });

  it("gives an existing client a licence matching the cameras already added", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    await makeCamera(admin.user_id);
    await makeCamera(admin.user_id);
    await makeCamera(admin.user_id);

    expect(await grantPlanDefaultCameras(admin, { [PRO]: "x" })).toBe(3);
    const fresh = await Admin.findById(admin._id).lean();
    expect(fresh.purchasedCameras).toBe(3);
    expect(fresh.planCamerasGranted).toBe(true);
  });

  it("cameras already added take priority over the free trial default", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    await makeCamera(admin.user_id);
    await makeCamera(admin.user_id);

    // 2 cameras added, but on the trial (worth 5) — added count wins because
    // this client is no longer "new".
    expect(await grantPlanDefaultCameras(admin, { [TRIAL]: "x" })).toBe(2);
    expect((await Admin.findById(admin._id).lean()).purchasedCameras).toBe(2);
  });

  it("backfills EVERY detection type at the granted count, not only ones already running", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    await makeCamera(admin.user_id, {
      vehicleDetectionSettings: { enabled: true },
    });
    await makeCamera(admin.user_id); // a second camera, nothing running on it

    expect(await grantPlanDefaultCameras(admin, { [PRO]: "x" })).toBe(2);

    const rows = await DetectionAllocation.find({ adminId: admin._id }).lean();
    expect(rows).toHaveLength(ALL_TYPES.length);
    for (const row of rows) {
      expect(row).toMatchObject({ enabled: true, cameraAllocation: 2 });
    }
    // A type that was never switched on anywhere still gets the full allowance
    // — whether it happens to be running is irrelevant to what this client, at
    // this camera count, is entitled to configure.
    const byType = Object.fromEntries(rows.map((r) => [r.settingType, r]));
    expect(byType.countPersonsSettings).toMatchObject({ enabled: true, cameraAllocation: 2 });
  });

  it("backfills every type for a brand-new client too, at their starting allowance", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    expect(await grantPlanDefaultCameras(admin, { [TRIAL]: "x" })).toBe(5);

    const rows = await DetectionAllocation.find({ adminId: admin._id }).lean();
    expect(rows).toHaveLength(ALL_TYPES.length);
    expect(rows.every((r) => r.enabled === true && r.cameraAllocation === 5)).toBe(true);
  });

  it("does not overwrite an allocation row that already exists", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    await makeCamera(admin.user_id, {
      vehicleDetectionSettings: { enabled: true },
    });
    await DetectionAllocation.create({
      adminId: admin._id,
      settingType: "vehicleDetectionSettings",
      enabled: false,
      cameraAllocation: 0,
    });

    await grantPlanDefaultCameras(admin, { [PRO]: "x" });

    const row = await DetectionAllocation.findOne({
      adminId: admin._id,
      settingType: "vehicleDetectionSettings",
    }).lean();
    expect(row).toMatchObject({ enabled: false, cameraAllocation: 0 });
    // Every OTHER type is still backfilled — the pre-existing row is the only
    // one left untouched.
    const total = await DetectionAllocation.countDocuments({ adminId: admin._id });
    expect(total).toBe(ALL_TYPES.length);
  });

  it("pushes the grant live to any client already connected over the socket", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    await grantPlanDefaultCameras(admin, { [TRIAL]: "x" });

    expect(redis.publish).toHaveBeenCalledWith(
      "detectionAllocation:update",
      expect.stringContaining(`"adminId":"${admin._id}"`),
    );
    const [, payload] = redis.publish.mock.calls.find(
      ([channel]) => channel === "detectionAllocation:update",
    );
    expect(JSON.parse(payload)).toMatchObject({
      adminId: String(admin._id),
      userId: admin.user_id,
      enabled: true,
    });
  });

  it("does not publish when nothing was granted (already licensed)", async () => {
    const admin = await makeAdmin({ purchasedCameras: 20 });
    await grantPlanDefaultCameras(admin, { [TRIAL]: "x" });
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it("never overwrites a licence the superadmin already set", async () => {
    const admin = await makeAdmin({ purchasedCameras: 20 });
    expect(await grantPlanDefaultCameras(admin, { [TRIAL]: "x" })).toBe(20);
    expect((await Admin.findById(admin._id).lean()).purchasedCameras).toBe(20);
  });

  it("a client the superadmin blocked at 0 from the start is never defaulted", async () => {
    // Distinct from "granted then blocked" below: this is a client the
    // superadmin's updatePurchasedCameras set to 0 (planCamerasGranted: true)
    // BEFORE any grant ever ran — e.g. a brand-new signup blocked immediately.
    // A bare purchasedCameras: 0 alone cannot tell that apart from "never
    // configured"; planCamerasGranted is what makes the block stick even
    // though this client has cameras added that would otherwise earn a
    // non-zero default.
    const admin = await makeAdmin({ purchasedCameras: 0, planCamerasGranted: true });
    await makeCamera(admin.user_id);
    await makeCamera(admin.user_id);

    expect(await grantPlanDefaultCameras(admin, { [TRIAL]: "x" })).toBe(0);
    expect((await Admin.findById(admin._id).lean()).purchasedCameras).toBe(0);
    expect(await DetectionAllocation.countDocuments({ adminId: admin._id })).toBe(0);
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it("is one-time: a superadmin blocking a trial client at 0 sticks", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    await grantPlanDefaultCameras(admin, { [TRIAL]: "x" });

    // Superadmin deliberately blocks them.
    await Admin.updateOne({ _id: admin._id }, { $set: { purchasedCameras: 0 } });

    const reloaded = await Admin.findById(admin._id).lean();
    expect(await grantPlanDefaultCameras(reloaded, { [TRIAL]: "x" })).toBe(0);
    expect((await Admin.findById(admin._id).lean()).purchasedCameras).toBe(0);
  });

  it("never throws — a login must not fail because of this", async () => {
    await expect(grantPlanDefaultCameras(null, { [TRIAL]: "x" })).resolves.toBe(0);
    await expect(grantPlanDefaultCameras({ _id: undefined }, undefined)).resolves.toBe(0);
  });
});

describe("reconcileAddedCameraLicenses — boot-time fix for clients already deployed at 0", () => {
  it("grants a licence matching cameras already added, without waiting for login", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    await makeCamera(admin.user_id);
    await makeCamera(admin.user_id);

    const result = await reconcileAddedCameraLicenses();
    expect(result).toMatchObject({ scanned: 1, granted: 1 });

    const fresh = await Admin.findById(admin._id).lean();
    expect(fresh.purchasedCameras).toBe(2);
    expect(fresh.planCamerasGranted).toBe(true);
    expect(
      await DetectionAllocation.countDocuments({ adminId: admin._id }),
    ).toBe(ALL_TYPES.length);
    // The whole point: it happens now, and is pushed live, not deferred to login.
    expect(redis.publish).toHaveBeenCalled();
  });

  it("leaves a client with no cameras yet for the login path — no plan info to resolve here", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });

    const result = await reconcileAddedCameraLicenses();
    expect(result).toMatchObject({ scanned: 1, granted: 0 });

    const fresh = await Admin.findById(admin._id).lean();
    expect(fresh.purchasedCameras).toBe(0);
    expect(fresh.planCamerasGranted).toBeFalsy();
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it("skips a client already granted or already licensed by the superadmin", async () => {
    const granted = await makeAdmin({
      login: "granted", email: "granted@test.com", purchasedCameras: 0, planCamerasGranted: true,
    });
    const licensed = await makeAdmin({
      login: "licensed", email: "licensed@test.com", user_id: "9999", purchasedCameras: 7,
    });
    await makeCamera(granted.user_id);
    await makeCamera(licensed.user_id);

    const result = await reconcileAddedCameraLicenses();
    expect(result.granted).toBe(0);

    expect((await Admin.findById(granted._id).lean()).purchasedCameras).toBe(0);
    expect((await Admin.findById(licensed._id).lean()).purchasedCameras).toBe(7);
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it("is a no-op when there is nothing to reconcile", async () => {
    await expect(reconcileAddedCameraLicenses()).resolves.toMatchObject({ scanned: 0, granted: 0 });
  });
});
