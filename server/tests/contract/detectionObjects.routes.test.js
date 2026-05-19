import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/detectionObjects/objects.controller.js", () => ({
  default: {
    getAllObjects: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    createDetectionObjects: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "obj1" } })),
    deleteDetectionObjects: vi.fn(async (req, res) => res.status(200).json({ success: true })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: objectsRoutes } = await import("../../core/v1/detectionObjects/objects.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/objects", objectsRoutes));
});

describe("GET /api/v1/objects/", () => {
  it("returns 200 with all objects", async () => {
    const res = await request(app).get("/api/v1/objects/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [] });
  });
});

describe("POST /api/v1/objects/", () => {
  it("returns 201 on creation", async () => {
    const res = await request(app)
      .post("/api/v1/objects/")
      .send({ name: "Person", type: "human" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/objects/delete", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .post("/api/v1/objects/delete")
      .send({ ids: ["obj1"] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});
