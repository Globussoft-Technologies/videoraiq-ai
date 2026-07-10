/**
 * Real vertical Supertest contract for /api/v1/departments.
 *
 * Mounts the actual router on a fresh Express app with the real controller +
 * service + Joi validation + Mongo persistence (in-memory). Only verifyToken
 * is stubbed (to attach req.verified) so the request path stays inside the
 * server boundary.
 *
 * permissionMiddleware is also stubbed because the access checks call
 * `req.verified.permissionConfig` which is admin-only territory; the goal
 * here is to exercise the controller + service vertical, not the perms wall
 * (which has its own dedicated tests).
 *
 * Response envelope note: services call `res.send(Response.userSuccessResp(...))`
 * where the helper returns `{ statusCode, body }`. Express therefore puts the
 * helper object directly into the response body, so the success/failure flag
 * lives at `res.body.body.status` (double-nested), not `res.body.status`.
 * (Express only honors the helper's statusCode when the service does
 * `res.status(N).send(...)`; when it just calls `res.send(...)` the HTTP
 * status stays at the default 200 regardless of `statusCode` in the body.)
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import request from "supertest";
import { connectMongo, disconnectMongo, clearCollections } from "../integration/dbSetup.js";

// Stub verifyToken: attach a verified admin and continue.
vi.mock("../../middlewares/verifyToken.js", () => ({
  default: (req, _res, next) => {
    req.verified = {
      state: true,
      userData: {
        adminId: globalThis.__TEST_ADMIN_ID__,
        user_id: 99,
        memberId: undefined,
      },
      authorizedChannel: null,
      permissionConfig: [{ permissionConfig: {} }],
    };
    next();
  },
}));

// Stub permission middleware so all four verbs sail through.
vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: departmentsRoutes } = await import(
  "../../core/v1/departments/departments.routes.js"
);
const { default: Admin } = await import(
  "../../core/v1/admin/admin.model.js"
);
const { default: Departments } = await import(
  "../../core/v1/departments/departments.model.js"
);

let app;
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
    user_id: "501",
    login: "dept-real",
    email: "deptreal@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => a.use("/api/v1/departments", departmentsRoutes));
});

/** Unwrap `{ statusCode, body }` from the Response helper envelope. */
const inner = (res) => res.body?.body ?? res.body;

describe("POST /api/v1/departments/create (real vertical)", () => {
  it("creates a department and persists it", async () => {
    const res = await request(app)
      .post("/api/v1/departments/create")
      .send({ departmentName: "Engineering" });
    expect(res.status).toBe(201);
    expect(inner(res).status).toBe("success");
    const all = await Departments.find({});
    expect(all).toHaveLength(1);
    expect(all[0].departmentName).toBe("engineering");
  });

  it("returns failure on duplicate departmentName", async () => {
    await Departments.create({
      adminId: admin._id,
      departmentName: "ops",
      empDepartmentId: null,
    });
    const res = await request(app)
      .post("/api/v1/departments/create")
      .send({ departmentName: "ops" });
    expect(inner(res).status).toBe("failed");
  });

  it("returns failure when departmentName is missing (Joi)", async () => {
    const res = await request(app)
      .post("/api/v1/departments/create")
      .send({});
    expect(inner(res).status).toBe("failed");
  });
});

describe("POST /api/v1/departments/get (real vertical)", () => {
  it("returns paginated departments + totalCount", async () => {
    await Departments.create([
      { adminId: admin._id, departmentName: "alpha" },
      { adminId: admin._id, departmentName: "beta" },
      { adminId: admin._id, departmentName: "gamma" },
    ]);
    const res = await request(app)
      .post("/api/v1/departments/get")
      .send({ skip: 0, limit: 2 });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(inner(res).data.totalCount).toBe(3);
    expect(inner(res).data.data).toHaveLength(2);
  });

  it("filters by case-insensitive search", async () => {
    await Departments.create([
      { adminId: admin._id, departmentName: "engineering" },
      { adminId: admin._id, departmentName: "marketing" },
    ]);
    const res = await request(app)
      .post("/api/v1/departments/get")
      .send({ search: "ENG" });
    expect(inner(res).data.totalCount).toBe(1);
    expect(inner(res).data.data[0].departmentName).toBe("engineering");
  });
});

describe("PUT /api/v1/departments/update (real vertical)", () => {
  it("400s when departmentId query param is missing", async () => {
    const res = await request(app)
      .put("/api/v1/departments/update")
      .send({ departmentName: "renamed" });
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });

  it("404s when the department does not exist", async () => {
    const res = await request(app)
      .put("/api/v1/departments/update?departmentId=000000000000000000000000")
      .send({ departmentName: "renamed" });
    expect(res.status).toBe(404);
  });

  it("updates a department successfully", async () => {
    const dept = await Departments.create({
      adminId: admin._id,
      departmentName: "oldname",
    });
    const res = await request(app)
      .put(`/api/v1/departments/update?departmentId=${dept._id}`)
      .send({ departmentName: "newname" });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const reloaded = await Departments.findById(dept._id);
    expect(reloaded.departmentName).toBe("newname");
  });
});

describe("DELETE /api/v1/departments/delete (real vertical)", () => {
  it("400s when departmentId is missing", async () => {
    const res = await request(app).delete("/api/v1/departments/delete");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });

  it("404s when department does not exist", async () => {
    const res = await request(app).delete(
      "/api/v1/departments/delete?departmentId=000000000000000000000000",
    );
    expect(res.status).toBe(404);
  });

  it("hard-deletes the department + creates a default fallback", async () => {
    const dept = await Departments.create({
      adminId: admin._id,
      departmentName: "to-delete",
    });
    const res = await request(app).delete(
      `/api/v1/departments/delete?departmentId=${dept._id}`,
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const remaining = await Departments.find({});
    // The deleted dept is gone but a 'default' fallback dept was created.
    expect(remaining.map((d) => d.departmentName)).toEqual(["default"]);
  });
});
