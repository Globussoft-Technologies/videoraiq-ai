/**
 * Real vertical Supertest contract for `/api/v1/permissions` — mounts the real
 * router on a fresh Express app and exercises the actual controller + service
 * (`permissions.utility.js`) + Mongo persistence. Targets
 * `permissions.controller.js` (0% covered).
 *
 * Mocks:
 *   1. middlewares/verifyToken.js          — attach admin to req.verified
 *   2. middlewares/permissionMiddleware.js — wave all CRUD verbs through
 *
 * Total: 2 mocks. Everything else (Mongo + Joi validation + permission
 * config merge logic) runs for real.
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
import mongoose from "mongoose";
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
        _id: globalThis.__TEST_USER_ID__,
        adminId: globalThis.__TEST_ADMIN_ID__,
        userName: "perm-admin",
        language: "en",
      },
      authorizedChannel: null,
      permissionConfig: [{ permissionConfig: { permission: { view: true } } }],
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
const { default: permissionRoutes } = await import(
  "../../core/v1/permission/permissions.route.js"
);
const { default: permissionModel } = await import(
  "../../core/v1/permission/permissions.model.js"
);
const { default: Admin } = await import("../../core/v1/admin/admin.model.js");
const { default: roleModel } = await import(
  "../../core/v1/roles/roles.model.js"
);
const { default: usersModel } = await import(
  "../../core/v1/users/users.model.js"
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
    user_id: "perm-real-1",
    login: "perm-real",
    email: "perm-real@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  globalThis.__TEST_USER_ID__ = admin._id.toString();
  app = buildApp((a) => a.use("/api/v1/permissions", permissionRoutes));
});

/** Response wrapper normalises `{ statusCode, body }` to body. */
const inner = (res) => res.body?.body ?? res.body;

// helpers --------------------------------------------------------------------
const buildPermissionConfig = (overrides = {}) => ({
  NVR: { view: true, create: false, edit: false, delete: false },
  channels: { view: true, create: false, edit: false, delete: false },
  ...overrides,
});

