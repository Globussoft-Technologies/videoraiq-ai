import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/alerts/alerts.controller.js", () => ({
  default: {
    createAlert: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "alert1" } })),
    updateAlert: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    fetchAllAlerts: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    deleteAlerts: vi.fn(async (req, res) => res.status(200).json({ success: true })),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: alertsRoutes } = await import("../../core/v1/alerts/alerts.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/alerts", alertsRoutes));
});

describe("POST /api/v1/alerts/create", () => {
  it("returns 201 on alert creation", async () => {
    const res = await request(app)
      .post("/api/v1/alerts/create")
      .send({ type: "motion", channelId: "ch1" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/alerts/update", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .post("/api/v1/alerts/update")
      .send({ _id: "alert1", type: "intrusion" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/alerts/fetch", () => {
  it("returns 200 with alert list", async () => {
    const res = await request(app).get("/api/v1/alerts/fetch");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [] });
  });
});

describe("DELETE /api/v1/alerts/delete", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .delete("/api/v1/alerts/delete")
      .send({ _id: "alert1" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});
