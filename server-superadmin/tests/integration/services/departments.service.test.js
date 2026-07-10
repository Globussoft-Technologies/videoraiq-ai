/**
 * Integration test for DepartmentServices — CRUD against in-memory MongoDB.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: DepartmentService } = await import(
  "../../../core/v1/departments/departments.service.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);

const adminId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("DepartmentService.create", () => {
  it("creates a department (201) and lowercases the name", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      body: { departmentName: "Security" },
    });
    await DepartmentService.create(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    const doc = await Department.findOne();
    expect(doc.departmentName).toBe("security");
    expect(doc.adminId.toString()).toBe(adminId.toString());
  });

  it("rejects a missing departmentName", async () => {
    const { req, res, next } = serviceCtx({ adminId, body: {} });
    await DepartmentService.create(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(await Department.countDocuments()).toBe(0);
  });

  it("rejects a duplicate department name", async () => {
    await Department.create({ adminId, departmentName: "ops" });
    const { req, res, next } = serviceCtx({
      adminId,
      body: { departmentName: "Ops" },
    });
    await DepartmentService.create(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/already exists/i);
  });
});

describe("DepartmentService.get", () => {
  beforeEach(async () => {
    await Department.create({ adminId, departmentName: "alpha" });
    await Department.create({ adminId, departmentName: "beta" });
    await Department.create({
      adminId: new mongoose.Types.ObjectId(),
      departmentName: "other-admin",
    });
  });

  it("returns departments scoped to the caller's adminId", async () => {
    const { req, res, next } = serviceCtx({ adminId, body: {} });
    await DepartmentService.get(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
    expect(payload(res).data.data).toHaveLength(2);
  });

  it("filters by search term", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      body: { search: "alph" },
    });
    await DepartmentService.get(req, res, next);
    expect(payload(res).data.data).toHaveLength(1);
    expect(payload(res).data.data[0].departmentName).toBe("alpha");
  });

  it("clamps a negative skip and zero limit to sane defaults", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      body: { skip: -5, limit: 0 },
    });
    await DepartmentService.get(req, res, next);
    expect(payload(res).data.skip).toBe(0);
    expect(payload(res).data.limit).toBe(10);
  });
});

describe("DepartmentService.update", () => {
  it("requires a departmentId query param", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      body: { departmentName: "x" },
      query: {},
    });
    await DepartmentService.update(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown department", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      body: { departmentName: "x" },
      query: { departmentId: new mongoose.Types.ObjectId().toString() },
    });
    await DepartmentService.update(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("updates an existing department", async () => {
    const dept = await Department.create({ adminId, departmentName: "old" });
    const { req, res, next } = serviceCtx({
      adminId,
      body: { departmentName: "renamed" },
      query: { departmentId: dept._id.toString() },
    });
    await DepartmentService.update(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    const reloaded = await Department.findById(dept._id);
    expect(reloaded.departmentName).toBe("renamed");
  });
});

describe("DepartmentService.delete", () => {
  it("requires a departmentId query param", async () => {
    const { req, res, next } = serviceCtx({ adminId, query: {} });
    await DepartmentService.delete(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown department", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      query: { departmentId: new mongoose.Types.ObjectId().toString() },
    });
    await DepartmentService.delete(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("hard-deletes the department and creates a default fallback", async () => {
    const dept = await Department.create({ adminId, departmentName: "doomed" });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { departmentId: dept._id.toString() },
    });
    await DepartmentService.delete(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await Department.findById(dept._id)).toBeNull();
    // A "default" department is created to absorb reassignments.
    const def = await Department.findOne({ departmentName: /^default$/i });
    expect(def).not.toBeNull();
  });
});
