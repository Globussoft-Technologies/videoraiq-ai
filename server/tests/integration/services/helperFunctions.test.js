/**
 * Integration test for utils/helperFunctions.js — syncPermissionLocations
 * walks the permission collection and back-fills the `locations` permission
 * config based on permissionName. autoSyncLocations is also tested for the
 * tractable read+insert path (no SFTP, no axios).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { syncPermissionLocations, autoSyncLocations } = await import(
  "../../../utils/helperFunctions.js"
);
const { default: permissionModel } = await import(
  "../../../core/v1/permission/permissions.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Location } = await import(
  "../../../core/v1/locations/location.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: NVR } = await import(
  "../../../core/v1/NVR/nvr.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("syncPermissionLocations", () => {
  it("is a no-op when adminId is missing", async () => {
    await expect(syncPermissionLocations(undefined)).resolves.toBeUndefined();
  });

  it("back-fills locations on the admin permission with full access", async () => {
    const adminId = new mongoose.Types.ObjectId();
    const perm = await permissionModel.create({
      adminId,
      permissionName: "adminPermission",
      permissionConfig: {},
    });
    await syncPermissionLocations(adminId);
    const reloaded = await permissionModel.findById(perm._id);
    expect(reloaded.permissionConfig.locations).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
  });

  it("back-fills locations on the read permission with view-only access", async () => {
    const adminId = new mongoose.Types.ObjectId();
    const perm = await permissionModel.create({
      adminId,
      permissionName: "readPermission",
      permissionConfig: {},
    });
    await syncPermissionLocations(adminId);
    const reloaded = await permissionModel.findById(perm._id);
    expect(reloaded.permissionConfig.locations).toEqual({
      view: true,
      create: false,
      edit: false,
      delete: false,
    });
  });

  it("back-fills locations on a write permission with create+edit but no delete", async () => {
    const adminId = new mongoose.Types.ObjectId();
    const perm = await permissionModel.create({
      adminId,
      permissionName: "writePermission",
      permissionConfig: {},
    });
    await syncPermissionLocations(adminId);
    const reloaded = await permissionModel.findById(perm._id);
    expect(reloaded.permissionConfig.locations).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: false,
    });
  });

  it("back-fills locations on a custom permission with full access", async () => {
    const adminId = new mongoose.Types.ObjectId();
    const perm = await permissionModel.create({
      adminId,
      permissionName: "customRolePermission",
      permissionConfig: {},
    });
    await syncPermissionLocations(adminId);
    const reloaded = await permissionModel.findById(perm._id);
    expect(reloaded.permissionConfig.locations).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
  });

  it("leaves an existing locations config alone", async () => {
    const adminId = new mongoose.Types.ObjectId();
    const existing = {
      view: false,
      create: false,
      edit: false,
      delete: false,
    };
    const perm = await permissionModel.create({
      adminId,
      permissionName: "adminPermission",
      permissionConfig: { locations: existing },
    });
    await syncPermissionLocations(adminId);
    const reloaded = await permissionModel.findById(perm._id);
    expect(reloaded.permissionConfig.locations).toEqual(existing);
  });
});

describe("autoSyncLocations", () => {
  it("does nothing when adminData is falsy", async () => {
    await expect(
      autoSyncLocations(null, { user_id: "1" })
    ).resolves.toBeUndefined();
  });

  it("lowercases department/authorizedUsers/NVR locations and inserts missing Location docs", async () => {
    const admin = await Admin.create({
      user_id: "777",
      login: "a",
      email: "a@test.com",
    });
    // Mixed-case data that should be lowercased + collected.
    await Department.create({
      adminId: admin._id,
      departmentName: "HR",
    });
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "U",
      lastName: "1",
      email: "u1@t.test",
      location: "Bangalore",
    });
    await NVR.create({
      userId: "777",
      nvrName: "NVR-1",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "Mumbai",
      localNvrId: "loc-1",
    });

    await autoSyncLocations(admin, { user_id: "777" });

    // Mongoose-normalized lowercase values.
    expect((await Department.findOne({ adminId: admin._id })).departmentName).toBe("hr");
    expect((await AuthorizedUsers.findOne({ adminId: admin._id })).location).toBe(
      "bangalore"
    );
    // NVR.location may be a string or array; just confirm at least one lowercase match.
    const nvr = await NVR.findOne({ userId: "777" });
    const nvrLoc = Array.isArray(nvr.location) ? nvr.location.join() : nvr.location;
    expect(nvrLoc.toLowerCase()).toBe(nvrLoc);

    // Both new locations were inserted. autoSyncLocations preserves the
    // (already-lowercased) name as it appears in the source docs.
    const created = await Location.find({ adminId: admin._id });
    const namesLower = created.map((l) => l.locationName.toLowerCase()).sort();
    expect(namesLower).toEqual(["bangalore", "mumbai"]);
  });
});
