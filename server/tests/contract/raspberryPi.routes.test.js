import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../middlewares/verifyToken.js", () => ({
  default: (req, _res, next) => {
    req.verified = { userData: { adminId: "650000000000000000000001" } };
    next();
  },
}));

vi.mock("../../core/v2/raspberryPi/raspberryPi.controller.js", () => ({
  default: {
    register: vi.fn((_req, res) => res.status(200).json({ route: "register" })),
    registrationStatus: vi.fn((req, res) =>
      res.status(200).json({ route: "status", code: req.params.code }),
    ),
    heartbeat: vi.fn((_req, res) => res.status(200).json({ route: "heartbeat" })),
    adminRegistrations: vi.fn((req, res) =>
      res.status(200).json({ route: "registrations", code: req.query.code || null }),
    ),
    updateApproval: vi.fn((req, res) =>
      res.status(200).json({ route: "approval", code: req.params.code, status: req.body.status }),
    ),
    deleteRegistration: vi.fn((req, res) =>
      res.status(200).json({ route: "delete", code: req.params.code }),
    ),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: routes } = await import("../../core/v2/raspberryPi/raspberryPi.routes.js");
const BASE = "/api/v2/auth/raspberry-pi";
let app;

beforeEach(() => {
  app = buildApp((instance) => instance.use(BASE, routes));
});

describe("Raspberry Pi routes", () => {
  it("registers a station", async () => {
    expect((await request(app).post(`${BASE}/register`)).body).toEqual({ route: "register" });
  });

  it("polls status by registration code", async () => {
    const response = await request(app).get(`${BASE}/status/123456`);
    expect(response.body).toEqual({ route: "status", code: "123456" });
  });

  it("lets an authenticated administrator find a pairing code", async () => {
    const response = await request(app).get(`${BASE}/registrations?code=123456`);
    expect(response.body).toEqual({ route: "registrations", code: "123456" });
  });

  it("lets an authenticated administrator approve a pairing code", async () => {
    const response = await request(app)
      .patch(`${BASE}/registrations/123456/status`)
      .send({ status: "approved" });
    expect(response.body).toEqual({ route: "approval", code: "123456", status: "approved" });
  });

  it("lets an authenticated administrator delete a Raspberry Pi connection", async () => {
    const response = await request(app).delete(`${BASE}/registrations/123456`);
    expect(response.body).toEqual({ route: "delete", code: "123456" });
  });
});
