import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/authorizedObjects/authorizedObjects.controller.js", () => ({
  default: {
    createAuthorizedObjects: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "ao1" } })),
    fetchAuthorizedObjects: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getAllObjectTypes: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    updateAuthorizedObjects: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteAuthorizedObjects: vi.fn(async (req, res) => res.status(200).json({ success: true })),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: authorizedObjectsRoutes } = await import("../../core/v1/authorizedObjects/authorizedObjects.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/authorized-objects", authorizedObjectsRoutes));
});

describe("POST /api/v1/authorized-objects/create", () => {
  it("returns 201 on creation", async () => {
    const res = await request(app)
      .post("/api/v1/authorized-objects/create")
      .send({ name: "Authorized Object", type: "vehicle" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/authorized-objects/fetch", () => {
  it("returns 200 with objects", async () => {
    const res = await request(app)
      .post("/api/v1/authorized-objects/fetch")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [] });
  });
});

describe("GET /api/v1/authorized-objects/getAllObjectTypes", () => {
  it("returns 200 with types", async () => {
    const res = await request(app).get("/api/v1/authorized-objects/getAllObjectTypes");
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/authorized-objects/update", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/authorized-objects/update")
      .send({ _id: "ao1", name: "Updated" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/authorized-objects/delete", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .delete("/api/v1/authorized-objects/delete")
      .send({ _id: "ao1" });
    expect(res.status).toBe(200);
  });
});
