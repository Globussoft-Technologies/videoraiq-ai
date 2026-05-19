import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/dashboard/dashboard.controller.js", () => ({
  default: {
    headerStats: vi.fn(async (req, res) => res.status(200).json({ success: true, data: {} })),
    criticalityStats: vi.fn(async (req, res) => res.status(200).json({ success: true, data: {} })),
    detectionChart: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    WeeklyComparisonChart: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getSidebarConfig: vi.fn(async (req, res) => res.status(200).json({ success: true, config: {} })),
    updateSidebarConfig: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getIncidentsByType: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    recentIncidents: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getDetections: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: dashboardRoutes } = await import("../../core/v1/dashboard/dashboard.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/dashboard", dashboardRoutes));
});

describe("POST /api/v1/dashboard/headerStats", () => {
  it("returns 200 with stats", async () => {
    const res = await request(app).post("/api/v1/dashboard/headerStats").send({ adminId: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/dashboard/criticalityStats", () => {
  it("returns 200", async () => {
    const res = await request(app).post("/api/v1/dashboard/criticalityStats").send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/dashboard/detectionChart", () => {
  it("returns 200 with chart data", async () => {
    const res = await request(app).post("/api/v1/dashboard/detectionChart").send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/dashboard/dashboardWeeklyComparisonChart", () => {
  it("returns 200", async () => {
    const res = await request(app).post("/api/v1/dashboard/dashboardWeeklyComparisonChart").send({});
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/dashboard/getSidebarConfig", () => {
  it("returns 200 with config", async () => {
    const res = await request(app).get("/api/v1/dashboard/getSidebarConfig");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("PUT /api/v1/dashboard/updateSidebarConfig", () => {
  it("returns 200 on config update", async () => {
    const res = await request(app).put("/api/v1/dashboard/updateSidebarConfig").send({ config: {} });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/dashboard/getIncidentsByType", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/dashboard/getIncidentsByType");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/dashboard/recentIncidents", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/dashboard/recentIncidents");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/dashboard/getDetections", () => {
  it("returns 200", async () => {
    const res = await request(app).post("/api/v1/dashboard/getDetections").send({});
    expect(res.status).toBe(200);
  });
});
