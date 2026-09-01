/**
 * v2 RolesService.syncDefaultRoles — POST /roles/sync-defaults.
 *
 * Reproduces the real defect: default roles are written once, at provisioning,
 * from the templates in permissions.config.js. `logs.carLogs` was added to
 * those templates after existing tenants were seeded, so their admin/read/write
 * roles have no entry for it — and because default roles are locked in the UI
 * and refused outright by PermissionService.updatePermissions, there is no way
 * to add it by hand. These tests seed roles the stale way and assert the sync
 * repairs them to the canonical matrix.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: RolesService } = await import(
  "../../../core/v2/roles/roles.service.js"
);
const { default: rolesModel } = await import(
  "../../../core/v2/roles/roles.model.js"
);
const { default: permissionModel } = await import(
  "../../../core/v2/permission/permissions.model.js"
);
const { default: adminModel } = await import(
  "../../../core/v2/admin/admin.model.js"
);
const { DEFAULT_ROLE_PRESETS, cloneConfig } = await import(
  "../../../core/v2/permission/permissions.config.js"
);
const { reconcileDefaultRolesOnLogin } = await import(
  "../../../core/v2/roles/defaultRoles.sync.js"
);

let adminId;

/** A default role seeded the way a pre-carLogs tenant would have been. */
const seedStaleRole = async (preset) => {
  const staleConfig = cloneConfig(preset.config);
  delete staleConfig.logs.carLogs;
  delete staleConfig.playbacks;
  const permission = await permissionModel.create({
    adminId,
    permissionConfig: staleConfig,
    permissionName: `${preset.roleName}Permission`,
    is_default: true,
  });
  return rolesModel.create({
    adminId,
    roleName: preset.roleName,
    isEmpRole: false,
    ...preset.flags,
    is_default: true,
    permissionId: permission._id,
  });
};

const runSync = async (query = {}) => {
  const { req, res, next } = serviceCtx({ adminId, user_id: "u1", query });
  await RolesService.syncDefaultRoles(req, res, next);
  const body = payload(res);
  expect(body.status).toBe("success");
  return body.data;
};

const configFor = async (roleName) => {
  const role = await rolesModel.findOne({ adminId, roleName });
  const permission = await permissionModel.findOne({ _id: role.permissionId });
  return { role, config: permission.permissionConfig };
};

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  const admin = await adminModel.create({
    user_id: "u1",
    login: "u1",
    email: "u1@test.com",
    purchasedCameras: 10,
  });
  adminId = admin._id;
});

