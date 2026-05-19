import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

vi.mock("../../core/v1/locations/location.controller.js", () => ({
  default: {
    createLocation: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "loc1" } })),
    fetchLocations: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getLocationById: vi.fn(async (req, res) => res.status(200).json({ success: true, data: {} })),
    updateLocation: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteLocation: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    fetchEmployeeLocation: vi.fn(async (req, res) => res.status(200).json({ success: true, data: {} })),
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
const { default: locationsRoutes } = await import("../../core/v1/locations/location.routes.js");

let app;
const token = jwt.sign(
  { memberId: "u1", user_id: 1, adminId: "admin1" },
  config.get("jwt.secretKey"),
  { expiresIn: "1h" }
);

beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/locations", locationsRoutes));
});

describe("POST /api/v1/locations/create", () => {
  it("returns 201 on creation", async () => {
    const res = await request(app)
      .post("/api/v1/locations/create")
      .set("x-access-token", token)
      .send({ name: "HQ", address: "123 Main St" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/v1/locations/create").send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/locations/fetch", () => {
  it("returns 200 with locations", async () => {
    const res = await request(app)
      .post("/api/v1/locations/fetch")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/locations/fetch-by-id", () => {
  it("returns 200 with location", async () => {
    const res = await request(app)
      .post("/api/v1/locations/fetch-by-id")
      .set("x-access-token", token)
      .send({ _id: "loc1" });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/locations/update", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/locations/update")
      .set("x-access-token", token)
      .send({ _id: "loc1", name: "Updated HQ" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/locations/delete", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .delete("/api/v1/locations/delete")
      .set("x-access-token", token)
      .send({ _id: "loc1" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/locations/employee-location", () => {
  it("returns 200 with employee location", async () => {
    const res = await request(app)
      .post("/api/v1/locations/employee-location")
      .set("x-access-token", token)
      .send({ employeeId: "emp1" });
    expect(res.status).toBe(200);
  });
});
