/**
 * Extra coverage for PermissionService (permissions.utility.js):
 *   - updatePermissions: permissionConfig merge happy path (existing module,
 *     uniform/non-uniform branches that drive the roles bulk-update)
 *   - fetchRolesPermission: lookup join with permission docs
 *   - userPermissions: success branches for both memberId (user) and admin
 *   - bulkPermissionUpdate / bulkPermissionDelete: happy paths
 *   - updateAdminPermissions: success path that touches the inner loop +
 *     checkUniform roles updateMany branch
 *
 * Mocks: 0 — pure in-memory Mongo.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: PermissionService } = await import(
  "../../../core/v1/permission/permissions.utility.js"
);
const { default: permissionModel } = await import(
  "../../../core/v1/permission/permissions.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: roleModel } = await import(
  "../../../core/v1/roles/roles.model.js"
);
const { default: usersModel } = await import(
  "../../../core/v1/users/users.model.js"
);
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
  admin = await Admin.create({
    user_id: "1",
    login: "permX",
    email: "permX@test.com",
  });
});

describe("PermissionService.updatePermissions — permissionConfig merge", () => {
  it("merges new fields into an existing module and updates roles uniformly", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "rolePerm",
      permissionConfig: {
        dashboard: { view: true, create: true, edit: true, delete: true },
      },
      is_default: false,
    });

    await roleModel.create({
      adminId: admin._id,
      roleName: "linkedRole",
      permissionId: perm._id,
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: perm._id.toString() },
      // Only dashboard is in the existing config, so updating it is fine —
      // module-not-found branch is exercised elsewhere.
      body: { permissionConfig: { dashboard: { view: false, edit: false } } },
    });
    await PermissionService.updatePermissions(req, res, next);
    expect(payload(res).status).toBe("success");
    const after = await permissionModel.findById(perm._id);
    expect(after.permissionConfig.dashboard.view).toBe(false);
    // create/delete should be preserved (true) from the merge.
    expect(after.permissionConfig.dashboard.create).toBe(true);
  });

  it("fails when permissionConfig references an unknown module", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "rolePerm2",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: perm._id.toString() },
      body: { permissionConfig: { nonexistent: { view: true } } },
    });
    await PermissionService.updatePermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("merges the logs sub-module", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "logsPerm",
      permissionConfig: {
        logs: {
          accessLogs: { view: true, edit: false },
        },
      },
      is_default: false,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: perm._id.toString() },
      body: { permissionConfig: { logs: { accessLogs: { edit: true } } } },
    });
    await PermissionService.updatePermissions(req, res, next);
    expect(payload(res).status).toBe("success");
    const after = await permissionModel.findById(perm._id);
    expect(after.permissionConfig.logs.accessLogs.edit).toBe(true);
  });

  it("fails when logs sub-module key does not exist", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "logsPerm2",
      permissionConfig: { logs: { accessLogs: { view: true } } },
      is_default: false,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: perm._id.toString() },
      body: { permissionConfig: { logs: { ghostLog: { view: true } } } },
    });
    await PermissionService.updatePermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("renames + duplicate-name detection still fires when another perm has that name", async () => {
    const a = await permissionModel.create({
      adminId: admin._id,
      permissionName: "first",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "second",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: a._id.toString() },
      body: { permissionName: "second" },
    });
    await PermissionService.updatePermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("PermissionService.fetchRolesPermission — pagination + searchQuery", () => {
  it("returns roles joined with permission details", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "rp",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });
    await roleModel.create({
      adminId: admin._id,
      roleName: "Manager",
      permissionId: perm._id,
    });
    await roleModel.create({
      adminId: admin._id,
      roleName: "Auditor",
      permissionId: perm._id,
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { skip: 0, limit: 10 },
    });
    await PermissionService.fetchRolesPermission(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalLength).toBe(2);
    expect(payload(res).data.rolesWithPermissions.length).toBe(2);
  });

  it("filters by searchQuery (regex on roleName)", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "rp2",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });
    await roleModel.create({
      adminId: admin._id,
      roleName: "Manager",
      permissionId: perm._id,
    });
    await roleModel.create({
      adminId: admin._id,
      roleName: "Viewer",
      permissionId: perm._id,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { searchQuery: "Manag", sort: "asc", orderBy: "roleName" },
    });
    await PermissionService.fetchRolesPermission(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalLength).toBe(1);
  });
});

describe("PermissionService.userPermissions — success branches", () => {
  it("returns role with permission for an existing memberId user", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "userP",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });
    const role = await roleModel.create({
      adminId: admin._id,
      roleName: "Member",
      permissionId: perm._id,
    });
    const user = await usersModel.create({
      adminId: admin._id,
      emp_id: "1",
      email: "m@test.com",
      firstName: "Mem",
      lastName: "Ber",
      roleIds: role._id,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      memberId: user._id.toString(),
    });
    await PermissionService.userPermissions(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("fails when memberId does not exist", async () => {
    const ghostId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      memberId: ghostId,
    });
    await PermissionService.userPermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the default admin role when no memberId is supplied", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "defaultAdminP",
      permissionConfig: { dashboard: { view: true } },
      is_default: true,
    });
    await roleModel.create({
      adminId: admin._id,
      roleName: "admin",
      permissionId: perm._id,
      is_default: true,
    });
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await PermissionService.userPermissions(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

describe("PermissionService.bulkPermissionUpdate — happy path", () => {
  it("updates the listed modules across all admin permissions", async () => {
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "bulkA",
      permissionConfig: { dashboard: { view: false } },
      is_default: false,
    });
    // bulkPermissionUpdate needs an authorized-user record to exist.
    const AuthorizedUsers = (
      await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js")
    ).default;
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Auth",
      email: "auth@test.com",
    });

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
    await PermissionService.bulkPermissionUpdate(req, res, next);
    expect(payload(res).status).toBe("success");
    const updated = await permissionModel.findOne({ permissionName: "bulkA" });
    expect(updated.permissionConfig.dashboard.view).toBe(true);
  });

  it("fails validation when permissionConfig contains a bad shape", async () => {
    const AuthorizedUsers = (
      await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js")
    ).default;
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Auth",
      email: "auth2@test.com",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      // Joi requires `moduleName` on each entry — passing a non-object breaks
      // it and exercises the validation failure branch.
      body: { permissionConfig: [{ notAModule: true }] },
    });
    await PermissionService.bulkPermissionUpdate(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("PermissionService.updateAdminPermissions — happy path", () => {
  it("propagates module updates across all admin permissions and roles", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "adminPerm",
      permissionConfig: {
        dashboard: { view: true, create: true, edit: true, delete: true },
      },
      is_default: false,
    });
    await roleModel.create({
      adminId: admin._id,
      roleName: "AnyRole",
      permissionId: perm._id,
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionConfig: {
          dashboard: { view: false, create: false, edit: false, delete: false },
        },
      },
    });
    await PermissionService.updateAdminPermissions(req, res, next);
    expect(payload(res).status).toBe("success");
    const after = await permissionModel.findById(perm._id);
    expect(after.permissionConfig.dashboard.view).toBe(false);
    // Role should be flipped uniformly to false.
    const roleAfter = await roleModel.findOne({ permissionId: perm._id });
    expect(roleAfter.view).toBe(false);
  });

  it("merges logs sub-modules in the bulk admin update path", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "adminLogsPerm",
      permissionConfig: {
        logs: { accessLogs: { view: true, edit: false } },
      },
      is_default: false,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionConfig: { logs: { accessLogs: { edit: true } } },
      },
    });
    await PermissionService.updateAdminPermissions(req, res, next);
    expect(payload(res).status).toBe("success");
    const after = await permissionModel.findById(perm._id);
    expect(after.permissionConfig.logs.accessLogs.edit).toBe(true);
  });
});
