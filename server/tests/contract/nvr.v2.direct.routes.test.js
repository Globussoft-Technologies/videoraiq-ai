import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../core/v2/NVR/nvr.service.js", () => ({
  default: {
    createDirectNvr: vi.fn(async (_req, res) => res.status(201).json({ success: true })),
    updateDirectNvr: vi.fn(async (_req, res) => res.status(200).json({ success: true })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: nvrRoutes } = await import("../../core/v2/NVR/nvr.routes.js");

let app;
beforeEach(() => {
  app = buildApp((instance) => instance.use("/api/v2/nvr", nvrRoutes));
});

describe("v2 direct RTSP routes", () => {
  it("exposes create and update only through the v2 router", async () => {
    expect((await request(app).post("/api/v2/nvr/direct").send({})).status).toBe(201);
    expect((await request(app).patch("/api/v2/nvr/direct/507f1f77bcf86cd799439011").send({})).status).toBe(200);
  });
});
