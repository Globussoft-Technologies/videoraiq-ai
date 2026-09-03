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
const { defaultCamerasForPlan, grantPlanDefaultCameras } = await import(
  "../../../core/v2/clientConfig/detectionLicense.service.js"
);
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");

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
  await clearCollections();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Jump past the product cache window so each test fetches fresh.
  vi.setSystemTime(Date.now() + 60 * 60 * 1000);
  mockProducts();
});

const makeAdmin = (over = {}) =>
  Admin.create({ user_id: "4242", login: "t", email: "t@test.com", ...over });

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

  it("does not touch a paying client", async () => {
    const admin = await makeAdmin({ purchasedCameras: 0 });
    expect(await grantPlanDefaultCameras(admin, { [PRO]: "x" })).toBe(0);
    expect((await Admin.findById(admin._id).lean()).purchasedCameras).toBe(0);
  });

  it("never overwrites a licence the superadmin already set", async () => {
    const admin = await makeAdmin({ purchasedCameras: 20 });
    expect(await grantPlanDefaultCameras(admin, { [TRIAL]: "x" })).toBe(20);
    expect((await Admin.findById(admin._id).lean()).purchasedCameras).toBe(20);
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
