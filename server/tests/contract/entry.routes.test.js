import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/entry/entry.controller.js", () => ({
  default: {
    register: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "entry1" } })),
    log: vi.fn(async (req, res) => res.status(201).json({ success: true })),
    get: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getUsers: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getUserEntries: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: entryRoutes } = await import("../../core/v1/entry/entry.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/entry", entryRoutes));
});

describe("POST /api/v1/entry/register", () => {
  it("returns 201 on registration", async () => {
    const res = await request(app)
      .post("/api/v1/entry/register")
      .send({ userId: "u1", type: "face" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/entry/log", () => {
  it("returns 201 on log entry", async () => {
    const res = await request(app)
      .post("/api/v1/entry/log")
      .send({ userId: "u1", timestamp: Date.now(), type: "check-in" });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/entry/get", () => {
  it("returns 200 with entries", async () => {
    const res = await request(app).get("/api/v1/entry/get");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/entry/users", () => {
  it("returns 200 with users", async () => {
    const res = await request(app).get("/api/v1/entry/users");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/entry/user/:userId", () => {
  it("returns 200 with user entries", async () => {
    const res = await request(app).get("/api/v1/entry/user/u123");
    expect(res.status).toBe(200);
  });
});
