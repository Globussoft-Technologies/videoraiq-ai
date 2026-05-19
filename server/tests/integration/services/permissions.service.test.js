/**
 * Integration test for PermissionService (permissions.utility.js) — the
 * tractable fetch/update/delete paths against in-memory MongoDB.
 *
 * `create` and `bulkPermissionDelete` read `req.verified.userData.userData`
 * (a double-nested shape) outside their try blocks, so they are not exercised
 * here. Every method responds via `res.send(Response.xxx())`, which leaves
 * `res.statusCode` at 200 — assertions check `payload(res).status` instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
await import("../../../core/v1/roles/roles.model.js");
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
    login: "a",
    email: "a@test.com",
  });
});

function seedPermission(over = {}) {
  return permissionModel.create({
    adminId: admin._id,
    permissionName: "custom",
    permissionConfig: { dashboard: { view: true, edit: false } },
    is_default: false,
    ...over,
  });
}

describe("PermissionService.fetchPermissions", () => {
  it("fails when the admin has no permissions", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    await PermissionService.fetchPermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the admin's permissions", async () => {
    await seedPermission();
    await seedPermission({ permissionName: "second" });
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    await PermissionService.fetchPermissions(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.TotalCount).toBe(2);
  });

  it("returns a single permission when permissionId is given", async () => {
    const perm = await seedPermission();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: perm._id.toString() },
    });
    await PermissionService.fetchPermissions(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.TotalCount).toBe(1);
  });
});

describe("PermissionService.updatePermissions", () => {
  it("fails for an unknown permissionId", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: new mongoose.Types.ObjectId().toString() },
      body: { permissionName: "renamed" },
    });
    await PermissionService.updatePermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("renames an existing permission", async () => {
    const perm = await seedPermission();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: perm._id.toString() },
      body: { permissionName: "renamed" },
    });
    await PermissionService.updatePermissions(req, res, next);
    expect(payload(res).status).toBe("success");
    expect((await permissionModel.findById(perm._id)).permissionName).toBe(
      "renamed"
    );
  });

  it("refuses to update a default permission", async () => {
    const perm = await seedPermission({ is_default: true });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: perm._id.toString() },
      body: { permissionName: "renamed" },
    });
    await PermissionService.updatePermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("PermissionService.deletePermissions", () => {
  it("fails for an unknown permissionId", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: new mongoose.Types.ObjectId().toString() },
    });
    await PermissionService.deletePermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("deletes an existing permission", async () => {
    const perm = await seedPermission();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { permissionId: perm._id.toString() },
    });
    await PermissionService.deletePermissions(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(await permissionModel.findById(perm._id)).toBeNull();
  });
});

describe("PermissionService.fetchRolesPermission", () => {
  it("returns the admin's roles (empty list, 0 total)", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    await PermissionService.fetchRolesPermission(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalLength).toBe(0);
  });
});

describe("PermissionService.userPermissions", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
    });
    await PermissionService.userPermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns a result for an existing admin", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await PermissionService.userPermissions(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

describe("PermissionService.bulkPermissionUpdate", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      body: { permissionConfig: [] },
    });
    await PermissionService.bulkPermissionUpdate(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("PermissionService.updateAdminPermissions", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      body: {},
    });
    await PermissionService.updateAdminPermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when permissionConfig is missing", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, body: {} });
    await PermissionService.updateAdminPermissions(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});
