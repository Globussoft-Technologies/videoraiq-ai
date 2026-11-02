/**
 * X-Ray Phase 1 exit gate, half two — the flag actually mounts something.
 *
 * Same real routes/v2/v2.js as xray.disabled.test.js, imported once with
 * XRAY_ENABLED=true. The assertion is deliberately narrow: the X-ray paths are
 * ROUTED rather than unknown. They answer 401 here because the router is
 * mounted behind `verifyToken` and these requests carry no token — which is
 * itself worth asserting, since an X-ray route that answered anything else
 * without a token would be an authentication hole.
 *
 * Handler behaviour (501, validation) is proven in xray.routes.test.js, which
 * mounts the X-ray router alone and so does not need a token.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { extendConfigForV2Router } from "../helpers/v2RouterConfig.js";

// Both run before any server module is imported.
process.env.XRAY_ENABLED = "true";
extendConfigForV2Router();

const { buildApp } = await import("../helpers/app.js");
const { default: v2Routes } = await import("../../routes/v2/v2.js");

const app = buildApp((a) => a.use("/api/v2", v2Routes));

const XRAY_URLS = [
  ["post", "/api/v2/xray/sessions"],
  ["post", "/api/v2/xray/sessions/abc123def456/prompt"],
  ["post", "/api/v2/xray/sessions/abc123def456/heartbeat"],
  ["get", "/api/v2/xray/sessions/abc123def456"],
  ["delete", "/api/v2/xray/sessions/abc123def456"],
  ["delete", "/api/v2/xray/sessions/abc123def456/objects/obj-a1b2c3d4"],
];

describe("XRAY_ENABLED=true: /api/v2/xray is mounted behind verifyToken", () => {
  it.each(XRAY_URLS)("%s %s is routed, not 404", async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).not.toBe(404);
  });

  it.each(XRAY_URLS)("%s %s rejects a request with no token", async (method, url) => {
    const res = await request(app)[method](url).send({});
    // verifyToken.js:42 — "Access token is required".
    expect(res.status).toBe(401);
  });

  it("still leaves the rest of the v2 router alone", async () => {
    const res = await request(app).get("/api/v2/health");
    expect(res.status).toBe(200);
  });
});