describe("v2 syncDefaultRoles", () => {
  it("backfills a module the tenant was seeded before — the carLogs case", async () => {
    for (const preset of DEFAULT_ROLE_PRESETS) await seedStaleRole(preset);

    const data = await runSync();
    expect(data.rolesTouched).toBe(3);

    for (const preset of DEFAULT_ROLE_PRESETS) {
      const reported = data.roles.find((r) => r.roleName === preset.roleName);
      expect(reported.added).toEqual(
        expect.arrayContaining(["logs.carLogs", "playbacks"]),
      );
      const { config } = await configFor(preset.roleName);
      expect(config.logs.carLogs).toEqual(preset.config.logs.carLogs);
    }
  });

  it("applies the right matrix per role: read=view, write=all but delete, admin=all", async () => {
    for (const preset of DEFAULT_ROLE_PRESETS) await seedStaleRole(preset);
    await runSync();

    const admin = await configFor("admin");
    expect(admin.config.logs.carLogs).toEqual({
      view: true, create: true, edit: true, delete: true,
    });

    const read = await configFor("read");
    expect(read.config.logs.carLogs).toEqual({
      view: true, create: false, edit: false, delete: false,
    });

    const write = await configFor("write");
    expect(write.config.logs.carLogs).toEqual({
      view: true, create: true, edit: true, delete: false,
    });
  });

  it("is idempotent — a second sync reports nothing to do", async () => {
    for (const preset of DEFAULT_ROLE_PRESETS) await seedStaleRole(preset);
    await runSync();

    const second = await runSync();
    expect(second.rolesTouched).toBe(0);
    expect(second.modules).toBe(0);
    for (const role of second.roles) {
      expect(role.added).toEqual([]);
      expect(role.changed).toEqual([]);
    }
  });

  it("dryRun reports the same diff but writes nothing", async () => {
    for (const preset of DEFAULT_ROLE_PRESETS) await seedStaleRole(preset);

    const preview = await runSync({ dryRun: "true" });
    expect(preview.dryRun).toBe(true);
    expect(preview.rolesTouched).toBe(3);
    expect(preview.modules).toBeGreaterThan(0);

    // Nothing persisted.
    const { config } = await configFor("admin");
    expect(config.logs.carLogs).toBeUndefined();

    // And the real run still finds the same work outstanding.
    const applied = await runSync();
    expect(applied.modules).toBe(preview.modules);
  });

  it("corrects drift, not just absence", async () => {
    // PUT /roles/update cascades flat flags over default roles (it does not
    // block is_default), so a default role's config can be wrong rather than
    // merely incomplete. That must be reported as `changed`, not `added`.
    const readPreset = DEFAULT_ROLE_PRESETS.find((p) => p.roleName === "read");
    await seedStaleRole(readPreset);
    const before = await configFor("read");
    await permissionModel.updateOne(
      { _id: before.role.permissionId },
      { $set: { "permissionConfig.NVR": { view: true, create: true, edit: true, delete: true } } },
    );

    const data = await runSync();
    const reported = data.roles.find((r) => r.roleName === "read");
    expect(reported.changed).toContain("NVR");

    const after = await configFor("read");
    expect(after.config.NVR).toEqual({
      view: true, create: false, edit: false, delete: false,
    });
  });

  it("creates a default role that is missing outright", async () => {
    const adminPreset = DEFAULT_ROLE_PRESETS.find((p) => p.roleName === "admin");
    await seedStaleRole(adminPreset);
    // read and write never existed for this tenant.

    const data = await runSync();
    expect(data.roles.filter((r) => r.roleCreated).map((r) => r.roleName).sort())
      .toEqual(["read", "write"]);

    const write = await configFor("write");
    expect(write.role.is_default).toBe(true);
    expect(write.config.logs.carLogs).toEqual({
      view: true, create: true, edit: true, delete: false,
    });
  });

  it("repairs a role whose permissionId dangles", async () => {
    const preset = DEFAULT_ROLE_PRESETS.find((p) => p.roleName === "write");
    const role = await seedStaleRole(preset);
    await permissionModel.deleteOne({ _id: role.permissionId });

    const data = await runSync();
    expect(data.roles.find((r) => r.roleName === "write").permissionCreated).toBe(true);

    const { config } = await configFor("write");
    expect(config.logs.carLogs).toEqual({
      view: true, create: true, edit: true, delete: false,
    });
  });

  it("fixes the flat summary columns so the table matches the config", async () => {
    const preset = DEFAULT_ROLE_PRESETS.find((p) => p.roleName === "write");
    await seedStaleRole(preset);
    // The old seeder wrote write.view=false even though writeConfig grants view.
    await rolesModel.updateOne({ adminId, roleName: "write" }, { $set: { view: false } });

    const data = await runSync();
    expect(data.roles.find((r) => r.roleName === "write").flagsUpdated).toBe(true);

    const { role } = await configFor("write");
    expect(role.view).toBe(true);
    expect(role.create).toBe(true);
    expect(role.edit).toBe(true);
    expect(role.delete).toBe(false);
  });

  it("leaves custom (non-default) roles completely alone", async () => {
    for (const preset of DEFAULT_ROLE_PRESETS) await seedStaleRole(preset);
    const customPermission = await permissionModel.create({
      adminId,
      permissionConfig: { NVR: { view: true, create: false, edit: false, delete: false } },
      permissionName: "customPermission",
      is_default: false,
    });
    const custom = await rolesModel.create({
      adminId,
      roleName: "supervisor",
      view: true, create: false, edit: false, delete: false,
      is_default: false,
      permissionId: customPermission._id,
    });

    await runSync();

    const after = await permissionModel.findOne({ _id: customPermission._id });
    expect(after.permissionConfig).toEqual({
      NVR: { view: true, create: false, edit: false, delete: false },
    });
    const customAfter = await rolesModel.findOne({ _id: custom._id });
    expect(customAfter.is_default).toBe(false);
    expect(customAfter.create).toBe(false);
  });

  it("does not leak one tenant's config into another's documents", async () => {
    // The templates are shared module-level objects; storing one without a deep
    // copy would alias it across admins.
    for (const preset of DEFAULT_ROLE_PRESETS) await seedStaleRole(preset);
    await runSync();

    const other = await adminModel.create({
      user_id: "u2", login: "u2", email: "u2@test.com", purchasedCameras: 5,
    });
    const first = adminId;
    adminId = other._id;
    await runSync();
    adminId = first;

    const mine = await configFor("read");
    await permissionModel.updateOne(
      { _id: mine.role.permissionId },
      { $set: { "permissionConfig.logs.carLogs.view": false } },
    );

    adminId = other._id;
    const theirs = await configFor("read");
    expect(theirs.config.logs.carLogs.view).toBe(true);
    adminId = first;
  });

  it("refuses a sub-user whose token lacks permission.edit", async () => {
    const { req, res, next } = serviceCtx({ adminId, user_id: "u1" });
    req.verified.permissionConfig = [
      { permissionConfig: { permission: { view: true, edit: false }, roles: { edit: true } } },
    ];
    await RolesService.syncDefaultRoles(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("allows a sub-user that does hold permission.edit", async () => {
    for (const preset of DEFAULT_ROLE_PRESETS) await seedStaleRole(preset);
    const { req, res, next } = serviceCtx({ adminId, user_id: "u1" });
    req.verified.permissionConfig = [
      { permissionConfig: { permission: { view: true, edit: true }, roles: { edit: true } } },
    ];
    await RolesService.syncDefaultRoles(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.rolesTouched).toBe(3);
  });
});

describe("reconcileDefaultRolesOnLogin — the automatic path", () => {
  it("repairs a stale tenant on login with no button press", async () => {
    // This is the whole point: the templates are a stamp, not a live
    // reference, so the seeder being create-only left existing tenants frozen.
    for (const preset of DEFAULT_ROLE_PRESETS) await seedStaleRole(preset);

    const result = await reconcileDefaultRolesOnLogin({ adminId, userId: "u1" });
    expect(result.rolesTouched).toBe(3);

    const { config } = await configFor("admin");
    expect(config.logs.carLogs).toEqual({
      view: true, create: true, edit: true, delete: true,
    });
  });

  it("costs nothing once the tenant is already current", async () => {
    for (const preset of DEFAULT_ROLE_PRESETS) await seedStaleRole(preset);
    await reconcileDefaultRolesOnLogin({ adminId, userId: "u1" });

    const { role } = await configFor("admin");
    const permissionBefore = await permissionModel.findOne({ _id: role.permissionId });

    const second = await reconcileDefaultRolesOnLogin({ adminId, userId: "u1" });
    expect(second.rolesTouched).toBe(0);

    // No write at all — updatedAt must be untouched on a no-op login.
    const permissionAfter = await permissionModel.findOne({ _id: role.permissionId });
    expect(permissionAfter.updatedAt.getTime()).toBe(permissionBefore.updatedAt.getTime());
  });

  it("never throws — a login must not fail because of a permission repair", async () => {
    // A bad adminId would blow up ObjectId casting inside; the login wrapper
    // has to swallow it rather than take the whole sign-in down.
    await expect(
      reconcileDefaultRolesOnLogin({ adminId: "not-an-object-id", userId: "u1" })
    ).resolves.toBeNull();

    await expect(
      reconcileDefaultRolesOnLogin({ adminId: null, userId: "u1" })
    ).resolves.toBeNull();
  });
});
