/**
 * Integration test for the permission Mongoose model + its exported defaults.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const permModule = await import(
  "../../../core/v1/permission/permissions.model.js"
);
const Permission = permModule.default;
const { defaultPermission } = permModule;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("permission model", () => {
  const adminId = new mongoose.Types.ObjectId();

  it("requires adminId", async () => {
    await expect(
      Permission.create({ permissionName: "x" })
    ).rejects.toThrow();
  });

  it("stores an arbitrary permissionConfig object", async () => {
    const cfg = { NVR: { view: true, create: false } };
    const p = await Permission.create({
      adminId,
      permissionName: "custom",
      permissionConfig: cfg,
    });
    expect(p.permissionConfig).toEqual(cfg);
    expect(p.is_default).toBe(false);
  });

  it("round-trips a nested logs config", async () => {
    const cfg = {
      logs: { global: { view: true }, accessLogs: { view: false } },
    };
    const p = await Permission.create({
      adminId,
      permissionName: "logsPerm",
      permissionConfig: cfg,
    });
    const reloaded = await Permission.findById(p._id);
    expect(reloaded.permissionConfig.logs.global.view).toBe(true);
  });
});

describe("defaultPermission export", () => {
  it("ships admin / write / read presets", () => {
    const names = defaultPermission.map((p) => p.permissionName);
    expect(names).toEqual(["admin", "write", "read"]);
  });

  it("every preset is flagged is_default", () => {
    expect(defaultPermission.every((p) => p.is_default === true)).toBe(true);
  });

  it("each preset carries a permissionConfig", () => {
    for (const p of defaultPermission) {
      expect(p.permissionConfig).toBeTypeOf("object");
      expect(Object.keys(p.permissionConfig).length).toBeGreaterThan(0);
    }
  });
});
