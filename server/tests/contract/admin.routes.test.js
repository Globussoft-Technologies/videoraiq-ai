import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

vi.mock("../../core/v1/admin/admin.controller.js", () => ({
  default: {
    signUP: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "admin1" } })),
    fetch: vi.fn(async (req, res) => res.status(200).json({ success: true, data: {} })),
    updateAdmin: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getEmpEmployees: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    importEMPUsers: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    addEMPEmails: vi.fn(async (req, res) => res.status(201).json({ success: true })),
    getEMPEmails: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    updateEMPEmail: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteEMPEmail: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getLocationByEmpEmail: vi.fn(async (req, res) => res.status(200).json({ success: true, data: {} })),
    getDeletionProgress: vi.fn(async (req, res) => res.status(200).json({ success: true, progress: 0 })),
    updateLogsSound: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    fetchLogsSound: vi.fn(async (req, res) => res.status(200).json({ success: true, enabled: false })),
    fetchTimezone: vi.fn(async (req, res) => res.status(200).json({ success: true, data: {} })),
    getTimezones: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    updateTimezone: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getAllowedDetections: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    updateAllowedDetections: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    updateStreamHost: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    updateRetention: vi.fn(async (req, res) => res.status(200).json({ success: true })),
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

const { buildApp } = await import("../helpers/app.js");
const { default: adminRoutes } = await import("../../core/v1/admin/admin.routes.js");

let app;
const token = jwt.sign(
  { memberId: "u1", user_id: 1, adminId: "admin1" },
  config.get("jwt.secretKey"),
  { expiresIn: "1h" }
);

beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/admin", adminRoutes));
});

describe("POST /api/v1/admin/signUp", () => {
  it("returns 201 on signup", async () => {
    const res = await request(app)
      .post("/api/v1/admin/signUp")
      .send({ email: "admin@test.com", password: "secret" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/admin/fetch", () => {
  it("returns 200 for authenticated admin", async () => {
    const res = await request(app)
      .get("/api/v1/admin/fetch")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/v1/admin/fetch");
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/v1/admin/update", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/admin/update")
      .send({ name_f: "Updated Admin" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/admin/get-emp-employees-by-organization", () => {
  it("returns 200 with employees", async () => {
    const res = await request(app)
      .post("/api/v1/admin/get-emp-employees-by-organization")
      .set("x-access-token", token)
      .send({ orgId: "org1" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/admin/add-emp-emails", () => {
  it("returns 201 on email add", async () => {
    const res = await request(app)
      .post("/api/v1/admin/add-emp-emails")
      .set("x-access-token", token)
      .send({ emails: ["user@test.com"] });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/admin/get-emp-emails", () => {
  it("returns 200 with emails", async () => {
    const res = await request(app)
      .get("/api/v1/admin/get-emp-emails")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/admin/update-emp-email", () => {
  it("returns 200 on email update", async () => {
    const res = await request(app)
      .put("/api/v1/admin/update-emp-email")
      .set("x-access-token", token)
      .send({ oldEmail: "old@test.com", newEmail: "new@test.com" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/admin/delete-emp-email", () => {
  it("returns 200 on email delete", async () => {
    const res = await request(app)
      .delete("/api/v1/admin/delete-emp-email")
      .set("x-access-token", token)
      .send({ email: "user@test.com" });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/admin/get-location-by-emp-email", () => {
  it("returns 200 with location", async () => {
    const res = await request(app)
      .get("/api/v1/admin/get-location-by-emp-email")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/admin/delete-emp-email-progress", () => {
  it("returns 200 with progress", async () => {
    const res = await request(app)
      .get("/api/v1/admin/delete-emp-email-progress")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/admin/update-logs-sound", () => {
  it("returns 200", async () => {
    const res = await request(app)
      .put("/api/v1/admin/update-logs-sound")
      .set("x-access-token", token)
      .send({ enabled: true });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/admin/fetch-logs-sound", () => {
  it("returns 200", async () => {
    const res = await request(app)
      .get("/api/v1/admin/fetch-logs-sound")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});
