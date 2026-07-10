/**
 * Integration test for RolesServices — CRUD against in-memory MongoDB.
 *
 * Note: createRoles inserts roles via an un-awaited async map (videoraiq-ai#31),
 * so DB-state assertions after createRoles wait a short tick.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
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

const tick = () => new Promise((r) => setTimeout(r, 80));

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
    login: "admin",
    email: "a@test.com",
  });
});

function adminCtx(extra = {}) {
  return serviceCtx({ adminId: admin._id, orgId: "org-1", ...extra });
}

describe("RolesServices.createRoles", () => {
  it("creates new roles and responds success", async () => {
    const { req, res } = adminCtx({ body: { roles: ["Editor", "Viewer"] } });
    await RolesService.createRoles(req, res);
    expect(payload(res).status).toBe("success");

    await tick();
    const names = (await Role.find()).map((r) => r.roleName).sort();
    expect(names).toEqual(["editor", "viewer"]);
  });

  it("fails gracefully when roles array is missing", async () => {
    const { req, res } = adminCtx({ body: {} });
    await RolesService.createRoles(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("reports already-existing roles", async () => {
    await Role.create({ adminId: admin._id, roleName: "editor" });
    const { req, res } = adminCtx({ body: { roles: ["Editor"] } });
    await RolesService.createRoles(req, res);
    expect(payload(res).status).toBe("failed");
  });
});

describe("RolesServices.get", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: {},
    });
    await RolesService.get(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("returns roles with a count for a valid admin", async () => {
    await Role.create({ adminId: admin._id, roleName: "alpha" });
    await Role.create({ adminId: admin._id, roleName: "beta" });
    const { req, res } = adminCtx({ query: {} });
    await RolesService.get(req, res);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.rolesCount).toBe(2);
  });
});

describe("RolesServices.update", () => {
  it("fails when roleId is missing", async () => {
    const { req, res } = adminCtx({ query: {}, body: { roleName: "x" } });
    await RolesService.update(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when the role does not exist", async () => {
    const { req, res } = adminCtx({
      query: { roleId: new mongoose.Types.ObjectId().toString() },
      body: { roleName: "ghost" },
    });
    await RolesService.update(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("updates a non-default role's name", async () => {
    const role = await Role.create({
      adminId: admin._id,
      roleName: "oldname",
      is_default: false,
    });
    const { req, res } = adminCtx({
      query: { roleId: role._id.toString() },
      body: { roleName: "newname" },
    });
    await RolesService.update(req, res);
    expect(payload(res).status).toBe("success");
    expect((await Role.findById(role._id)).roleName).toBe("newname");
  });
});

describe("RolesServices.delete", () => {
  it("fails when no matching role is found", async () => {
    const { req, res } = adminCtx({
      query: { roleId: new mongoose.Types.ObjectId().toString() },
    });
    await RolesService.delete(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("deletes a role and its linked permission", async () => {
    const perm = await Permission.create({
      adminId: admin._id,
      permissionName: "p",
      permissionConfig: {},
    });
    const role = await Role.create({
      adminId: admin._id,
      orgId: "org-1",
      roleName: "doomed",
      permissionId: perm._id,
    });
    const { req, res } = adminCtx({ query: { roleId: role._id.toString() } });
    await RolesService.delete(req, res);
    expect(payload(res).status).toBe("success");
    expect(await Role.findById(role._id)).toBeNull();
    expect(await Permission.findById(perm._id)).toBeNull();
  });
});
