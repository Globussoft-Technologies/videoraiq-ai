import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

vi.mock("../../core/v1/cameraRestrictions/authorizedChannels.controller.js", () => ({
  default: {
    fetchChannels: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    fetchLocations: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    fetchDepartments: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    fetchNVRS: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    fetchChannelByNVRsOrDepartment: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
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
const { default: cameraRestrictionsRoutes } = await import("../../core/v1/cameraRestrictions/authorizedChannels.routes.js");

let app;
const token = jwt.sign(
  { memberId: "u1", user_id: 1, adminId: "admin1" },
  config.get("jwt.secretKey"),
  { expiresIn: "1h" }
);

beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/camera-restrictions", cameraRestrictionsRoutes));
});

describe("POST /api/v1/camera-restrictions/fetchChannels", () => {
  it("returns 200 with channels", async () => {
    const res = await request(app)
      .post("/api/v1/camera-restrictions/fetchChannels")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/v1/camera-restrictions/fetchChannels").send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/camera-restrictions/locations", () => {
  it("returns 200 with locations", async () => {
    const res = await request(app)
      .post("/api/v1/camera-restrictions/locations")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/camera-restrictions/departments", () => {
  it("returns 200 with departments", async () => {
    const res = await request(app)
      .post("/api/v1/camera-restrictions/departments")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/camera-restrictions/getNVRS", () => {
  it("returns 200 with NVRs", async () => {
    const res = await request(app)
      .post("/api/v1/camera-restrictions/getNVRS")
      .set("x-access-token", token)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/camera-restrictions/getChannels", () => {
  it("returns 200 with channels by NVR or department", async () => {
    const res = await request(app)
      .post("/api/v1/camera-restrictions/getChannels")
      .set("x-access-token", token)
      .send({ nvrId: "nvr1" });
    expect(res.status).toBe(200);
  });
});
