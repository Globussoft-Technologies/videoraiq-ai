import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

vi.mock("../../core/v1/users/users.controller.js", () => ({
  default: {
    authUserLogin: vi.fn(async (req, res) => res.status(200).json({ success: true, token: "tok" })),
    forgotPassword: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    resetPassword: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    changePassword: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    fetchAuthUser: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    createAuthUser: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "u1" } })),
    updateAuthUser: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteAuthUser: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    bulkDeleteAuthUser: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    isEmailExist: vi.fn(async (req, res) => res.status(200).json({ success: true, exists: false })),
    checkEmpAdmin: vi.fn(async (req, res) => res.status(200).json({ success: true, isAdmin: false })),
    allOrgEmployee: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    importUsers: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getImportProgress: vi.fn(async (req, res) => res.status(200).json({ success: true, progress: 0 })),
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
const { default: usersRoutes } = await import("../../core/v1/users/users.routes.js");

let app;
const token = jwt.sign(
  { memberId: "u1", user_id: 1, adminId: "admin1" },
  config.get("jwt.secretKey"),
  { expiresIn: "1h" }
);

beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/users", usersRoutes));
});

describe("POST /api/v1/users/login", () => {
  it("returns 200 on login", async () => {
    const res = await request(app)
      .post("/api/v1/users/login")
      .send({ email: "user@test.com", password: "secret" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/users/forgot-password", () => {
  it("returns 200", async () => {
    const res = await request(app)
      .post("/api/v1/users/forgot-password")
      .send({ email: "user@test.com" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/users/reset-password", () => {
  it("returns 200", async () => {
    const res = await request(app)
      .post("/api/v1/users/reset-password")
      .send({ token: "reset-tok", password: "newpass" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/users/change-password", () => {
  it("returns 200 with valid token", async () => {
    const res = await request(app)
      .post("/api/v1/users/change-password")
      .set("x-access-token", token)
      .send({ oldPassword: "old", newPassword: "new" });
    expect(res.status).toBe(200);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/v1/users/change-password").send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/users/fetch", () => {
  it("returns 200 with users", async () => {
    const res = await request(app)
      .post("/api/v1/users/fetch")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/users/create", () => {
  it("returns 201 on user creation", async () => {
    const res = await request(app)
      .post("/api/v1/users/create")
      .set("x-access-token", token)
      .send({ email: "new@test.com", firstName: "New", lastName: "User" });
    expect(res.status).toBe(201);
  });
});

describe("PUT /api/v1/users/update", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/users/update")
      .set("x-access-token", token)
      .send({ _id: "u1", firstName: "Updated" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/users/delete", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .delete("/api/v1/users/delete")
      .set("x-access-token", token)
      .send({ _id: "u1" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/users/bulk-delete", () => {
  it("returns 200 on bulk delete", async () => {
    const res = await request(app)
      .delete("/api/v1/users/bulk-delete")
      .set("x-access-token", token)
      .send({ ids: ["u1", "u2"] });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/users/isEmailExist", () => {
  it("returns 200 with existence flag", async () => {
    const res = await request(app)
      .get("/api/v1/users/isEmailExist")
      .set("x-access-token", token)
      .query({ email: "user@test.com" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/users/check-emp-admin", () => {
  it("returns 200", async () => {
    const res = await request(app)
      .post("/api/v1/users/check-emp-admin")
      .set("x-access-token", token)
      .send({ email: "user@test.com" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/users/allOrgEmployee", () => {
  it("returns 200 with employees", async () => {
    const res = await request(app)
      .post("/api/v1/users/allOrgEmployee")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/users/import-users-progress", () => {
  it("returns 200 with progress", async () => {
    const res = await request(app)
      .get("/api/v1/users/import-users-progress")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});
