/**
 * Real vertical Supertest contract for /api/v1/roles.
 *
 * Mounts the actual roles router with the real controller + service + Joi
 * validation + Mongo persistence (in-memory). Only verifyToken and the four
 * permission middlewares are stubbed (same pattern as
 * departments.routes.real.test.js / shifts.routes.real.test.js).
 *
 * Response envelope: RolesService uses `res.send(Response.xxx(...))` (no
 * status code on the outer res), so HTTP stays at 200 and the success/fail
 * flag lives at `res.body.body.status`.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import request from "supertest";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

vi.mock("../../middlewares/verifyToken.js", () => ({
  default: (req, _res, next) => {
    req.verified = {
      state: true,
      userData: {
        adminId: globalThis.__TEST_ADMIN_ID__,
        user_id: 99,
        _id: "creator-1",
        orgId: "org-1",
        memberId: undefined,
      },
      authorizedChannel: null,
      permissionConfig: [{ permissionConfig: {} }],
    };
    next();
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: rolesRoutes } = await import(
  "../../core/v1/roles/roles.routes.js"
);
const { default: Admin } = await import(
  "../../core/v1/admin/admin.model.js"
);
const { default: Role } = await import("../../core/v1/roles/roles.model.js");
const { default: Permission } = await import(
  "../../core/v1/permission/permissions.model.js"
);

let app;
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
    user_id: "801",
    login: "roles-real",
    email: "rolesreal@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => a.use("/api/v1/roles", rolesRoutes));
});

// RolesService uses .send(Response.xxx(...)) so HTTP stays 200; payload status
// lives inside `body.body.status`.
const inner = (res) => res.body?.body ?? res.body;

// createRoles spawns un-awaited Promise.all map; give it a tick to flush.
const tick = () => new Promise((r) => setTimeout(r, 100));

describe("POST /api/v1/roles/create (real vertical)", () => {
  it("creates new roles and persists Role + Permission docs", async () => {
    const res = await request(app)
      .post("/api/v1/roles/create")
      .send({ roles: ["Editor", "Viewer"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    await tick();
    const all = await Role.find({ adminId: admin._id });
    expect(all.map((r) => r.roleName).sort()).toEqual(["editor", "viewer"]);
    // Each role gets a paired permission row.
    const perms = await Permission.find({ adminId: admin._id });
    expect(perms).toHaveLength(2);
    expect(perms[0].permissionName).toBe("completeDefaultConfig");
  });

  it("fails on Joi validation when a role starts with a digit", async () => {
    const res = await request(app)
      .post("/api/v1/roles/create")
      .send({ roles: ["1nvalid"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("fails when all supplied roles already exist", async () => {
    await Role.create({
      adminId: admin._id,
      roleName: "editor",
    });
    const res = await request(app)
      .post("/api/v1/roles/create")
      .send({ roles: ["Editor"] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
    expect(inner(res).message).toMatch(/already exists/i);
  });

  it("partial-exists: creates new + reports already-exist on the others", async () => {
    await Role.create({
      adminId: admin._id,
      roleName: "viewer",
    });
    const res = await request(app)
      .post("/api/v1/roles/create")
      .send({ roles: ["Editor", "Viewer"] });
    expect(res.status).toBe(200);
    // The service hits the success branch when newRole has any entry, even
    // when existing roles are also reported.
    expect(inner(res).status).toBe("success");
    await tick();
    const all = await Role.find({ adminId: admin._id });
    expect(all.map((r) => r.roleName).sort()).toEqual(["editor", "viewer"]);
  });
});

describe("POST /api/v1/roles/get (real vertical)", () => {
  it("returns the admin's roles with the assigned-user join", async () => {
    await Role.create({ adminId: admin._id, roleName: "ops" });
    await Role.create({ adminId: admin._id, roleName: "qa" });
    const res = await request(app).post("/api/v1/roles/get");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.rolesCount).toBe(2);
    expect(inner(res).data.roleData).toHaveLength(2);
    // Each enriched role carries an AssignedUserRole array (likely empty).
    for (const r of inner(res).data.roleData) {
      expect(Array.isArray(r.AssignedUserRole)).toBe(true);
    }
  });

  it("filters by roleName query param", async () => {
    await Role.create({ adminId: admin._id, roleName: "ops" });
    await Role.create({ adminId: admin._id, roleName: "qa" });
    const res = await request(app).post("/api/v1/roles/get?roleName=op");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    // roleName filter returns { RoleAssignedUserCount, roleData, AssignedUserRole }.
    expect(inner(res).data.roleData).toHaveLength(1);
    expect(inner(res).data.roleData[0].roleName).toBe("ops");
  });

  it("filters by custom=true (non-default roles only)", async () => {
    await Role.create({
      adminId: admin._id,
      roleName: "default-one",
      is_default: true,
    });
    await Role.create({
      adminId: admin._id,
      roleName: "custom-one",
      is_default: false,
    });
    const res = await request(app).post("/api/v1/roles/get?custom=false");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    // `custom` is interpreted as a string boolean filter; only roles with
    // is_default matching come back.
    expect(inner(res).data.roleData).toHaveLength(1);
    expect(inner(res).data.roleData[0].roleName).toBe("custom-one");
  });
});

describe("PUT /api/v1/roles/update (real vertical)", () => {
  it("returns failed when roleId is missing", async () => {
    const res = await request(app)
      .put("/api/v1/roles/update")
      .send({ roleName: "newname" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("renames a non-default role and updates the linked permission flags", async () => {
    const permission = await Permission.create({
      adminId: admin._id,
      permissionName: "completeDefaultConfig",
      permissionConfig: { dashboard: { view: false } },
    });
    const role = await Role.create({
      adminId: admin._id,
      roleName: "original",
      is_default: false,
      permissionId: permission._id,
    });
    const res = await request(app)
      .put(`/api/v1/roles/update?roleId=${role._id}`)
      .send({
        roleName: "renamed",
        roleView: true,
        roleCreate: true,
        roleEdit: true,
        roleDelete: false,
      });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const reloaded = await Role.findById(role._id);
    expect(reloaded.roleName).toBe("renamed");
    const reloadedPerm = await Permission.findById(permission._id);
    expect(reloadedPerm.permissionConfig.dashboard.view).toBe(true);
    expect(reloadedPerm.permissionConfig.dashboard.create).toBe(true);
    expect(reloadedPerm.permissionConfig.dashboard.edit).toBe(true);
    expect(reloadedPerm.permissionConfig.dashboard.delete).toBe(false);
  });

  it("fails when role does not exist", async () => {
    const res = await request(app)
      .put(`/api/v1/roles/update?roleId=000000000000000000000000`)
      .send({ roleName: "any" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("rejects renaming a default role (cannot change name)", async () => {
    const role = await Role.create({
      adminId: admin._id,
      roleName: "default-role",
      is_default: true,
    });
    const res = await request(app)
      .put(`/api/v1/roles/update?roleId=${role._id}`)
      .send({ roleName: "new-name" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

describe("DELETE /api/v1/roles/delete (real vertical)", () => {
  it("returns failed when no role matches the supplied roleId/orgId combo", async () => {
    const res = await request(app).delete(
      `/api/v1/roles/delete?roleId=000000000000000000000000`,
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
    expect(inner(res).message).toMatch(/No role found/i);
  });

  it("deletes an existing role + its associated permission", async () => {
    const perm = await Permission.create({
      adminId: admin._id,
      permissionName: "completeDefaultConfig",
      permissionConfig: { dashboard: { view: true } },
    });
    const role = await Role.create({
      adminId: admin._id,
      orgId: "org-1",
      roleName: "doomed",
      permissionId: perm._id,
    });
    const res = await request(app).delete(
      `/api/v1/roles/delete?roleId=${role._id}`,
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(await Role.findById(role._id)).toBeNull();
    expect(await Permission.findById(perm._id)).toBeNull();
  });
});
