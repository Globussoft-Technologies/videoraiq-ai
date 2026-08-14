import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/detectionSettings/detectionSettings.controller.js", () => ({
  default: {
    getAllDetectionSettings: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    createDetectionSettings: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "ds1" } })),
    getDetectionExamples: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getDetectionTypes: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getDetectionSettings: vi.fn(async (req, res) => res.status(200).json({ success: true, data: { _id: req.params.id } })),
    updateDetectionSettings: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    resetDetectionThresholds: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    resetCameraDetectionThresholds: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteDetectionSettings: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getDetectionSchedule: vi.fn(async (req, res) => res.status(200).json({ success: true, data: { detectionSettingId: req.params.id, schedules: [] } })),
    getCameraDetectionSchedule: vi.fn(async (req, res) => res.status(200).json({ success: true, data: { detectionSettingId: req.params.id, channelId: req.params.channelId, schedule: { mode: "always" } } })),
    updateCameraDetectionSchedule: vi.fn(async (req, res) => res.status(200).json({ success: true, data: { detectionSettingId: req.params.id, channelId: req.params.channelId, schedule: req.body } })),
    resetCameraDetectionSchedule: vi.fn(async (req, res) => res.status(200).json({ success: true, data: { detectionSettingId: req.params.id, channelId: req.params.channelId, enabled: false, schedule: { mode: "always" } } })),
    attachDetectionSetting: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    detachDetectionSetting: vi.fn(async (req, res) => res.status(200).json({ success: true })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: detectionSettingsRoutes } = await import("../../core/v1/detectionSettings/detectionSettings.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/detection-settings", detectionSettingsRoutes));
});

describe("GET /api/v1/detection-settings/", () => {
  it("returns 200 with all detection settings", async () => {
    const res = await request(app).get("/api/v1/detection-settings/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/detection-settings/", () => {
  it("returns 201 on creation", async () => {
    const res = await request(app)
      .post("/api/v1/detection-settings/")
      .send({ type: "motion", config: {} });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/detection-settings/examples", () => {
  it("returns 200 with examples", async () => {
    const res = await request(app).get("/api/v1/detection-settings/examples");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/detection-settings/types", () => {
  it("returns 200 with types", async () => {
    const res = await request(app).get("/api/v1/detection-settings/types");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/detection-settings/:id", () => {
  it("returns 200 with detection setting by id", async () => {
    const res = await request(app).get("/api/v1/detection-settings/ds123");
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe("ds123");
  });
});

describe("GET /api/v1/detection-settings/:id/schedule", () => {
  it("returns 200 with schedules for linked cameras", async () => {
    const res = await request(app).get("/api/v1/detection-settings/ds123/schedule");
    expect(res.status).toBe(200);
    expect(res.body.data.detectionSettingId).toBe("ds123");
  });
});

describe("GET /api/v1/detection-settings/:id/schedule/:channelId", () => {
  it("returns 200 with schedule for one linked camera", async () => {
    const res = await request(app).get("/api/v1/detection-settings/ds123/schedule/ch123");
    expect(res.status).toBe(200);
    expect(res.body.data.channelId).toBe("ch123");
  });
});

describe("PUT /api/v1/detection-settings/:id/schedule/:channelId", () => {
  it("returns 200 when updating one linked camera schedule", async () => {
    const res = await request(app)
      .put("/api/v1/detection-settings/ds123/schedule/ch123")
      .send({ mode: "always" });
    expect(res.status).toBe(200);
    expect(res.body.data.schedule).toEqual({ mode: "always" });
  });
});

describe("DELETE /api/v1/detection-settings/:id/schedule/:channelId", () => {
  it("returns 200 when resetting one linked camera schedule", async () => {
    const res = await request(app).delete("/api/v1/detection-settings/ds123/schedule/ch123");
    expect(res.status).toBe(200);
    expect(res.body.data.schedule).toEqual({ mode: "always" });
  });
});

describe("PUT /api/v1/detection-settings/:id", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/detection-settings/ds123")
      .send({ config: { threshold: 0.8 } });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/detection-settings/reset-thresholds/batch", () => {
  it("returns 200 when resetting multiple settings for one camera", async () => {
    const res = await request(app)
      .put("/api/v1/detection-settings/reset-thresholds/batch")
      .send({ channelId: "ch1", detectionSettingIds: ["ds1", "ds2"] });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/detection-settings/:id", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app).delete("/api/v1/detection-settings/ds123");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/detection-settings/attach", () => {
  it("returns 200 on attach", async () => {
    const res = await request(app)
      .post("/api/v1/detection-settings/attach")
      .send({ settingId: "ds1", channelId: "ch1" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/detection-settings/detach", () => {
  it("returns 200 on detach", async () => {
    const res = await request(app)
      .post("/api/v1/detection-settings/detach")
      .send({ settingId: "ds1", channelId: "ch1" });
    expect(res.status).toBe(200);
  });
});
