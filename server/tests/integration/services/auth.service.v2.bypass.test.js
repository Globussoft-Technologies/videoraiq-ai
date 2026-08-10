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
});
