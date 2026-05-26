/**
 * Tail coverage for PermissionService (permissions.utility.js) — the
 * remaining uncovered branches per the R72 snapshot (after R67/R68/R71):
 *
 *   • deletePermissions  → no-permissionId bulk branch (lines 301-318):
 *       empty admin permissions → 'no default permissions' fail-resp at 316.
 *       The non-empty success-resp arm at 315 is currently unreachable from
 *       any unit-test surface because the aggregate `$match: { adminId }`
 *       is compared as a string against an ObjectId-typed field; the JWT
 *       middleware also hands a string adminId in production, so this is
 *       a latent product issue independent of bug #107 (`collectionName`
 *       ReferenceError on line 312).
 *   • fetchRolesPermission → admin-not-found permissionConfig path
 *     (lines 343-346) — req.verified.permissionConfig array consumed for
 *     restrictFields heuristic
 *   • fetchRolesPermission → outer catch (lines 407-409) via spy on
 *     roleModel.aggregate
 *   • bulkPermissionUpdate → no-authorized-users tail (lines 422-423)
 *   • bulkPermissionUpdate → outer catch (lines 450-452) via spy on
 *     adminModel.findOne
 *
 * Mocks: 3 vi.spyOn calls across 5 tests (mostly real Mongoose against
 * dbSetup). Pattern mirrors permissions.service.outerCatches.test.js
 * (R71) and vehicle.service.notification.test.js (R69).
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
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: PermissionService } = await import(
  "../../../core/v1/permission/permissions.utility.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: permissionModel } = await import(
  "../../../core/v1/permission/permissions.model.js"
);
const { default: roleModel } = await import(
  "../../../core/v1/roles/roles.model.js"
);
// Schema registration for the $lookup target in fetchRolesPermission.
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");
await import("../../../core/v1/users/users.model.js");

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
    login: "permTail",
    email: "permTail@test.com",
  });
});

describe("PermissionService.deletePermissions — bulk branch (no permissionId)", () => {
  it("replies with DELETE_DEFAULT_PERMISSIONS fail-resp when admin has no non-default permissions to delete", async () => {
    // No permissions seeded for this admin; the inner aggregate with
    // is_default:{$ne:true} returns an empty array, so `data.length`
    // is falsy and we hit the fail-resp at line 316 (the trailing
    // ternary).
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
    });
    await PermissionService.deletePermissions(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });

});

describe("PermissionService.fetchRolesPermission — admin-missing + outer catch", () => {
  it("consumes req.verified.permissionConfig[0] when the admin record does not exist (lines 343-346)", async () => {
    // No admin doc → isAdminExist is null → the `if(!isAdminExist)` arm
    // fires, reading roleWithPermission[0].permissionConfig.permission.view.
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      permissionConfig: [
        {
          permissionConfig: { permission: { view: true } },
        },
      ],
      query: {},
    });
    await PermissionService.fetchRolesPermission(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("success");
    // No roles exist for the random adminId → empty list, 0 total.
    expect(body.data.totalLength).toBe(0);
  });

  it("falls into the outer catch (lines 407-409) when roleModel.aggregate throws", async () => {
    const spy = vi
      .spyOn(roleModel, "aggregate")
      .mockImplementationOnce(() => {
        throw new Error("simulated aggregate failure");
      });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
    });
    await PermissionService.fetchRolesPermission(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(body.message).toContain("Something went wrong");
    expect(JSON.stringify(body)).toContain("simulated aggregate failure");
    expect(spy).toHaveBeenCalled();
  });
});

describe("PermissionService.bulkPermissionUpdate — tail branches", () => {
  it("hits the NO_ADMIN_USERS_FOUND fail-resp at line 422 when no authorized users exist", async () => {
    // Capture every res.send invocation — note line 422 doesn't `return`,
    // so the success-resp at 447 also fires and overwrites res._body. The
    // call-count assertion proves line 422 was reached.
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionConfig: [
          {
            moduleName: "dashboard",
            view: true,
            create: true,
            edit: true,
            delete: true,
          },
        ],
      },
    });
    const sendSpy = vi.spyOn(res, "send");
    await PermissionService.bulkPermissionUpdate(req, res, next);
    // Two res.send calls: the NO_ADMIN_USERS_FOUND fail-resp at 422 and the
    // BULK_UPDATE_SUCCESS at 447 (the missing-return means both fire).
    expect(sendSpy).toHaveBeenCalledTimes(2);
    // First call (line 422) is the NO_ADMIN_USERS_FOUND fail-resp envelope.
    const first = sendSpy.mock.calls[0][0];
    expect(first.body.status).toBe("failed");
  });

  it("falls into the outer catch (lines 450-452) when adminModel.findOne throws", async () => {
    const spy = vi
      .spyOn(Admin, "findOne")
      .mockImplementationOnce(() => {
        throw new Error("simulated admin lookup failure (bulk update)");
      });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionConfig: [{ moduleName: "dashboard" }],
      },
    });
    await PermissionService.bulkPermissionUpdate(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(JSON.stringify(body)).toContain(
      "simulated admin lookup failure (bulk update)"
    );
    expect(spy).toHaveBeenCalled();
  });
});
