import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { makeUser, signJwt, completePermissionConfig } from "../helpers/factory.js";

vi.mock("../../core/v1/NVR/nvr.service.js", () => ({
  default: {
    getNVRLocations: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getAllNvrs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    allNvrs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    registerNvr: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "nvr1" } })),
    addNvr: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "nvr2" } })),
    getNVRsWithChannels: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    updateNvrChannels: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteAllNvrs: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    updateNvr: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteNvr: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getNvrById: vi.fn(async (req, res) => res.status(200).json({ success: true, data: { _id: req.params.id } })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: nvrRoutes } = await import("../../core/v1/NVR/nvr.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/nvr", nvrRoutes));
});

const token = signJwt({ ...makeUser(), adminId: "000000000000000000000001" });

describe("GET /api/v1/nvr/locations", () => {
  it("returns 200 with data array", async () => {
    const res = await request(app).get("/api/v1/nvr/locations").set("x-access-token", token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/nvr/", () => {
  it("returns 200 with nvr list", async () => {
    const res = await request(app).get("/api/v1/nvr/").set("x-access-token", token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/nvr/all-nvrs", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/nvr/all-nvrs").set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/nvr/register", () => {
  it("returns 201 on successful registration", async () => {
    const res = await request(app)
      .post("/api/v1/nvr/register")
      .set("x-access-token", token)
      .send({ ip: "192.168.1.1", port: 554, brand: "Hikvision" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/nvr/add-nvr", () => {
  it("returns 201 on add", async () => {
    const res = await request(app)
      .post("/api/v1/nvr/add-nvr")
      .set("x-access-token", token)
      .send({ ip: "192.168.1.2", port: 554 });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/nvr/with-channels", () => {
  it("returns 200 with channels", async () => {
    const res = await request(app).get("/api/v1/nvr/with-channels").set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/nvr/refetch/:id", () => {
  it("returns 200 on channel refetch", async () => {
    const res = await request(app)
      .patch("/api/v1/nvr/refetch/nvr123")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/nvr/delete-all", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/nvr/delete-all").set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/nvr/:id", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .patch("/api/v1/nvr/nvr123")
      .set("x-access-token", token)
      .send({ name: "Updated NVR" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/nvr/:id", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .delete("/api/v1/nvr/nvr123")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/nvr/:id", () => {
  it("returns 200 with nvr by id", async () => {
    const res = await request(app).get("/api/v1/nvr/nvr123").set("x-access-token", token);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe("nvr123");
  });
});
