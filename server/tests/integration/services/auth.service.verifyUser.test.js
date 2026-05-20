/**
 * Auth.verifyUser happy path — exercises the long branch from aMember
 * login → register admin → create-collection → role/permission seed →
 * dashboard config → token issuance.
 *
 * `fetch` is stubbed globally; helperFunctions (autoSync / syncPermission
 * locations) are mocked to no-ops. Everything else runs against the real
 * in-memory MongoDB.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

vi.mock("../../../utils/helperFunctions.js", () => ({
  autoSyncLocations: vi.fn().mockResolvedValue(undefined),
  syncPermissionLocations: vi.fn().mockResolvedValue(undefined),
}));

const { default: AUTHService } = await import(
  "../../../core/v1/Auth/auth.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: permissionModel } = await import(
  "../../../core/v1/permission/permissions.model.js"
);
const { default: rolesModel } = await import(
  "../../../core/v1/roles/roles.model.js"
);
const { default: dashboardSidebarModel } = await import(
  "../../../core/v1/dashboard/dashboardSidebar.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  fetchMock.mockReset();
});

/** Build the standard set of (URL, response) handlers verifyUser drives. */
function wireFetchHappy({ subscriptions = { plan_main: "2099-12-31" } } = {}) {
  fetchMock.mockImplementation(async (url) => {
    if (url.includes("/check-access/by-login-pass")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          user_id: "42",
          login: "alice",
          email: "alice@test.com",
          name_f: "Alice",
          name_l: "A",
          subscriptions,
        }),
      };
    }
    if (url.includes("/create_collection")) {
      return { status: 201 };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function authCtx() {
  const ctx = serviceCtx({ body: { login: "alice", pass: "p" } });
  ctx.req.header = () => undefined;
  return ctx;
}

describe("AUTHService.verifyUser — happy path", () => {
  it("creates a new admin and returns a 200 with a JWT", async () => {
    wireFetchHappy();
    const { req, res } = authCtx();
    await AUTHService.verifyUser(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.ok).toBe(true);
    expect(typeof res._body.token).toBe("string");
    expect(res._body.user.user_email).toBe("alice@test.com");
    expect(res._body.user.login).toBe("alice");
    expect(res._body.user.created_from).toBe("EMP");

    // Admin row was created by registerAdminIfNotExists
    const admin = await Admin.findOne({ user_id: "42" });
    expect(admin).not.toBeNull();
    expect(admin.email).toBe("alice@test.com");
  });

  it("seeds the three preset roles + permissions for a new admin", async () => {
    wireFetchHappy();
    const { req, res } = authCtx();
    await AUTHService.verifyUser(req, res);
    expect(res.statusCode).toBe(200);

    const roles = await rolesModel.find({});
    const roleNames = roles.map((r) => r.roleName).sort();
    expect(roleNames).toEqual(["admin", "read", "write"]);

    const perms = await permissionModel.find({});
    expect(perms).toHaveLength(3);
    expect(perms.every((p) => p.is_default === true)).toBe(true);
  });

  it("creates a dashboardSidebar config for the new admin", async () => {
    wireFetchHappy();
    const { req, res } = authCtx();
    await AUTHService.verifyUser(req, res);
    expect(res.statusCode).toBe(200);

    const admin = await Admin.findOne({ user_id: "42" });
    const config = await dashboardSidebarModel.findOne({ adminId: admin._id });
    expect(config).not.toBeNull();
    expect(Array.isArray(config.detectionConfigs)).toBe(true);
  });

  // BUG: #40 — the plan-expired branch calls revokeDetectionService /
  // revokeAttendanceService, both of which reference `axios` without
  // importing it. On APP_ENV=local that throws and the outer catch
  // returns 500 instead of the 403 the branch was designed to send.
  // Once #40 lands, tighten to: expect 403 + body.expired === true.
  it("plan-expired path currently 500s (pinned until #40 is fixed)", async () => {
    wireFetchHappy({ subscriptions: { plan_main: "2000-01-01" } });
    const { req, res } = authCtx();
    await AUTHService.verifyUser(req, res);
    expect(res.statusCode).toBe(500);
    expect(res._body.error).toMatch(/axios is not defined/);
  });

  it("returns 403 with the upstream payload when aMember reports ok:false", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.includes("/check-access/by-login-pass")) {
        return {
          ok: true,
          json: async () => ({ ok: false, code: -1, msg: "Invalid login" }),
        };
      }
      return { status: 201 };
    });
    const { req, res } = authCtx();
    await AUTHService.verifyUser(req, res);
    expect(res.statusCode).toBe(403);
    expect(res._body.ok).toBe(false);
  });
});
