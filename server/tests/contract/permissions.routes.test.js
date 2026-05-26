/**
 * Basic contract test for `/api/v1/permissions` — pins the wiring between
 * `permissions.route.js`, its inline `verifyToken` + `permissionMiddleware`
 * access checks, and the `PermissionController` methods.
 *
 * The companion `.real.test.js` exercises the controller + Mongo end-to-end;
 * this file is the cheap wiring sanity check (every declared route reaches
 * the expected controller method with the right verb + permission verb).
 *
 * Mocks: 3 (permissions.controller, verifyToken, permissionMiddleware).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/permission/permissions.controller.js", () => ({
  default: {
    create: vi.fn(async (req, res) =>
      res.status(201).json({ success: true, route: "create" })
    ),
    fetchPermissions: vi.fn(async (req, res) =>
      res.status(200).json({ success: true, route: "fetch" })
    ),
    updatePermissions: vi.fn(async (req, res) =>
      res.status(200).json({ success: true, route: "update" })
    ),
    deletePermissions: vi.fn(async (req, res) =>
      res.status(200).json({ success: true, route: "delete" })
    ),
    fetchRolesPermission: vi.fn(async (req, res) =>
      res.status(200).json({ success: true, route: "roles" })
    ),
    bulkPermissionUpdate: vi.fn(async (req, res) =>
      res.status(200).json({ success: true, route: "bulkUpdate" })
    ),
    bulkPermissionDelete: vi.fn(async (req, res) =>
      res.status(200).json({ success: true, route: "bulkDelete" })
    ),
    updateAdminPermissions: vi.fn(async (req, res) =>
      res.status(200).json({ success: true, route: "updateAdmin" })
    ),
    userPermissions: vi.fn(async (req, res) =>
      res.status(200).json({ success: true, route: "userPerms" })
    ),
  },
}));

// Track the order of access checks so we can confirm permission verbs were
// hit. verifyToken is a no-op pass-through.
const accessOrder = [];
vi.mock("../../middlewares/verifyToken.js", () => ({
  default: (req, _res, next) => {
    accessOrder.push("verifyToken");
    next();
  },
}));
vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => {
    accessOrder.push("view");
    next();
  },
  createAccessCheck: (_req, _res, next) => {
    accessOrder.push("create");
    next();
  },
  editAccessCheck: (_req, _res, next) => {
    accessOrder.push("edit");
    next();
  },
  deleteAccessCheck: (_req, _res, next) => {
    accessOrder.push("delete");
    next();
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: permissionRoutes } = await import(
  "../../core/v1/permission/permissions.route.js"
);

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/permissions", permissionRoutes));
  accessOrder.length = 0;
});

describe("POST /api/v1/permissions/create", () => {
  it("routes through verifyToken + createAccessCheck to PermissionController.create", async () => {
    const res = await request(app)
      .post("/api/v1/permissions/create")
      .send({ permissionName: "x", permissionConfig: { NVR: { view: true } } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, route: "create" });
    expect(accessOrder).toEqual(["verifyToken", "create"]);
  });
});

describe("GET /api/v1/permissions/fetch", () => {
  it("routes through verifyToken + viewAccessCheck to fetchPermissions", async () => {
    const res = await request(app).get("/api/v1/permissions/fetch");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, route: "fetch" });
    expect(accessOrder).toEqual(["verifyToken", "view"]);
  });
});

describe("PUT /api/v1/permissions/update", () => {
  it("routes through verifyToken + editAccessCheck to updatePermissions", async () => {
    const res = await request(app)
      .put("/api/v1/permissions/update")
      .send({ permissionName: "y" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, route: "update" });
    expect(accessOrder).toEqual(["verifyToken", "edit"]);
  });
});

describe("DELETE /api/v1/permissions/delete", () => {
  it("routes through verifyToken + deleteAccessCheck to deletePermissions", async () => {
    const res = await request(app).delete("/api/v1/permissions/delete");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, route: "delete" });
    expect(accessOrder).toEqual(["verifyToken", "delete"]);
  });
});

describe("POST /api/v1/permissions/roles_permissions", () => {
  it("routes through verifyToken + viewAccessCheck to fetchRolesPermission", async () => {
    const res = await request(app)
      .post("/api/v1/permissions/roles_permissions")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, route: "roles" });
    expect(accessOrder).toEqual(["verifyToken", "view"]);
  });
});

describe("POST /api/v1/permissions/bulk-permissionConfig-update", () => {
  it("routes through verifyToken + editAccessCheck to bulkPermissionUpdate", async () => {
    const res = await request(app)
      .post("/api/v1/permissions/bulk-permissionConfig-update")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, route: "bulkUpdate" });
    expect(accessOrder).toEqual(["verifyToken", "edit"]);
  });
});

describe("POST /api/v1/permissions/bulk-permissionConfig-delete", () => {
  it("routes through verifyToken + deleteAccessCheck to bulkPermissionDelete", async () => {
    const res = await request(app)
      .post("/api/v1/permissions/bulk-permissionConfig-delete")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, route: "bulkDelete" });
    expect(accessOrder).toEqual(["verifyToken", "delete"]);
  });
});

describe("PUT /api/v1/permissions/update-admin-permissions", () => {
  it("routes through verifyToken + editAccessCheck to updateAdminPermissions", async () => {
    const res = await request(app)
      .put("/api/v1/permissions/update-admin-permissions")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, route: "updateAdmin" });
    expect(accessOrder).toEqual(["verifyToken", "edit"]);
  });
});

describe("GET /api/v1/permissions/user-permissions", () => {
  it("routes through verifyToken (no permission check) to userPermissions", async () => {
    const res = await request(app).get("/api/v1/permissions/user-permissions");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, route: "userPerms" });
    // No permissionMiddleware in this chain — only verifyToken.
    expect(accessOrder).toEqual(["verifyToken"]);
  });
});
