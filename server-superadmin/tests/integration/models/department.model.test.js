/**
 * Integration test for the Department Mongoose model.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

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

describe("Department model", () => {
  const adminId = new mongoose.Types.ObjectId();

  it("requires departmentName", async () => {
    await expect(Department.create({ adminId })).rejects.toThrow();
  });

  it("applies defaults", async () => {
    const d = await Department.create({ adminId, departmentName: "Security" });
    expect(d.isActive).toBe(true);
    expect(d.isImportedFromEMP).toBe(false);
    expect(d.softDelete).toBe(false);
    expect(d.empDepartmentId).toBeNull();
  });

  it("trims departmentName and description", async () => {
    const d = await Department.create({
      adminId,
      departmentName: "  Ops  ",
      description: "  desc  ",
    });
    expect(d.departmentName).toBe("Ops");
    expect(d.description).toBe("desc");
  });

  it("stamps timestamps", async () => {
    const d = await Department.create({ adminId, departmentName: "HR" });
    expect(d.createdAt).toBeInstanceOf(Date);
    expect(d.updatedAt).toBeInstanceOf(Date);
  });

  it("a plain find (no memberId option) returns all docs — access hook is skipped", async () => {
    await Department.create({ adminId, departmentName: "A" });
    await Department.create({ adminId, departmentName: "B" });
    const all = await Department.find({});
    expect(all).toHaveLength(2);
  });
});
