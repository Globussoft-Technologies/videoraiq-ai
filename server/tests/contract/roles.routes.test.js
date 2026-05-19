import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

vi.mock("../../core/v1/roles/roles.controller.js", () => ({
  default: {
    createRoles: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "role1" } })),
    get: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    update: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    delete: vi.fn(async (req, res) => res.status(200).json({ success: true })),
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
const { default: rolesRoutes } = await import("../../core/v1/roles/roles.routes.js");

let app;
const token = jwt.sign(
  { memberId: "u1", user_id: 1, adminId: "admin1" },
  config.get("jwt.secretKey"),
  { expiresIn: "1h" }
);

beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/roles", rolesRoutes));
});

describe("POST /api/v1/roles/create", () => {
  it("returns 201 on role creation", async () => {
    const res = await request(app)
      .post("/api/v1/roles/create")
      .set("x-access-token", token)
      .send({ roleName: "Supervisor", permissionConfig: {} });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/v1/roles/create").send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/roles/get", () => {
  it("returns 200 with roles", async () => {
    const res = await request(app)
      .post("/api/v1/roles/get")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("PUT /api/v1/roles/update", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/roles/update")
      .set("x-access-token", token)
      .send({ _id: "role1", roleName: "Updated Role" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/roles/delete", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .delete("/api/v1/roles/delete")
      .set("x-access-token", token)
      .send({ _id: "role1" });
    expect(res.status).toBe(200);
  });
});
