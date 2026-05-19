import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

vi.mock("../../core/v1/verifyRecipients/recipients.controller.js", () => ({
  default: {
    createRecipients: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "r1" } })),
    verify: vi.fn(async (req, res) => res.status(200).json({ success: true, verified: true })),
    resendMailOrSMS: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    fetchRecipients: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    deleteRecipients: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    updateRecipient: vi.fn(async (req, res) => res.status(200).json({ success: true })),
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
const { default: recipientsRoutes } = await import("../../core/v1/verifyRecipients/recipients.routes.js");

let app;
const token = jwt.sign(
  { memberId: "u1", user_id: 1, adminId: "admin1" },
  config.get("jwt.secretKey"),
  { expiresIn: "1h" }
);

beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/recipients", recipientsRoutes));
});

describe("POST /api/v1/recipients/create", () => {
  it("returns 201 on creation", async () => {
    const res = await request(app)
      .post("/api/v1/recipients/create")
      .set("x-access-token", token)
      .send({ email: "recipient@test.com", type: "email" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/v1/recipients/create").send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/recipients/verify", () => {
  it("returns 200 on verify (no auth required)", async () => {
    const res = await request(app)
      .post("/api/v1/recipients/verify")
      .send({ token: "verify-tok" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/recipients/resendMailOrSMS", () => {
  it("returns 200 on resend", async () => {
    const res = await request(app)
      .post("/api/v1/recipients/resendMailOrSMS")
      .set("x-access-token", token)
      .send({ recipientId: "r1" });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/recipients/fetch", () => {
  it("returns 200 with recipients", async () => {
    const res = await request(app)
      .get("/api/v1/recipients/fetch")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("DELETE /api/v1/recipients/delete", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .delete("/api/v1/recipients/delete")
      .set("x-access-token", token)
      .send({ _id: "r1" });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/recipients/update", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/recipients/update")
      .set("x-access-token", token)
      .send({ _id: "r1", email: "updated@test.com" });
    expect(res.status).toBe(200);
  });
});
