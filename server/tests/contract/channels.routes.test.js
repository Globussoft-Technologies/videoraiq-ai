import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/channels/channels.controller.js", () => ({
  default: {
    getAllChannels: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getAllChannelsByNvrId: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    toggleDetection: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    updateChannel: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteChannel: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    bulkUpdateChannels: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    updateChannelConfiguration: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getPlaybackUrl: vi.fn(async (req, res) => res.status(200).json({ success: true, url: "rtsp://test" })),
    getPlaybackTimeline: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getPlaybackWithFilters: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getFilterAllChannels: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getChannelById: vi.fn(async (req, res) => res.status(200).json({ success: true, data: { _id: req.params.id } })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: channelsRoutes } = await import("../../core/v1/channels/channels.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/channels", channelsRoutes));
});

describe("GET /api/v1/channels/", () => {
  it("returns 200 with channels list", async () => {
    const res = await request(app).get("/api/v1/channels/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/channels/nvr/:nvrId", () => {
  it("returns 200 with channels for nvr", async () => {
    const res = await request(app).get("/api/v1/channels/nvr/nvr123");
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/channels/detection/toggle", () => {
  it("returns 200 on toggle", async () => {
    const res = await request(app)
      .put("/api/v1/channels/detection/toggle")
      .send({ channelId: "ch1", enabled: true });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/channels/channels/bulk-update", () => {
  it("returns 200 on bulk update", async () => {
    const res = await request(app)
      .put("/api/v1/channels/channels/bulk-update")
      .send({ ids: ["ch1", "ch2"], update: { isActive: true } });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/channels/updateConfiguration", () => {
  it("returns 200 on config update", async () => {
    const res = await request(app)
      .put("/api/v1/channels/updateConfiguration")
      .send({ channelId: "ch1", config: {} });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/channels/playback-url", () => {
  it("returns 200 with playback url", async () => {
    const res = await request(app)
      .post("/api/v1/channels/playback-url")
      .send({ channelId: "ch1" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/channels/playback-timeline", () => {
  it("returns 200 with timeline data", async () => {
    const res = await request(app)
      .post("/api/v1/channels/playback-timeline")
      .send({ channelId: "ch1", date: "2024-01-01" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/channels/playBackFilters", () => {
  it("returns 200 with filters", async () => {
    const res = await request(app)
      .post("/api/v1/channels/playBackFilters")
      .send({ channelId: "ch1" });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/channels/all-channels", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/channels/all-channels");
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/channels/:id", () => {
  it("returns 200 on channel update", async () => {
    const res = await request(app)
      .put("/api/v1/channels/ch123")
      .send({ name: "Updated Channel" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/channels/:id", () => {
  it("returns 200 on delete", async () => {
    const res = await request(app).delete("/api/v1/channels/ch123");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/channels/:id", () => {
  it("returns 200 with channel by id", async () => {
    const res = await request(app).get("/api/v1/channels/ch123");
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe("ch123");
  });
});
