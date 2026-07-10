import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/attendance/attendance.controller.js", () => ({
  default: {
    getAttendance: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    exportAttendance: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    logAttendance: vi.fn(async (req, res) => res.status(201).json({ success: true })),
    getUserLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: attendanceRoutes } = await import("../../core/v1/attendance/attendance.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/attendance", attendanceRoutes));
});

describe("POST /api/v1/attendance/get", () => {
  it("returns 200 with attendance data", async () => {
    const res = await request(app).post("/api/v1/attendance/get").send({ date: "2024-01-01" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/attendance/export", () => {
  it("returns 200 with export data", async () => {
    const res = await request(app).get("/api/v1/attendance/export");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/attendance/", () => {
  it("returns 201 on log attendance", async () => {
    const res = await request(app)
      .post("/api/v1/attendance/")
      .send({ userId: "u1", timestamp: Date.now() });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/v1/attendance/user-logs", () => {
  it("returns 200 with user logs", async () => {
    const res = await request(app)
      .post("/api/v1/attendance/user-logs")
      .send({ userId: "u1" });
    expect(res.status).toBe(200);
  });
});
