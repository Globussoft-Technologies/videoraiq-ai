/**
 * Real vertical Supertest contract for `/api/v1/auto-email-report` — exercises
 * the actual controller + service + Mongo persistence for the create / fetch /
 * delete endpoints.
 *
 * The routes file does NOT attach `verifyToken`, but the service code reads
 * `req.verified.userData.adminId`, so the test mounts a tiny middleware to
 * inject that into the request envelope before the real router runs.
 *
 * Mocks: 0 — pure in-memory Mongo + the auth-inject middleware (which is a
 * test fixture, not a vi.mock).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

const { buildApp } = await import("../helpers/app.js");
const { default: autoEmailRoutes } = await import(
  "../../core/v1/autoEmailReport/autoEmailReport.routes.js"
);
const { default: AutoReport } = await import(
  "../../core/v1/autoEmailReport/autoEmailReport.model.js"
);
const { default: Admin } = await import("../../core/v1/admin/admin.model.js");
await import("../../core/v1/users/users.model.js");

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
    user_id: "ae-real",
    login: "ae-real",
    email: "ae-real@test.com",
  });
  app = buildApp((a) => {
    // Inject the verified envelope the service expects.
    a.use("/api/v1/auto-email-report", (req, _res, next) => {
      req.verified = {
        state: true,
        userData: {
          adminId: admin._id,
          user_id: "ae-real",
          memberId: undefined,
        },
      };
      next();
    });
    a.use("/api/v1/auto-email-report", autoEmailRoutes);
  });
});

/** Unwrap the `{ statusCode, body }` envelope into the inner payload. */
const inner = (res) => res.body?.body ?? res.body;

// ----------------------------------------------------------------------------
// POST /createAutoEmailReport
// ----------------------------------------------------------------------------
describe("POST /api/v1/auto-email-report/createAutoEmailReport (real vertical)", () => {
  it("creates a new report when the body is valid", async () => {
    const res = await request(app)
      .post("/api/v1/auto-email-report/createAutoEmailReport")
      .send({
        reportsTitle: "Daily-Real-1",
        frequency: [{ Daily: 1, Weekly: 0, Monthly: 0 }],
        Recipients: ["a@test.com"],
        Content: [{ task: 1 }],
        filter: { wholeOrganization: 1 },
      });
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    const persisted = await AutoReport.findOne({
      reportsTitle: "Daily-Real-1",
    });
    expect(persisted).not.toBeNull();
    expect(String(persisted.adminId)).toBe(admin._id.toString());
  });

  it("rejects when reportsTitle is missing (validation)", async () => {
    const res = await request(app)
      .post("/api/v1/auto-email-report/createAutoEmailReport")
      .send({
        Recipients: ["b@test.com"],
        Content: [{ task: 1 }],
        filter: { wholeOrganization: 1 },
      });
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("failed");
  });

  it("rejects when the same reportsTitle already exists", async () => {
    await AutoReport.create({
      reportsTitle: "Dup-Title",
      adminId: admin._id,
      Recipients: ["x@test.com"],
      Content: [{ task: 1 }],
      filter: { wholeOrganization: 1 },
    });
    const res = await request(app)
      .post("/api/v1/auto-email-report/createAutoEmailReport")
      .send({
        reportsTitle: "Dup-Title",
        frequency: [{ Daily: 1, Weekly: 0, Monthly: 0 }],
        Recipients: ["y@test.com"],
        Content: [{ task: 1 }],
        filter: { wholeOrganization: 1 },
      });
    expect(res.status).toBe(200);
    expect(inner(res).message).toMatch(/already present/);
  });

  it("rejects when Recipients is empty", async () => {
    const res = await request(app)
      .post("/api/v1/auto-email-report/createAutoEmailReport")
      .send({
        reportsTitle: "Empty-Recipients",
        frequency: [{ Daily: 1, Weekly: 0, Monthly: 0 }],
        Recipients: [],
        Content: [{ task: 1 }],
        filter: { wholeOrganization: 1 },
      });
    expect(res.status).toBe(200);
    expect(inner(res).message).toMatch(/Minimum one user required/);
  });
});

// ----------------------------------------------------------------------------
// POST /get  →  fetchReportDetails
// ----------------------------------------------------------------------------
describe("POST /api/v1/auto-email-report/get (real vertical)", () => {
  it("returns reports scoped to the admin with a totalCount", async () => {
    await AutoReport.create({
      reportsTitle: "Report-A",
      adminId: admin._id,
      Recipients: ["x@test.com"],
      Content: [{ task: 1 }],
      filter: { wholeOrganization: 1 },
    });
    await AutoReport.create({
      reportsTitle: "Report-B",
      adminId: admin._id,
      Recipients: ["y@test.com"],
      Content: [{ task: 1 }],
      filter: { wholeOrganization: 1 },
    });

    const res = await request(app)
      .post("/api/v1/auto-email-report/get")
      .send({});
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.totalCount).toBe(2);
    expect(body.data.autoReportFetch).toHaveLength(2);
  });

  it("filters by searchQuery against reportsTitle", async () => {
    await AutoReport.create({
      reportsTitle: "Alpha-Report",
      adminId: admin._id,
      Recipients: ["x@test.com"],
      Content: [{ task: 1 }],
      filter: { wholeOrganization: 1 },
    });
    await AutoReport.create({
      reportsTitle: "Beta-Report",
      adminId: admin._id,
      Recipients: ["y@test.com"],
      Content: [{ task: 1 }],
      filter: { wholeOrganization: 1 },
    });

    const res = await request(app)
      .post("/api/v1/auto-email-report/get?searchQuery=Alpha")
      .send({});
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.data.totalCount).toBe(1);
    expect(body.data.autoReportFetch[0].reportsTitle).toBe("Alpha-Report");
  });

  it("paginates with skip and limit", async () => {
    for (let i = 0; i < 4; i++) {
      await AutoReport.create({
        reportsTitle: `Page-${i}`,
        adminId: admin._id,
        Recipients: [`page${i}@test.com`],
        Content: [{ task: 1 }],
        filter: { wholeOrganization: 1 },
      });
    }
    const res = await request(app)
      .post("/api/v1/auto-email-report/get?skip=2&limit=2")
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).data.autoReportFetch).toHaveLength(2);
  });
});

// ----------------------------------------------------------------------------
// POST /delete
// ----------------------------------------------------------------------------
describe("POST /api/v1/auto-email-report/delete (real vertical)", () => {
  it("deletes a report owned by the admin", async () => {
    const report = await AutoReport.create({
      reportsTitle: "To-Delete",
      adminId: admin._id,
      Recipients: ["d@test.com"],
      Content: [{ task: 1 }],
      filter: { wholeOrganization: 1 },
    });
    const res = await request(app)
      .post(`/api/v1/auto-email-report/delete?Id=${report._id.toString()}`)
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const left = await AutoReport.countDocuments({});
    expect(left).toBe(0);
  });

  it("fails when no matching report exists for the admin", async () => {
    const res = await request(app)
      .post(
        `/api/v1/auto-email-report/delete?Id=${new mongoose.Types.ObjectId().toString()}`,
      )
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});
