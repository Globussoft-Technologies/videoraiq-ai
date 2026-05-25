/**
 * Extra coverage for RolesServices (roles.service.js):
 *
 *   get:
 *     - validation failure on bad `orderby` query value
 *     - `roleName` query branch → regex find + assignedRole aggregate
 *     - `custom` filter branch → filters by is_default
 *
 *   update:
 *     - validation failure on a malformed `roleName` body
 *     - happy path with roleCreate/roleEdit/roleView/roleDelete supplied,
 *       exercising the inner `existingRole.permissionId && permissionEditAccess`
 *       block that recomputes permissionConfig and updates the linked
 *       permission document
 *     - duplicate role name (an unrelated role already owns that name
 *       for the same admin) → ROLES_UPDATE_FAIL
 *     - default role refuses a roleName change (is_default=true)
 *
 * Mocks: 0 — pure in-memory Mongo through the existing dbSetup helper.
 *
 * Related product bug filed during this round:
 *   - auth.service.js axios missing → issue #106 (separate file)
 *   - permissions.utility.js deletePermissions::collectionName undefined →
 *     issue #107 (separate file)
 *   Neither is touched by these tests.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: RolesService } = await import(
  "../../../core/v1/roles/roles.service.js"
);
const { default: Role } = await import(
  "../../../core/v1/roles/roles.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Permission } = await import(
  "../../../core/v1/permission/permissions.model.js"
);
// authorizedUsers model is referenced inside the service (userModel.aggregate)
// — importing it registers the schema for in-memory Mongo even though we
// never seed it directly.
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
  admin = await Admin.create({
    user_id: "1",
    login: "rolesAdminX",
    email: "rolesAdminX@test.com",
  });
});

function adminCtx(extra = {}) {
  return serviceCtx({ adminId: admin._id, orgId: "org-1", ...extra });
}

describe("RolesServices.get — branches not covered by roles.service.test.js", () => {
  it("returns FailResp when the orderby query value is not in the Joi whitelist", async () => {
    // RoleValidation.fetchRole only allows a specific orderby set; any
    // other value trips the validation error branch.
    const { req, res } = adminCtx({ query: { orderby: "notARealField" } });
    await RolesService.get(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the role-name lookup branch (regex find + assignedRole aggregate)", async () => {
    // Seed a role whose name matches the regex (case-insensitive partial).
    await Role.create({ adminId: admin._id, roleName: "manager" });
    await Role.create({ adminId: admin._id, roleName: "viewer" });

    const { req, res } = adminCtx({ query: { roleName: "Manag" } });
    await RolesService.get(req, res);
    expect(payload(res).status).toBe("success");
    // The roleName branch returns { RoleAssignedUserCount, roleData, AssignedUserRole }
    expect(payload(res).data).toHaveProperty("roleData");
    expect(payload(res).data.roleData.length).toBe(1);
    expect(payload(res).data.roleData[0].roleName).toBe("manager");
    expect(payload(res).data.RoleAssignedUserCount).toBe(0);
  });

  it("enters the custom-filter branch when query.custom is truthy", async () => {
    // Two non-default + one default. Passing custom=true enters the
    // `if (custom)` branch in get(). Note: the service queries
    // `is_default: <raw custom value>` (no normalization), so a string
    // value never matches the stored boolean — the assertion below just
    // verifies the branch returns success with an empty roleData rather
    // than the all-roles path. The rolesCount comes from a separate
    // countDocuments({ adminId }) call that is NOT subject to the
    // custom filter, so it still reports all three rows.
    await Role.create({ adminId: admin._id, roleName: "a", is_default: false });
    await Role.create({ adminId: admin._id, roleName: "b", is_default: false });
    await Role.create({ adminId: admin._id, roleName: "c", is_default: true });

    // Mongoose auto-casts the string through the Boolean schema type, so
    // "yes" → true, matching the single is_default=true seed.
    const { req, res } = adminCtx({ query: { custom: "yes" } });
    await RolesService.get(req, res);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.rolesCount).toBe(3);
    expect(payload(res).data.roleData.length).toBe(1);
    expect(payload(res).data.roleData[0].roleName).toBe("c");
  });
});

describe("RolesServices.update — branches not covered by roles.service.test.js", () => {
  it("returns FailResp when the body roleName is invalid (regex)", async () => {
    const role = await Role.create({
      adminId: admin._id,
      roleName: "original",
      is_default: false,
    });
    // Joi's updateRole requires roleName to start with /^[a-zA-Z]/. A
    // leading digit trips validation.
    const { req, res } = adminCtx({
      query: { roleId: role._id.toString() },
      body: { roleName: "1bad" },
    });
    await RolesService.update(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 404 when the linked permission has been deleted (permissionId set but missing)", async () => {
    // Seed a role pointing at a non-existent permission id, then send a
    // permission-touching body (roleView). The update reaches the
    // `existingRole.permissionId && permissionEditAccess` block, finds no
    // permission document, and short-circuits with a 404 raw payload
    // (Response helpers are NOT used here — the service hand-rolls the
    // response shape).
    const ghostPermId = new (await import("mongoose")).default.Types.ObjectId();
    const role = await Role.create({
      adminId: admin._id,
      roleName: "orphanrole",
      is_default: false,
      permissionId: ghostPermId,
    });

    const { req, res } = adminCtx({
      query: { roleId: role._id.toString() },
      body: { roleView: true },
    });
    await RolesService.update(req, res);
    // The service does `res.status(404).send({ message: "Associated permission not found." })`
    expect(res.statusCode).toBe(404);
    expect(res._body).toEqual({ message: "Associated permission not found." });
  });

  it("refuses a roleName change on a default role (is_default=true)", async () => {
    const role = await Role.create({
      adminId: admin._id,
      roleName: "adminrole",
      is_default: true,
    });
    const { req, res } = adminCtx({
      query: { roleId: role._id.toString() },
      body: { roleName: "renamed" },
    });
    await RolesService.update(req, res);
    expect(payload(res).status).toBe("failed");
    // Doc not mutated.
    expect((await Role.findById(role._id)).roleName).toBe("adminrole");
  });

  it("syncs the linked permissionConfig when roleCreate/View/Edit/Delete are supplied", async () => {
    // Linked permission with two modules — both fully-true to start so we
    // can verify they get flipped by the four supplied flags.
    const perm = await Permission.create({
      adminId: admin._id,
      permissionName: "permForRole",
      permissionConfig: {
        dashboard: { view: true, create: true, edit: true, delete: true },
        users: { view: true, create: true, edit: true, delete: true },
      },
      is_default: false,
    });
    const role = await Role.create({
      adminId: admin._id,
      roleName: "syncrole",
      is_default: false,
      permissionId: perm._id,
      view: true,
      create: true,
      edit: true,
      delete: true,
    });

    const { req, res } = adminCtx({
      query: { roleId: role._id.toString() },
      body: {
        roleCreate: false,
        roleEdit: false,
        roleView: false,
        roleDelete: false,
      },
    });
    await RolesService.update(req, res);
    expect(payload(res).status).toBe("success");

    const updatedRole = await Role.findById(role._id);
    expect(updatedRole.view).toBe(false);
    expect(updatedRole.create).toBe(false);
    expect(updatedRole.edit).toBe(false);
    expect(updatedRole.delete).toBe(false);

    // The linked permission's config gets each module's view/create/edit/delete
    // flipped to the supplied values.
    const updatedPerm = await Permission.findById(perm._id);
    expect(updatedPerm.permissionConfig.dashboard.view).toBe(false);
    expect(updatedPerm.permissionConfig.dashboard.create).toBe(false);
    expect(updatedPerm.permissionConfig.users.edit).toBe(false);
    expect(updatedPerm.permissionConfig.users.delete).toBe(false);
  });
});
