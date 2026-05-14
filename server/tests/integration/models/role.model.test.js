/**
 * Integration test for the Role Mongoose model.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../dbSetup.js";

const { default: Role } = await import(
  "../../../core/v1/roles/roles.model.js"
);

beforeAll(async () => {
  await connectMongo();
  await Role.syncIndexes();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("Role model", () => {
  const adminId = new mongoose.Types.ObjectId();

  it("creates a role with default flags", async () => {
    const role = await Role.create({ adminId, roleName: "viewer" });
    expect(role.view).toBe(false);
    expect(role.create).toBe(false);
    expect(role.edit).toBe(false);
    expect(role.delete).toBe(false);
    expect(role.is_default).toBe(false);
    expect(role.softDelete).toBe(false);
    expect(role.isEmpRole).toBe(false);
  });

  it("requires adminId and roleName", async () => {
    await expect(Role.create({ roleName: "x" })).rejects.toThrow();
    await expect(Role.create({ adminId })).rejects.toThrow();
  });

  it("can hold a permissionId reference", async () => {
    const permissionId = new mongoose.Types.ObjectId();
    const role = await Role.create({ adminId, roleName: "admin", permissionId });
    expect(role.permissionId.toString()).toBe(permissionId.toString());
  });

  it("indexes include createdAt", async () => {
    const indexes = await Role.collection.indexes();
    const hasCreatedAt = indexes.some(
      (i) => Object.keys(i.key).includes("createdAt")
    );
    expect(hasCreatedAt).toBe(true);
  });
});
