/**
 * Contract test for the verifyToken middleware behavior at the route boundary.
 *
 * Specifically: a mounted, `verifyToken`-protected route should:
 *   - reject requests with no token (401)
 *   - reject requests with a malformed token (401)
 *   - accept requests with a valid service token (`Backend.token` audience)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import config from "config";
import jwt from "jsonwebtoken";

// Stub the mongoose models referenced by verifyToken so its async paths
// (admin / user / role lookups, getEmpAuthInfo) don't hit the network/DB.
vi.mock("../../core/v1/users/users.model.js", () => ({ default: { findOne: vi.fn().mockResolvedValue(null) } }));
vi.mock("../../core/v1/admin/admin.model.js", () => ({ default: { findById: vi.fn().mockResolvedValue({ _id: "admin1" }) } }));
vi.mock("../../core/v1/roles/roles.model.js", () => ({ default: { aggregate: vi.fn().mockResolvedValue([{ permissionConfig: {} }]) } }));
vi.mock("../../core/v1/cameraRestrictions/authorizedChannels.model.js", () => ({ default: { findOne: vi.fn().mockResolvedValue(null) } }));
vi.mock("../../utils/helperFunctions.js", () => ({
  getEmpAuthInfo: vi.fn().mockResolvedValue({ data: [{ id: "org1" }] }),
  autoSyncLocations: vi.fn(),
  syncPermissionLocations: vi.fn(),
}));

// Bypass checkActivePlan — we're testing verifyToken alone.
vi.mock("../../middlewares/checkActivePlan.js", () => ({
  checkActivePlan: (req, res, next) => next(),
  checkActivePlanSocket: () => {},
}));

const { buildApp } = await import("../helpers/app.js");
const { default: verifyToken } = await import("../../middlewares/verifyToken.js");

import express from "express";

let app;
beforeEach(() => {
  app = buildApp((a) => {
    const router = express.Router();
    router.get("/protected", verifyToken, (req, res) =>
      res.json({ ok: true, who: req.verified?.userData?.service ?? "user" })
    );
    a.use("/api/v1", router);
  });
});

describe("verifyToken — route boundary", () => {
  it("returns 401 with no x-access-token header", async () => {
    const res = await request(app).get("/api/v1/protected");
    expect(res.status).toBe(401);
    expect(res.body?.body?.message).toMatch(/token is required/i);
  });

  it("returns 401 for a malformed token", async () => {
    const res = await request(app)
      .get("/api/v1/protected")
      .set("x-access-token", "not-a-real-jwt");
    expect(res.status).toBe(401);
  });

  it("accepts a python-backend service token", async () => {
    const token = jwt.sign(
      { service: "python-backend" },
      config.get("Backend.token"),
      { expiresIn: "5m" }
    );
    const res = await request(app)
      .get("/api/v1/protected")
      .set("x-access-token", token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, who: "python-backend" });
  });

  it("accepts a user token signed with jwt.secretKey", async () => {
    const token = jwt.sign(
      { memberId: "u1", user_id: 1, adminId: "admin1" },
      config.get("jwt.secretKey"),
      { expiresIn: "5m" }
    );
    const res = await request(app)
      .get("/api/v1/protected")
      .set("x-access-token", token);
    // verifyToken delegates to checkActivePlan (mocked next()), so 200.
    expect(res.status).toBe(200);
  });
});
