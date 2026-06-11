/**
 * Gap-fill round 2 for departments.service.js.
 *
 * Remaining v8 uncovered ranges (after departments.service.test.js):
 *   44-48    create outer catch
 *   79-82    get: memberId-with-authorizedDepartments filter
 *   105-109  get outer catch
 *   125-128  update validation-fail FailResp
 *   152-155  update duplicate-name FailResp
 *   169-173  update outer catch
 *   235-241  delete outer catch
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
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
  vi.restoreAllMocks();
});

describe("DepartmentService.create — outer catch (lines 44-48)", () => {
  it("returns 500 errorResp when Department.create rejects", async () => {
    vi.spyOn(Department, "create").mockImplementationOnce(() => {
      throw new Error("create-blew-up");
    });
    const { req, res, next } = serviceCtx({
      adminId,
      body: { departmentName: "boom" },
    });
    await DepartmentService.create(req, res, next);
    expect(res.statusCode).toBe(500);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });
});

describe("DepartmentService.get — memberId + authorizedDepartments (lines 78-82)", () => {
  it("restricts the result to authorizedDepartments when memberId is set", async () => {
    const allowed = await Department.create({
      adminId,
      departmentName: "allowed-dept",
    });
    await Department.create({
      adminId,
      departmentName: "hidden-dept",
    });
    const { req, res, next } = serviceCtx({
      adminId,
      memberId: new mongoose.Types.ObjectId(),
      authorizedChannel: { departmentIds: [allowed._id] },
      body: {},
    });
    await DepartmentService.get(req, res, next);
    expect(res.statusCode).toBe(200);
    const body = payload(res);
    expect(body.data.totalCount).toBe(1);
    expect(body.data.data[0].departmentName).toBe("allowed-dept");
  });
});

describe("DepartmentService.get — outer catch (lines 105-109)", () => {
  it("returns 500 when Department.find throws", async () => {
    vi.spyOn(Department, "find").mockImplementationOnce(() => {
      throw new Error("find-blew-up");
    });
    const { req, res, next } = serviceCtx({
      adminId,
      body: {},
    });
    await DepartmentService.get(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});

describe("DepartmentService.update — validation fail (lines 125-128)", () => {
  it("sends Validation Failed when the body fails Joi", async () => {
    const { req, res, next } = serviceCtx({
      adminId,
      query: { departmentId: new mongoose.Types.ObjectId().toString() },
      body: { departmentName: 42 }, // must be string
    });
    await DepartmentService.update(req, res, next);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });
});

describe("DepartmentService.update — duplicate-name (lines 142-155)", () => {
  it("returns 'Department name already exists' when another dept in same org has the name", async () => {
    const orgId = new mongoose.Types.ObjectId();
    await Department.create({
      adminId,
      orgId,
      departmentName: "taken",
      softDelete: false,
    });
    const target = await Department.create({
      adminId,
      orgId,
      departmentName: "source",
      softDelete: false,
    });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { departmentId: target._id.toString() },
      body: { departmentName: "Taken" },
    });
    await DepartmentService.update(req, res, next);
    const body = payload(res);
    expect(body.message).toMatch(/already exists/i);
  });
});

describe("DepartmentService.update — outer catch (lines 169-173)", () => {
  it("returns 500 when findByIdAndUpdate throws", async () => {
    const target = await Department.create({
      adminId,
      departmentName: "to-throw",
      softDelete: false,
    });
    vi.spyOn(Department, "findByIdAndUpdate").mockImplementationOnce(() => {
      throw new Error("update-blew-up");
    });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { departmentId: target._id.toString() },
      body: { departmentName: "renamed" },
    });
    await DepartmentService.update(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});

describe("DepartmentService.delete — outer catch (lines 235-241)", () => {
  it("returns 500 when deleteOne rejects", async () => {
    const target = await Department.create({
      adminId,
      departmentName: "to-delete",
      softDelete: false,
    });
    vi.spyOn(Department, "deleteOne").mockImplementationOnce(() => {
      throw new Error("delete-blew-up");
    });
    const { req, res, next } = serviceCtx({
      adminId,
      query: { departmentId: target._id.toString() },
    });
    await DepartmentService.delete(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});
