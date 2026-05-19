import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/vehicle/vehicle.controller.js", () => ({
  default: {
    log: vi.fn(async (req, res) => res.status(201).json({ success: true })),
    getVehicles: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getVehicleEntries: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: vehicleRoutes } = await import("../../core/v1/vehicle/vehicle.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/vehicle", vehicleRoutes));
});

describe("POST /api/v1/vehicle/log", () => {
  it("returns 201 on vehicle log", async () => {
    const res = await request(app)
      .post("/api/v1/vehicle/log")
      .send({ plate: "ABC123", timestamp: Date.now() });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/vehicle/vehicles", () => {
  it("returns 200 with vehicles list", async () => {
    const res = await request(app).get("/api/v1/vehicle/vehicles");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [] });
  });
});

describe("GET /api/v1/vehicle/vehicle/:vehicleId", () => {
  it("returns 200 with vehicle entries", async () => {
    const res = await request(app).get("/api/v1/vehicle/vehicle/v123");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});
