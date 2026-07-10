import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

vi.mock("../../core/v1/storage/storage.controller.js", () => ({
  default: {
    getStorages: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    addStorage: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "s1" } })),
    uploadFile: vi.fn(async (req, res) => res.status(200).json({ success: true, url: "http://test/file.mp4" })),
    activateStorage: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    smartStreamFile: vi.fn(async (req, res) => res.status(200).send("stream")),
    streamFile: vi.fn(async (req, res) => res.status(200).send("stream")),
    googleAuthCallback: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    updateStorage: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteStorage: vi.fn(async (req, res) => res.status(200).json({ success: true })),
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
const { default: storageRoutes } = await import("../../core/v1/storage/storage.routes.js");

let app;
const token = jwt.sign(
  { memberId: "u1", user_id: 1, adminId: "admin1" },
  config.get("jwt.secretKey"),
  { expiresIn: "1h" }
);

beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/storage", storageRoutes));
});

describe("GET /api/v1/storage/", () => {
  it("returns 200 with storages", async () => {
    const res = await request(app)
      .get("/api/v1/storage/")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/v1/storage/");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/storage/", () => {
  it("returns 201 on add storage", async () => {
    const res = await request(app)
      .post("/api/v1/storage/")
      .set("x-access-token", token)
      .send({ type: "local", path: "/data/videos" });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/v1/storage/upload", () => {
  it("returns 200 on file upload (no auth)", async () => {
    const res = await request(app)
      .post("/api/v1/storage/upload")
      .attach("file", Buffer.from("fake video"), "test.mp4");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("PUT /api/v1/storage/activate", () => {
  it("returns 200 on activate", async () => {
    const res = await request(app)
      .put("/api/v1/storage/activate")
      .set("x-access-token", token)
      .send({ storageId: "s1" });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/storage/stream/:id", () => {
  it("returns 200 on stream", async () => {
    const res = await request(app).get("/api/v1/storage/stream/file123");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/storage/auth/google/callback", () => {
  it("returns 200 on google callback", async () => {
    const res = await request(app).get("/api/v1/storage/auth/google/callback");
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/storage/:id", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/storage/s123")
      .set("x-access-token", token)
      .send({ path: "/new/path" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/storage/:id", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .delete("/api/v1/storage/s123")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});
