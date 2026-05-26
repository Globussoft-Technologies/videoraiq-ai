/**
 * Tail coverage for PermissionService (permissions.utility.js) — the two
 * outer catch blocks that were the final uncovered lines per R71 snapshot:
 *
 *   • userPermissions  → lines 559-561 (FETCH_ERROR fallback)
 *   • updateAdminPermissions → lines 653-655 (generic error path)
 *
 * Both are reached by spying on the first model call inside the try block
 * and throwing. No external transports involved; pure-Mongo + 1 spy per
 * test. Total ≤ 4 mocks (2 spies + restored). Mirrors the spy pattern used
 * by vehicle.service.notification.test.js (R69) and roles.service.extras
 * (R68) for outer-catch reach.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: PermissionService } = await import(
  "../../../core/v1/permission/permissions.utility.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: usersModel } = await import(
  "../../../core/v1/users/users.model.js"
);
const { default: permissionModel } = await import(
  "../../../core/v1/permission/permissions.model.js"
);
// Ensure schemas are registered (roles aggregate is invoked from
// userPermissions even though we throw before reaching it).
await import("../../../core/v1/roles/roles.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");

let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.restoreAllMocks();
  admin = await Admin.create({
    user_id: "1",
    login: "permOuter",
    email: "permOuter@test.com",
  });
});

describe("PermissionService.userPermissions — outer catch (559-561)", () => {
  it("falls into the catch and replies FETCH_ERROR when usersModel.findOne throws (memberId branch)", async () => {
    const spy = vi
      .spyOn(usersModel, "findOne")
      .mockImplementationOnce(() => {
        throw new Error("simulated user lookup failure");
      });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      memberId: "anything-here",
    });
    await PermissionService.userPermissions(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
    // error.message surfaces through the FailResp envelope
    expect(JSON.stringify(body)).toContain("simulated user lookup failure");
    expect(spy).toHaveBeenCalled();
  });

  it("falls into the catch when adminModel.findOne throws on the no-memberId branch", async () => {
    const spy = vi
      .spyOn(Admin, "findOne")
      .mockImplementationOnce(() => {
        throw new Error("simulated admin lookup failure");
      });
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await PermissionService.userPermissions(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(JSON.stringify(body)).toContain("simulated admin lookup failure");
    expect(spy).toHaveBeenCalled();
  });
});

describe("PermissionService.updateAdminPermissions — outer catch (653-655)", () => {
  it("falls into the catch and replies 'Error while updating admin permissions' when permissionModel.find throws", async () => {
    // Admin lookup must succeed so we get past the early-return guards
    // and reach the permissionModel.find call inside the inner loop.
    const spy = vi
      .spyOn(permissionModel, "find")
      .mockImplementationOnce(() => {
        throw new Error("simulated permission read failure");
      });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionConfig: {
          dashboard: { view: false },
        },
      },
    });
    await PermissionService.updateAdminPermissions(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(body.message).toContain("Error while updating admin permissions");
    expect(JSON.stringify(body)).toContain("simulated permission read failure");
    expect(spy).toHaveBeenCalled();
  });
});

describe("PermissionService.bulkPermissionDelete — tail branches", () => {
  it("replies PERMISSION_CONFIG_DELETE_UNSUCCESSFUL when updateMany modifies 0 docs (lines 502-503)", async () => {
    // Seed a permission whose config already contains `dashboard`, so the
    // missingModules guard passes, but stub updateMany to return
    // modifiedCount: 0 to hit the else-branch reply.
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "bulkDelTail",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });
    const spy = vi
      .spyOn(permissionModel, "updateMany")
      .mockResolvedValueOnce({ modifiedCount: 0 });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionConfig: [{ moduleName: "dashboard" }],
      },
    });
    await PermissionService.bulkPermissionDelete(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
    // Translator key surfaces as the message.
    expect(typeof body.message).toBe("string");
    expect(spy).toHaveBeenCalled();
  });

  it("falls into the outer catch when permissionModel.findOne throws (lines 506-508)", async () => {
    // admin lookup succeeds; force findOne (the admin permission read) to
    // throw so we land in the catch with PERMISSION_CONFIG_DELETE_ERROR.
    const spy = vi
      .spyOn(permissionModel, "findOne")
      .mockImplementationOnce(() => {
        throw new Error("simulated bulkDelete read failure");
      });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionConfig: [{ moduleName: "dashboard" }],
      },
    });
    await PermissionService.bulkPermissionDelete(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(JSON.stringify(body)).toContain("simulated bulkDelete read failure");
    expect(spy).toHaveBeenCalled();
  });
});
