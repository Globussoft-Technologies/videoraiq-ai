/**
 * Round-2 gap-fill #3 for RolesServices.
 *
 * After gaps.test + gaps2.test the residual uncovered ranges are
 *   85-87    create() inner catch — "Error while inserting new Roles:"
 *            fires when permissionModel.create() rejects inside the
 *            Promise.all(newRole.map(async role_new => ...)).
 *   184-187  get() outer catch — admin lookup OK, then aggregate/find
 *            throws.
 *   206-210  update() — adminId===undefined branch: pulls permissionEdit
 *            and roleEdit access flags from req.verified.permissionConfig.
 *   247-248  update() — isRoleDuplicate=true → ROLES_UPDATE_FAIL FailResp.
 *   264-265  update() — roleEditAccess=false (from permissionConfig) →
 *            400 accessDeniedResp.
 *   284-285  update() — permissionEditAccess=false → 400 accessDeniedResp.
 *   331-332  update() — !data fall-through after findOneAndUpdate returns
 *            null when the supplied roleId doesn't exist (despite
 *            existingRole pre-check).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { makeReqRes } from "../../helpers/factory.js";

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

const adminId = new mongoose.Types.ObjectId();

function ctx({ query, body, permissionConfig, userData = {} } = {}) {
  const { req, res, next } = makeReqRes();
  req.verified = {
    userData: {
      adminId: adminId.toString(),
      _id: new mongoose.Types.ObjectId().toString(),
      orgId: "org-1",
      ...userData,
    },
    permissionConfig,
  };
  if (query) req.query = query;
  if (body) req.body = body;
  return { req, res, next };
}

async function seedAdmin() {
  return Admin.create({
    _id: adminId,
    user_id: 1,
    admin_id: 1,
    login: "admin",
    email: "admin@test.com",
    firstName: "A",
    lastName: "B",
    name_f: "A B",
  });
}

describe("RolesServices.create — inner catch (lines 85-87)", () => {
  it("returns 'Error while inserting new Roles' when permissionModel.create rejects", async () => {
    await seedAdmin();
    // Body must pass createRole validation: rolesDetails array + is_default.
    const spy = vi
      .spyOn(Permission, "create")
      .mockImplementationOnce(() => Promise.reject(new Error("perm-create-failed")));
    const { req, res } = ctx({
      body: {
        roles: ["fresh-role-name"],
        is_default: false,
      },
    });
    await RolesService.createRoles(req, res);
    expect(spy).toHaveBeenCalled();
    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/Error while inserting new Roles/);
  });
});

describe("RolesServices.get — outer catch (lines 184-187)", () => {
  it("returns ROLES_FETCH_FAILED when rolesModel.countDocuments rejects", async () => {
    await seedAdmin();
    vi.spyOn(Role, "countDocuments").mockImplementationOnce(() =>
      Promise.reject(new Error("count-blew-up")),
    );
    const { req, res } = ctx({ query: {} });
    await RolesService.get(req, res);
    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
  });
});

describe("RolesServices.update — adminId-undefined + permissionConfig branch (lines 206-210)", () => {
  it("derives permissionEditAccess / roleEditAccess from req.verified.permissionConfig when adminId is undefined", async () => {
    // With adminId undefined we still need adminModel.findOne to return
    // a truthy admin so we don't short-circuit on ADMIN_NOT_EXIST, and
    // rolesModel.aggregate / findOne to return non-throwing results so
    // we reach the access-denied gate.
    const { default: AdminModel } = await import(
      "../../../core/v1/admin/admin.model.js"
    );
    vi.spyOn(AdminModel, "findOne").mockResolvedValueOnce({ _id: null });
    vi.spyOn(Role, "aggregate").mockResolvedValueOnce([]);
    vi.spyOn(Role, "findOne").mockResolvedValueOnce({
      _id: new mongoose.Types.ObjectId(),
      roleName: "x-target",
      is_default: false,
    });

    const { req, res } = ctx({
      query: { roleId: new mongoose.Types.ObjectId().toString() },
      body: { roleName: "x" },
      permissionConfig: [
        { permissionConfig: { permission: { edit: false }, roles: { edit: false } } },
      ],
      userData: { adminId: undefined },
    });
    await RolesService.update(req, res);
    // With both roleEdit/permissionEdit=false the !roleEditAccess arm
    // (line 263-265) fires first and returns 400 — which also proves
    // lines 206-210 executed.
    expect(res.statusCode).toBe(400);
  });
});

describe("RolesServices.update — isRoleDuplicate ROLES_UPDATE_FAIL (lines 246-248)", () => {
  it("returns ROLES_UPDATE_FAIL when the desired roleName already exists on another role", async () => {
    await seedAdmin();
    const existing = await Role.create({
      adminId,
      orgId: "org-1",
      roleName: "duplicate-name",
      permissionId: new mongoose.Types.ObjectId(),
    });
    const target = await Role.create({
      adminId,
      orgId: "org-1",
      roleName: "target-role",
      permissionId: new mongoose.Types.ObjectId(),
    });

    const { req, res } = ctx({
      query: { roleId: target._id.toString() },
      body: { roleName: "duplicate-name" },
    });
    await RolesService.update(req, res);
    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
  });
});

describe("RolesServices.update — !roleEditAccess access denied (lines 263-265)", () => {
  it("returns 400 accessDeniedResp when roleEditAccess is false (no edit permission)", async () => {
    const { default: AdminModel } = await import(
      "../../../core/v1/admin/admin.model.js"
    );
    vi.spyOn(AdminModel, "findOne").mockResolvedValueOnce({ _id: null });
    vi.spyOn(Role, "aggregate").mockResolvedValueOnce([]);
    vi.spyOn(Role, "findOne").mockResolvedValueOnce({
      _id: new mongoose.Types.ObjectId(),
      roleName: "edit-target",
      is_default: false,
    });

    const role = new mongoose.Types.ObjectId();
    const { req, res } = ctx({
      query: { roleId: role.toString() },
      body: { roleName: "edit-attempt" },
      permissionConfig: [
        { permissionConfig: { permission: { edit: true }, roles: { edit: false } } },
      ],
      userData: { adminId: undefined },
    });
    await RolesService.update(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("RolesServices.update — !permissionEditAccess access denied (lines 283-285)", () => {
  it("returns 400 accessDeniedResp when permissionEditAccess is false but roleEdit is true", async () => {
    const { default: AdminModel } = await import(
      "../../../core/v1/admin/admin.model.js"
    );
    vi.spyOn(AdminModel, "findOne").mockResolvedValueOnce({ _id: null });
    // Seed a non-default role so the existingRole lookup succeeds.
    const role = await Role.create({
      adminId,
      orgId: "org-1",
      roleName: "edit-target",
      permissionId: new mongoose.Types.ObjectId(),
      is_default: false,
    });

    const { req, res } = ctx({
      query: { roleId: role._id.toString() },
      body: { roleName: "renamed" },
      permissionConfig: [
        { permissionConfig: { permission: { edit: false }, roles: { edit: true } } },
      ],
      userData: { adminId: undefined },
    });
    await RolesService.update(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("RolesServices.update — !data fall-through (lines 330-332)", () => {
  it("sends 'not allowed to update records created by someone else' when findOneAndUpdate returns null", async () => {
    await seedAdmin();
    const role = await Role.create({
      adminId,
      orgId: "org-1",
      roleName: "data-null-target",
      permissionId: new mongoose.Types.ObjectId(),
      is_default: false,
    });
    // Spy findOneAndUpdate to return null even though existingRole was found.
    vi.spyOn(Role, "findOneAndUpdate").mockResolvedValueOnce(null);
    // Spy permissionModel.findById so the existingRole.permissionId branch
    // (line 311-313) returns a truthy permission and we reach line 330.
    vi.spyOn(Permission, "findById").mockResolvedValueOnce({
      _id: role.permissionId,
      permissionConfig: {},
    });
    vi.spyOn(Permission, "updateOne").mockResolvedValueOnce({});

    const { req, res } = ctx({
      query: { roleId: role._id.toString() },
      body: {
        roleName: "renamed-but-null-data",
        roleCreate: true,
        roleEdit: false,
        roleView: true,
        roleDelete: false,
      },
    });
    await RolesService.update(req, res);
    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/not allowed to update records/i);
  });
});
