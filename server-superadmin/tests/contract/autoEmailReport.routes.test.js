import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/autoEmailReport/autoEmailReport.controller.js", () => ({
  default: {
    createAutoEmailReport: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "aer1" } })),
    fetchReportDetails: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    updateReport: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteReport: vi.fn(async (req, res) => res.status(200).json({ success: true })),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: autoEmailRoutes } = await import("../../core/v1/autoEmailReport/autoEmailReport.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/auto-email-report", autoEmailRoutes));
});

describe("POST /api/v1/auto-email-report/createAutoEmailReport", () => {
  it("returns 201 on creation", async () => {
    const res = await request(app)
      .post("/api/v1/auto-email-report/createAutoEmailReport")
      .send({ email: "report@test.com", frequency: "daily" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/auto-email-report/get", () => {
  it("returns 200 with report details", async () => {
    const res = await request(app)
      .post("/api/v1/auto-email-report/get")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/auto-email-report/Update", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .post("/api/v1/auto-email-report/Update")
      .send({ _id: "aer1", frequency: "weekly" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/auto-email-report/delete", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app)
      .post("/api/v1/auto-email-report/delete")
      .send({ _id: "aer1" });
    expect(res.status).toBe(200);
  });
});
