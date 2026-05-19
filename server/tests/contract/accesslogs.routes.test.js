import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

vi.mock("../../core/v1/accesslogs/accesslogs.controller.js", () => ({
  default: {
    createAccessLog: vi.fn(async (req, res) => res.status(201).json({ success: true })),
    getAccessLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    createAccessLogRecord: vi.fn(async (req, res) => res.status(201).json({ success: true })),
    getLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getUserSessionReport: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
  },
}));

vi.mock("../../core/v1/users/users.model.js", () => ({ default: { findOne: vi.fn().mockResolvedValue(null) } }));
vi.mock("../../core/v1/admin/admin.model.js", () => ({ default: { findById: vi.fn().mockResolvedValue({ _id: "admin1" }) } }));
vi.mock("../../core/v1/roles/roles.model.js", () => ({ default: { aggregate: vi.fn().mockResolvedValue([{ permissionConfig: {} }]) } }));
vi.mock("../../core/v1/cameraRestrictions/authorizedChannels.model.js", () => ({ default: { findOne: vi.fn().mockResolvedValue(null) } }));
vi.mock("../../utils/helperFunctions.js", () => ({
  getEmpAuthInfo: vi.fn().mockResolvedValue({ data: [{ id: "org1" }] }),
  autoSyncLocations: vi.fn(),
  syncPermissionLocations: vi.fn(),
}));
vi.mock("../../middlewares/checkActivePlan.js", () => ({
  checkActivePlan: (req, res, next) => next(),
  checkActivePlanSocket: () => {},
}));
vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: accesslogsRoutes } = await import("../../core/v1/accesslogs/accesslogs.routes.js");

let app;
const token = jwt.sign(
  { memberId: "u1", user_id: 1, adminId: "admin1" },
  config.get("jwt.secretKey"),
  { expiresIn: "1h" }
);

beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/access-logs", accesslogsRoutes));
});

describe("POST /api/v1/access-logs/createAccessLog", () => {
  it("returns 201 (no auth required)", async () => {
    const res = await request(app)
      .post("/api/v1/access-logs/createAccessLog")
      .send({ userId: "u1", action: "login" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/access-logs/getAccessLogs", () => {
  it("returns 200 with logs", async () => {
    const res = await request(app)
      .post("/api/v1/access-logs/getAccessLogs")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/access-logs/create", () => {
  it("returns 201 with valid token", async () => {
    const res = await request(app)
      .post("/api/v1/access-logs/create")
      .set("x-access-token", token)
      .send({ action: "login" });
    expect(res.status).toBe(201);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/v1/access-logs/create").send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/access-logs/get", () => {
  it("returns 200 with valid token", async () => {
    const res = await request(app)
      .post("/api/v1/access-logs/get")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/access-logs/getUserSessionReport", () => {
  it("returns 200 with session report", async () => {
    const res = await request(app)
      .post("/api/v1/access-logs/getUserSessionReport")
      .set("x-access-token", token)
      .send({ userId: "u1" });
    expect(res.status).toBe(200);
  });
});
