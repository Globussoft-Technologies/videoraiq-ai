import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.controller.js", () => ({
  default: {
    create: vi.fn(async (_req, res) => res.status(201).json({ success: true })),
    list: vi.fn(async (_req, res) => res.status(200).json({ success: true })),
    audienceOptions: vi.fn(async (_req, res) => res.status(200).json({ success: true })),
    getById: vi.fn(async (_req, res) => res.status(200).json({ success: true })),
    update: vi.fn(async (_req, res) => res.status(200).json({ success: true })),
    remove: vi.fn(async (_req, res) => res.status(200).json({ success: true })),
    preview: vi.fn(async (_req, res) => res.status(200).json({ success: true })),
    sendNow: vi.fn(async (_req, res) => res.status(200).json({ success: true })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: routes } = await import("../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.routes.js");

let app;
beforeEach(() => {
  app = buildApp((expressApp) => expressApp.use("/api/v2/attendance-auto-email-reports", routes));
});

describe("attendance auto email report UI routes", () => {
  it("exposes list, create, detail, update, delete, preview and send-now", async () => {
    expect((await request(app).get("/api/v2/attendance-auto-email-reports")).status).toBe(200);
    expect((await request(app).post("/api/v2/attendance-auto-email-reports").send({})).status).toBe(201);
    expect((await request(app).get("/api/v2/attendance-auto-email-reports/audience-options")).status).toBe(200);
    expect((await request(app).get("/api/v2/attendance-auto-email-reports/abc")).status).toBe(200);
    expect((await request(app).put("/api/v2/attendance-auto-email-reports/abc").send({ enabled: false })).status).toBe(200);
    expect((await request(app).delete("/api/v2/attendance-auto-email-reports/abc")).status).toBe(200);
    expect((await request(app).post("/api/v2/attendance-auto-email-reports/abc/preview")).status).toBe(200);
    expect((await request(app).post("/api/v2/attendance-auto-email-reports/abc/send-now")).status).toBe(200);
  });
});
