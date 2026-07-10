import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/Uploads/uploads.controller.js", () => ({
  default: {
    uploadMedia: vi.fn(async (req, res) => res.status(200).json({ success: true, url: "http://test/media.jpg" })),
    fetchMedia: vi.fn(async (req, res) => res.status(200).send("media-content")),
    deleteMedia: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteUserMedia: vi.fn(async (req, res) => res.status(200).json({ success: true })),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: uploadsRoutes } = await import("../../core/v1/Uploads/uploads.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/uploads", uploadsRoutes));
});

describe("POST /api/v1/uploads/media", () => {
  it("returns 200 on media upload", async () => {
    const res = await request(app)
      .post("/api/v1/uploads/media")
      .attach("file", Buffer.from("fake image data"), "test.jpg");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/uploads/:mediaPath", () => {
  it("returns 200 on media fetch", async () => {
    const res = await request(app).get("/api/v1/uploads/images/photo.jpg");
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/uploads/deleteMedia", () => {
  it("returns 200 on media delete", async () => {
    const res = await request(app)
      .delete("/api/v1/uploads/deleteMedia")
      .field("path", "images/photo.jpg");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("DELETE /api/v1/uploads/deleteUserMedia", () => {
  it("returns 200 on user media delete", async () => {
    const res = await request(app)
      .delete("/api/v1/uploads/deleteUserMedia")
      .field("userId", "u1");
    expect(res.status).toBe(200);
  });
});
