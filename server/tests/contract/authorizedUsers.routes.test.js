import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

vi.mock("../../core/v1/authorizedUsers/authorizedUsers.controller.js", () => ({
  default: {
    fetchAuthUser: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    createAuthUser: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "au1" } })),
    updateAuthUser: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteAuthUser: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteAllAuthUsers: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    bulkImportAuthUser: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    verifyUser: vi.fn(async (req, res) => res.status(200).json({ success: true, verified: true })),
    fetchUniqueLocations: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
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
const { default: authorizedUsersRoutes } = await import("../../core/v1/authorizedUsers/authorizedUsers.routes.js");

let app;
const token = jwt.sign(
  { memberId: "u1", user_id: 1, adminId: "admin1" },
  config.get("jwt.secretKey"),
  { expiresIn: "1h" }
);

beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/authorized-users", authorizedUsersRoutes));
});

describe("POST /api/v1/authorized-users/fetch", () => {
  it("returns 200 with authorized users", async () => {
    const res = await request(app)
      .post("/api/v1/authorized-users/fetch")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/v1/authorized-users/fetch").send({});
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/v1/authorized-users/delete", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .delete("/api/v1/authorized-users/delete")
      .set("x-access-token", token)
      .send({ _id: "au1" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/authorized-users/delete-all", () => {
  it("returns 200 on delete all", async () => {
    const res = await request(app)
      .delete("/api/v1/authorized-users/delete-all")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/authorized-users/bulk-import", () => {
  it("returns 200 on bulk import", async () => {
    const res = await request(app)
      .post("/api/v1/authorized-users/bulk-import")
      .set("x-access-token", token)
      .send({ users: [] });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/authorized-users/fetch-unique-locations", () => {
  it("returns 200 with locations", async () => {
    const res = await request(app)
      .post("/api/v1/authorized-users/fetch-unique-locations")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
  });
});
