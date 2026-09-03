import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";

vi.mock("../../../utils/helperFunctions.js", () => ({
  autoSyncLocations: vi.fn().mockResolvedValue(undefined),
  syncPermissionLocations: vi.fn().mockResolvedValue(undefined),
  syncStevinrockLogPermissions: vi.fn().mockResolvedValue(undefined),
  syncAlertsAnalyticsPermissions: vi.fn().mockResolvedValue(undefined),
}));

const { default: AUTHService } = await import(
  "../../../core/v2/Auth/auth.service.js"
);
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");

beforeAll(async () => {
  await connectMongo();
});

afterAll(async () => {
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();
  vi.restoreAllMocks();
});

describe("v2 AUTHService bypass login", () => {
  it("does not wait for create_collection provisioning", async () => {
    vi.spyOn(AUTHService, "_getBypassUser").mockReturnValue({
      login: "onprem-bypass",
      pass: "secret",
      user_id: "99001",
      email: "onprem-bypass@test.com",
      name_f: "Onprem",
      name_l: "Bypass",
      expire: "2099-12-31T23:59:59.999Z",
    });

    const provisioning = vi
      .spyOn(AUTHService, "_createAdminCollectionWithRetries")
      .mockImplementation(() => new Promise(() => {}));

    const { req, res } = serviceCtx({
      body: { login: "onprem-bypass", pass: "secret" },
    });
    req.header = () => undefined;

    await AUTHService.verifyUser(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.ok).toBe(true);
    expect(res._body.user.login).toBe("onprem-bypass");
    expect(provisioning).toHaveBeenCalledOnce();
  });

  // Regression: v2's verifyUser is client_v2's actual login endpoint
  // (POST /auth/by-login-pass) and, unlike its v1 sibling and the other two
  // v2 login paths, was never wired up to grantPlanDefaultCameras — so a
  // brand-new user's first-ever token carried purchasedCameras: 0 and they
  // landed straight on the "No Camera License" screen with nothing to
  // recover from. No existing test caught this because the only test that
  // exercised v2 verifyUser end-to-end (above) never asserted on
  // purchasedCameras at all.
  it("grants a brand-new user's first token a default camera licence, not a stale 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no aMember in this test")));

    vi.spyOn(AUTHService, "_getBypassUser").mockReturnValue({
      login: "fresh-user",
      pass: "secret",
      user_id: "99002",
      email: "fresh-user@test.com",
      name_f: "Fresh",
      name_l: "User",
      expire: "2099-12-31T23:59:59.999Z",
    });
    vi.spyOn(AUTHService, "_createAdminCollectionWithRetries").mockResolvedValue(undefined);

    const { req, res } = serviceCtx({
      body: { login: "fresh-user", pass: "secret" },
    });
    req.header = () => undefined;

    await AUTHService.verifyUser(req, res);

    expect(res.statusCode).toBe(200);
    // No cameras added yet and no recognisable plan (bypass) — the flat
    // default of 1, not the 0 this user would previously have been stuck at.
    expect(res._body.user.purchasedCameras).toBe(1);

    const admin = await Admin.findOne({ user_id: "99002" }).lean();
    expect(admin.purchasedCameras).toBe(1);
    expect(admin.planCamerasGranted).toBe(true);

    vi.unstubAllGlobals();
  });
});
