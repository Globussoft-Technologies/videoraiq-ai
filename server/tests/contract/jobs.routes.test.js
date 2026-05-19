import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/jobs/jobs.controller.js", () => ({
  default: {
    mockCreateJobs: vi.fn(async (req, res) => res.status(201).json({ success: true, created: 5 })),
    mockDeleteAllJobs: vi.fn(async (req, res) => res.status(200).json({ success: true, deleted: 5 })),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: jobsRoutes } = await import("../../core/v1/jobs/jobs.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/jobs", jobsRoutes));
});

describe("POST /api/v1/jobs/mock", () => {
  it("returns 201 with mock jobs created", async () => {
    const res = await request(app)
      .post("/api/v1/jobs/mock")
      .send({ count: 5 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("DELETE /api/v1/jobs/mock", () => {
  it("returns 200 on mock jobs delete", async () => {
    const res = await request(app).delete("/api/v1/jobs/mock");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});
