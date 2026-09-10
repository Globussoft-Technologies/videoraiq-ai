import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../core/v2/measurementIncidents/measurementIncidents.controller.js", () => ({
  default: {
    createFromQr: vi.fn((req, res) => res.status(201).json({ route: "create-qr" })),
    process: vi.fn((req, res) => res.status(201).json({ route: "process" })),
    list: vi.fn((req, res) => res.status(200).json({ route: "list", query: req.query })),
    findOne: vi.fn((req, res) => res.status(200).json({ route: "find", id: req.params.id })),
    findLatestBySku: vi.fn((req, res) =>
      res.status(200).json({ route: "find-by-sku", sku: req.params.sku }),
    ),
    updateMeasurement: vi.fn((req, res) =>
      res.status(200).json({ route: "measurement", id: req.params.id, ...req.body }),
    ),
    updateMeasurementBySku: vi.fn((req, res) =>
      res.status(200).json({ route: "measurement-by-sku", sku: req.params.sku, ...req.body }),
    ),
    updateStatus: vi.fn((req, res) =>
      res.status(200).json({ route: "status", id: req.params.id, ...req.body }),
    ),
    reset: vi.fn((req, res) =>
      res.status(200).json({ route: "reset", id: req.params.id }),
    ),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: routes } = await import(
  "../../core/v2/measurementIncidents/measurementIncidents.routes.js"
);

const BASE = "/api/v2/measurement-incidents";
const ID = "650000000000000000000501";
let app;

beforeEach(() => {
  app = buildApp((instance) => instance.use(BASE, routes));
});

describe("measurement incident routes", () => {
  it("POST / creates an incident from QR metadata", async () => {
    const response = await request(app).post(BASE).send({});
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ route: "create-qr" });
  });

  it("POST /process starts DS processing", async () => {
    const response = await request(app).post(`${BASE}/process`).send({});
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ route: "process" });
  });

  it("PATCH /:id/status handles accept/reject", async () => {
    const response = await request(app)
      .patch(`${BASE}/${ID}/status`)
      .send({ status: "accepted" });
    expect(response.body).toEqual({ route: "status", id: ID, status: "accepted" });
  });

  it("PATCH /:id/measurement accepts DS measured data", async () => {
    const response = await request(app)
      .patch(`${BASE}/${ID}/measurement`)
      .send({ measuredData: { length: 77.9 } });
    expect(response.body).toEqual({
      route: "measurement",
      id: ID,
      measuredData: { length: 77.9 },
    });
  });

  it("PATCH /by-sku/:sku/measurement accepts DS data without an incident id", async () => {
    const response = await request(app)
      .patch(`${BASE}/by-sku/G_OK8478/measurement`)
      .send({ measuredData: { length: 77.9 } });
    expect(response.body).toEqual({
      route: "measurement-by-sku",
      sku: "G_OK8478",
      measuredData: { length: 77.9 },
    });
  });

  it("GET /:id fetches the current incident", async () => {
    const response = await request(app).get(`${BASE}/${ID}`);
    expect(response.body).toEqual({ route: "find", id: ID });
  });

  it("GET / lists station Measurement Incidents", async () => {
    const response = await request(app).get(`${BASE}?stationId=88:a2:9e:d0:95:ec&limit=20`);
    expect(response.body).toEqual({
      route: "list",
      query: { stationId: "88:a2:9e:d0:95:ec", limit: "20" },
    });
  });

  it("GET /by-sku/:sku fetches the latest matching incident", async () => {
    const response = await request(app).get(`${BASE}/by-sku/G_OK8478`);
    expect(response.body).toEqual({ route: "find-by-sku", sku: "G_OK8478" });
  });

  it("DELETE /:id handles reset", async () => {
    const response = await request(app).delete(`${BASE}/${ID}`);
    expect(response.body).toEqual({ route: "reset", id: ID });
  });
});
