import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/shifts/shifts.controller.js", () => ({
  default: {
    getAllShifts: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    createShift: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "shift1" } })),
    getShiftList: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getShiftById: vi.fn(async (req, res) => res.status(200).json({ success: true, data: { _id: req.params.id } })),
    updateShift: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteShift: vi.fn(async (req, res) => res.status(200).json({ success: true })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: shiftsRoutes } = await import("../../core/v1/shifts/shifts.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/shifts", shiftsRoutes));
});

describe("GET /api/v1/shifts/", () => {
  it("returns 200 with all shifts", async () => {
    const res = await request(app).get("/api/v1/shifts/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [] });
  });
});

describe("POST /api/v1/shifts/", () => {
  it("returns 201 on shift creation", async () => {
    const res = await request(app)
      .post("/api/v1/shifts/")
      .send({ name: "Morning Shift", startTime: "09:00", endTime: "17:00" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/shifts/list", () => {
  it("returns 200 with shift list", async () => {
    const res = await request(app).get("/api/v1/shifts/list");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/shifts/:id", () => {
  it("returns 200 with shift by id", async () => {
    const res = await request(app).get("/api/v1/shifts/shift123");
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe("shift123");
  });
});

describe("PUT /api/v1/shifts/:id", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/shifts/shift123")
      .send({ name: "Evening Shift" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/shifts/:id", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app).delete("/api/v1/shifts/shift123");
    expect(res.status).toBe(200);
  });
});
