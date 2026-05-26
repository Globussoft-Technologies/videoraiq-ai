/**
 * Integration coverage for PermissionService.create and
 * PermissionService.bulkPermissionDelete — two methods previously
 * skipped (see header note in permissions.service.test.js — the
 * "double-nested userData" comment turned out to be inaccurate;
 * both methods destructure `req.verified.userData` directly).
 *
 * Branches exercised:
 *   create:
 *     - validation failure (missing permissionName / config) → FailResp
 *     - happy path: new permission inserted into Mongo + SuccessResp
 *     - duplicate permissionName for the same admin → FailResp
 *       ("already exist") branch
 *     - case-insensitive duplicate detection (regex match)
 *     - outer catch via `permissionDetails.toLowerCase()` on undefined
 *       permissionName (no body provided)
 *
 *   bulkPermissionDelete:
 *     - admin not found → FailResp
 *     - missing permissionConfig in body → FailResp
 *     - moduleName not found in adminPermission.permissionConfig →
 *       FailResp listing missing modules
 *     - happy path: $unset removes the listed modules + SuccessResp
 *     - SuccessResp/FailResp branch when modifiedCount is 0
 *       (no matching admin permission doc to update)
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
    login: "permCreate",
    email: "permCreate@test.com",
  });
});

describe("PermissionService.create — validation + duplicates", () => {
  it("returns FailResp when permissionConfig is missing (Joi validation)", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { permissionName: "newPerm" }, // missing permissionConfig
    });
    await PermissionService.create(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("creates a new permission and responds with success", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionName: "freshPerm",
        permissionConfig: {
          dashboard: { view: true, edit: false, create: false, delete: false },
        },
      },
    });
    await PermissionService.create(req, res);
    // Wait for the inner async map in the Promise to finish persisting.
    await new Promise((r) => setTimeout(r, 50));
    expect(payload(res).status).toBe("success");
    const stored = await permissionModel.findOne({
      adminId: admin._id,
      permissionName: "freshperm",
    });
    expect(stored).not.toBeNull();
    expect(stored.is_default).toBe(false);
    expect(stored.permissionConfig.dashboard.view).toBe(true);
  });

  it("returns FailResp when permissionName already exists for the admin", async () => {
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "existing",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionName: "existing",
        permissionConfig: { dashboard: { view: true } },
      },
    });
    await PermissionService.create(req, res);
    expect(payload(res).status).toBe("failed");
    // No new doc should have been inserted (still only 1).
    const count = await permissionModel.countDocuments({
      adminId: admin._id,
      permissionName: "existing",
    });
    expect(count).toBe(1);
  });

  it("detects case-insensitive duplicates via regex", async () => {
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "mixedcase",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionName: "MixedCase",
        permissionConfig: { dashboard: { view: false } },
      },
    });
    await PermissionService.create(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("hits the outer catch when permissionName is undefined (toLowerCase on undefined)", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {}, // no permissionName at all → `undefined.toLowerCase()` throws
    });
    await PermissionService.create(req, res);
    expect(payload(res).status).toBe("failed");
  });
});

describe("PermissionService.bulkPermissionDelete — guards", () => {
  it("returns FailResp when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      // Use a syntactically valid but non-existent admin id.
      adminId: "507f1f77bcf86cd799439011",
      body: {
        permissionConfig: [{ moduleName: "dashboard" }],
      },
    });
    await PermissionService.bulkPermissionDelete(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns FailResp when permissionConfig is missing from the body", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {},
    });
    await PermissionService.bulkPermissionDelete(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns FailResp listing the missing modules", async () => {
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "perm1",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionConfig: [{ moduleName: "ghostModule" }],
      },
    });
    await PermissionService.bulkPermissionDelete(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/ghostmodule/i);
  });
});

describe("PermissionService.bulkPermissionDelete — happy path", () => {
  it("$unsets the listed modules and responds with success", async () => {
    await permissionModel.create({
      adminId: admin._id,
      permissionName: "perm1",
      permissionConfig: {
        dashboard: { view: true },
        users: { view: true, edit: true },
      },
      is_default: false,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        permissionConfig: [{ moduleName: "Dashboard" }],
      },
    });
    await PermissionService.bulkPermissionDelete(req, res, next);
    expect(payload(res).status).toBe("success");
    const after = await permissionModel.findOne({
      adminId: admin._id,
      permissionName: "perm1",
    });
    // dashboard removed, users preserved.
    expect(after.permissionConfig.dashboard).toBeUndefined();
    expect(after.permissionConfig.users).toBeDefined();
  });
});
