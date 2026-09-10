import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../core/v2/measurements/stationToken.middleware.js", () => ({
  default: (req, _res, next) => {
    req.stationToken = { stationId: "aa:bb:cc:dd:ee:ff" };
    next();
  },
}));
vi.mock("../../core/v2/measurements/measurements.controller.js", () => ({
  default: {
    createCapture: vi.fn((req, res) => res.status(201).json({
      route: "capture",
      raw: Buffer.isBuffer(req.body),
    })),
    fetchCapture: vi.fn((req, res) => res.status(200).json({
      route: "fetch",
      filename: req.params.filename,
    })),
    deleteCapture: vi.fn((req, res) => res.status(200).json({
      route: "delete",
      filename: req.params.filename,
    })),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: routes } = await import("../../core/v2/measurements/measurements.routes.js");
const BASE = "/api/v2/measurements";
let app;

beforeEach(() => {
  app = buildApp((instance) => instance.use(BASE, routes));
});

describe("streaming-server measurement capture routes", () => {
  it("accepts a raw JPEG body", async () => {
    const response = await request(app)
      .post(`${BASE}/captures`)
      .set("Content-Type", "image/jpeg")
      .send(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ route: "capture", raw: true });
  });

  it("exposes stored captures by filename", async () => {
    const response = await request(app).get(`${BASE}/captures/example.jpg`);
    expect(response.body).toEqual({ route: "fetch", filename: "example.jpg" });
  });

  it("deletes a station-owned capture", async () => {
    const response = await request(app).delete(`${BASE}/captures/example.jpg`);
    expect(response.body).toEqual({ route: "delete", filename: "example.jpg" });
  });
});
