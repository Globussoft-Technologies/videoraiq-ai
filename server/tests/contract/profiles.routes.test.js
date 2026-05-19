import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/profiles/profiles.controller.js", () => ({
  default: {
    getProfiles: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    addProfile: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "p1" } })),
    exportProfile: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    bulkExportProfiles: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    bulkDeleteProfiles: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    importProfile: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getProfileById: vi.fn(async (req, res) => res.status(200).json({ success: true, data: { _id: req.params.id } })),
    editProfile: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteProfile: vi.fn(async (req, res) => res.status(200).json({ success: true })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: profilesRoutes } = await import("../../core/v1/profiles/profiles.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/profiles", profilesRoutes));
});

describe("GET /api/v1/profiles/", () => {
  it("returns 200 with profiles list", async () => {
    const res = await request(app).get("/api/v1/profiles/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/profiles/", () => {
  it("returns 201 on profile creation", async () => {
    const res = await request(app)
      .post("/api/v1/profiles/")
      .send({ name: "John Doe", employeeId: "emp1" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/profiles/export/:id", () => {
  it("returns 200 on profile export", async () => {
    const res = await request(app).get("/api/v1/profiles/export/p123");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/profiles/bulk-export", () => {
  it("returns 200 on bulk export", async () => {
    const res = await request(app)
      .post("/api/v1/profiles/bulk-export")
      .send({ ids: ["p1", "p2"] });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/profiles/bulk-delete", () => {
  it("returns 200 on bulk delete", async () => {
    const res = await request(app)
      .post("/api/v1/profiles/bulk-delete")
      .send({ ids: ["p1", "p2"] });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/profiles/:id", () => {
  it("returns 200 with profile by id", async () => {
    const res = await request(app).get("/api/v1/profiles/p123");
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe("p123");
  });
});

describe("PUT /api/v1/profiles/:id", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/profiles/p123")
      .send({ name: "Jane Doe" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/profiles/:id", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app).delete("/api/v1/profiles/p123");
    expect(res.status).toBe(200);
  });
});