// ----------------------------------------------------------------------------
// POST /create  →  PermissionService.create
// ----------------------------------------------------------------------------
describe("POST /api/v1/permissions/create (real vertical)", () => {
  it("creates a new permission", async () => {
    const res = await request(app)
      .post("/api/v1/permissions/create")
      .send({
        permissionName: "customA",
        permissionConfig: buildPermissionConfig(),
      });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const doc = await permissionModel.findOne({ permissionName: "customa" });
    expect(doc).not.toBeNull();
    expect(doc.is_default).toBe(false);
  });

  it("rejects a payload that fails validation (no permissionConfig)", async () => {
    const res = await request(app)
      .post("/api/v1/permissions/create")
      .send({ permissionName: "bad" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("rejects a duplicate permissionName for the same admin", async () => {
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "dupperm",
      permissionConfig: buildPermissionConfig(),
    });
    const res = await request(app)
      .post("/api/v1/permissions/create")
      .send({
        permissionName: "dupperm",
        permissionConfig: buildPermissionConfig(),
      });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// GET /fetch  →  fetchPermissions
// ----------------------------------------------------------------------------
describe("GET /api/v1/permissions/fetch (real vertical)", () => {
  beforeEach(async () => {
    await permissionModel.create([
      {
        adminId: admin._id,
        permissionName: "p1",
        permissionConfig: buildPermissionConfig(),
      },
      {
        adminId: admin._id,
        permissionName: "p2",
        permissionConfig: buildPermissionConfig(),
      },
    ]);
  });

  it("returns all permissions for the admin", async () => {
    const res = await request(app).get("/api/v1/permissions/fetch");
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.TotalCount).toBe(2);
    expect(body.data.Permissions).toHaveLength(2);
  });

  it("filters by permissionId when provided", async () => {
    const target = await permissionModel.findOne({ permissionName: "p1" });
    const res = await request(app).get(
      `/api/v1/permissions/fetch?permissionId=${target._id.toString()}`,
    );
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.TotalCount).toBe(1);
    expect(body.data.Permissions[0]._id).toBe(target._id.toString());
  });

  it("returns failed when no permissions are found for an admin", async () => {
    // create a new admin with NO permissions
    const otherAdmin = await Admin.create({
      user_id: "perm-real-empty",
      login: "perm-real-empty",
      email: "perm-real-empty@test.com",
    });
    globalThis.__TEST_ADMIN_ID__ = otherAdmin._id.toString();
    const res = await request(app).get("/api/v1/permissions/fetch");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// PUT /update  →  updatePermissions
// ----------------------------------------------------------------------------
describe("PUT /api/v1/permissions/update (real vertical)", () => {
  it("updates a permission's permissionName", async () => {
    const doc = await permissionModel.create({
      adminId: admin._id,
      permissionName: "old-name",
      permissionConfig: buildPermissionConfig(),
    });
    const res = await request(app)
      .put(`/api/v1/permissions/update?permissionId=${doc._id.toString()}`)
      .send({ permissionName: "new-name" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const reloaded = await permissionModel.findById(doc._id);
    expect(reloaded.permissionName).toBe("new-name");
  });

  it("fails when permissionId does not exist", async () => {
    const res = await request(app)
      .put(
        `/api/v1/permissions/update?permissionId=${new mongoose.Types.ObjectId().toString()}`,
      )
      .send({ permissionName: "ghost" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("rejects updating a default permission", async () => {
    const doc = await permissionModel.create({
      adminId: admin._id,
      permissionName: "default-perm",
      permissionConfig: buildPermissionConfig(),
      is_default: true,
    });
    const res = await request(app)
      .put(`/api/v1/permissions/update?permissionId=${doc._id.toString()}`)
      .send({
        permissionConfig: {
          NVR: { view: false, create: false, edit: false, delete: false },
        },
      });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("rejects an update with no valid fields after validation", async () => {
    const doc = await permissionModel.create({
      adminId: admin._id,
      permissionName: "no-fields",
      permissionConfig: buildPermissionConfig(),
    });
    const res = await request(app)
      .put(`/api/v1/permissions/update?permissionId=${doc._id.toString()}`)
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// DELETE /delete  →  deletePermissions
// ----------------------------------------------------------------------------
describe("DELETE /api/v1/permissions/delete (real vertical)", () => {
  it("deletes a permission by id", async () => {
    const doc = await permissionModel.create({
      adminId: admin._id,
      permissionName: "to-delete",
      permissionConfig: buildPermissionConfig(),
    });
    const res = await request(app).delete(
      `/api/v1/permissions/delete?permissionId=${doc._id.toString()}`,
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(await permissionModel.findById(doc._id)).toBeNull();
  });

  it("fails when permissionId does not exist", async () => {
    const res = await request(app).delete(
      `/api/v1/permissions/delete?permissionId=${new mongoose.Types.ObjectId().toString()}`,
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// POST /roles_permissions  →  fetchRolesPermission
// ----------------------------------------------------------------------------
describe("POST /api/v1/permissions/roles_permissions (real vertical)", () => {
  it("returns role-with-permission documents (empty)", async () => {
    const res = await request(app)
      .post("/api/v1/permissions/roles_permissions")
      .send({});
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.totalLength).toBe(0);
    expect(body.data.rolesWithPermissions).toEqual([]);
  });

  it("includes joined permissionDetails when roles exist", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "linkedPerm",
      permissionConfig: buildPermissionConfig(),
    });
    await roleModel.create({
      adminId: admin._id,
      roleName: "viewer",
      permissionId: perm._id,
    });
    const res = await request(app)
      .post("/api/v1/permissions/roles_permissions")
      .send({});
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.totalLength).toBe(1);
    expect(body.data.rolesWithPermissions[0].roleName).toBe("viewer");
  });

  it("filters roles by searchQuery (case-insensitive regex)", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "linked2",
      permissionConfig: buildPermissionConfig(),
    });
    await roleModel.create([
      { adminId: admin._id, roleName: "editor-pro", permissionId: perm._id },
      { adminId: admin._id, roleName: "viewer-pro", permissionId: perm._id },
    ]);
    const res = await request(app)
      .post("/api/v1/permissions/roles_permissions?searchQuery=editor")
      .send({});
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.data.totalLength).toBe(1);
    expect(body.data.rolesWithPermissions[0].roleName).toBe("editor-pro");
  });
});

// ----------------------------------------------------------------------------
// POST /bulk-permissionConfig-update  →  bulkPermissionUpdate
// ----------------------------------------------------------------------------
describe("POST /api/v1/permissions/bulk-permissionConfig-update (real vertical)", () => {
  it("fails when admin does not exist", async () => {
    globalThis.__TEST_ADMIN_ID__ = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post("/api/v1/permissions/bulk-permissionConfig-update")
      .send({
        permissionConfig: [
          { moduleName: "NVR", view: true, create: false, edit: false, delete: false },
        ],
      });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// POST /bulk-permissionConfig-delete  →  bulkPermissionDelete
// ----------------------------------------------------------------------------
describe("POST /api/v1/permissions/bulk-permissionConfig-delete (real vertical)", () => {
  it("fails when no permissionConfig array is provided", async () => {
    const res = await request(app)
      .post("/api/v1/permissions/bulk-permissionConfig-delete")
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("fails when admin does not exist", async () => {
    globalThis.__TEST_ADMIN_ID__ = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post("/api/v1/permissions/bulk-permissionConfig-delete")
      .send({
        permissionConfig: [{ moduleName: "NVR" }],
      });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("unsets modules across all admin's permissions", async () => {
    // Note: bulkPermissionDelete now uses case-insensitive matching to find
    // the actual key in permissionConfig, so it works with any casing.
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "bulk-del",
      permissionConfig: {
        users: { view: true, create: false, edit: false, delete: false },
        nvr: { view: true, create: false, edit: false, delete: false },
      },
    });
    const res = await request(app)
      .post("/api/v1/permissions/bulk-permissionConfig-delete")
      .send({
        permissionConfig: [{ moduleName: "nvr" }],
      });
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    const reloaded = await permissionModel.findOne({
      permissionName: "bulk-del",
    });
    expect(reloaded.permissionConfig.nvr).toBeUndefined();
  });

  it("works with mixed-case moduleName requests matching mixed-case keys", async () => {
    // Test case-insensitive matching: request "NVR" should match config key "nvr"
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "bulk-mixedcase",
      permissionConfig: {
        users: { view: true, create: false, edit: false, delete: false },
        nvr: { view: true, create: false, edit: false, delete: false },
      },
    });
    const res = await request(app)
      .post("/api/v1/permissions/bulk-permissionConfig-delete")
      .send({
        permissionConfig: [{ moduleName: "NVR" }],
      });
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    const reloaded = await permissionModel.findOne({
      permissionName: "bulk-mixedcase",
    });
    expect(reloaded.permissionConfig.nvr).toBeUndefined();
  });

  it("fails when moduleName isn't a known key on the admin's permission", async () => {
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "bulk-miss",
      permissionConfig: buildPermissionConfig(),
    });
    const res = await request(app)
      .post("/api/v1/permissions/bulk-permissionConfig-delete")
      .send({
        permissionConfig: [{ moduleName: "doesNotExist" }],
      });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// GET /user-permissions  →  userPermissions
// ----------------------------------------------------------------------------
describe("GET /api/v1/permissions/user-permissions (real vertical)", () => {
  it("returns admin's role permission when no memberId on the request", async () => {
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "admin-perm",
      permissionConfig: buildPermissionConfig(),
    });
    await roleModel.create({
      adminId: admin._id,
      roleName: "admin",
      is_default: true,
      permissionId: perm._id,
    });
    const res = await request(app).get("/api/v1/permissions/user-permissions");
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].roleName).toBe("admin");
  });
});
