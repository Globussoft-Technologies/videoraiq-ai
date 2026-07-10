/**
 * Contract test for the Auth routes.
 *
 * Auth routes are public (no JWT required). We exercise the wiring with the
 * controller mocked at the service-method level so we never call aMember or
 * touch MongoDB. Goal: prove the routes parse the body and dispatch to the
 * expected service method with the expected status code shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock the auth service before importing the routes.
vi.mock("../../core/v1/Auth/auth.service.js", () => {
  return {
    default: {
      verifyUser: vi.fn(async (req, res) =>
        res.status(200).json({ ok: true, msg: "verified", token: "tok" })
      ),
      decodeToken: vi.fn(async (req, res) =>
        res.status(200).json({ success: true, type: "user-token", data: {} })
      ),
      getAmemberUserDetails: vi.fn(async (req, res) =>
        res.status(200).json({ ok: true, user: { login: req.params.username } })
      ),
    },
  };
});

const { buildApp } = await import("../helpers/app.js");
const { default: authRoutes } = await import(
  "../../core/v1/Auth/auth.routes.js"
);

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/auth", authRoutes));
});

describe("POST /api/v1/auth/by-login-pass", () => {
  it("returns 200 + the controller payload for happy path", async () => {
    const res = await request(app)
      .post("/api/v1/auth/by-login-pass")
      .send({ login: "user@test.local", pass: "secret" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, msg: "verified" });
  });

  it("forwards the body to the controller", async () => {
    const { default: svc } = await import(
      "../../core/v1/Auth/auth.service.js"
    );
    svc.verifyUser.mockClear();

    await request(app)
      .post("/api/v1/auth/by-login-pass")
      .send({ login: "x", pass: "y" });

    expect(svc.verifyUser).toHaveBeenCalledOnce();
    const callReq = svc.verifyUser.mock.calls[0][0];
    expect(callReq.body).toEqual({ login: "x", pass: "y" });
  });
});

describe("POST /api/v1/auth/by-login-token", () => {
  it("returns 200 for a token-decode request", async () => {
    const res = await request(app)
      .post("/api/v1/auth/by-login-token")
      .send({ token: "any-string" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("GET /api/v1/auth/by-login/:username", () => {
  it("passes the username through to the controller", async () => {
    const res = await request(app).get("/api/v1/auth/by-login/jane");
    expect(res.status).toBe(200);
    expect(res.body.user.login).toBe("jane");
  });
});
