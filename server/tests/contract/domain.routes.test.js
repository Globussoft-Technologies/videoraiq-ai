import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/domain/domain.controller.js", () => ({
  default: {
    registerDomain: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "domain1" } })),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: domainRoutes } = await import("../../core/v1/domain/domain.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/domain", domainRoutes));
});

describe("POST /api/v1/domain/register", () => {
  it("returns 201 on domain registration", async () => {
    const res = await request(app)
      .post("/api/v1/domain/register")
      .send({ domain: "example.com", adminId: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});
