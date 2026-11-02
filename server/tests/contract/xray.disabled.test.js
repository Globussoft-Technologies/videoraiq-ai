/**
 * X-Ray Phase 1 exit gate, half one — THE GATE THAT MATTERS.
 *
 * Contract §3: "Off must be byte-identical to today."
 *
 * This file imports the REAL routes/v2/v2.js with XRAY_ENABLED unset (the
 * default) and proves every X-ray URL 404s, exactly as it did before the
 * feature existed, while the rest of the v2 router carries on working.
 *
 * It is a separate file from xray.enabled.test.js on purpose. The mount
 * decision is made once, when v2.js is evaluated, so testing both states means
 * importing that module twice — and a second import re-registers every Mongoose
 * model in the graph, which throws OverwriteModelError. vitest runs each file in
 * its own fork (vitest.config.js: pool "forks", isolate true), so one state per
 * file is the only way to import the real router at all.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { extendConfigForV2Router } from "../helpers/v2RouterConfig.js";

// Order matters: both of these run before any server module is imported.
delete process.env.XRAY_ENABLED;
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

describe("XRAY_ENABLED unset: /api/v2/xray is not mounted", () => {
  it.each(XRAY_URLS)("%s %s -> 404", async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).toBe(404);
  });

  it("does not leak an X-ray error body on the 404", async () => {
    const res = await request(app).post("/api/v2/xray/sessions").send({});
    // An unmounted path falls through to Express's own handler. The telling
    // sign of an accidentally-mounted router would be a contract §10 body.
    expect(res.body?.error).toBeUndefined();
  });

  it("leaves the rest of the v2 router working (health still 200)", async () => {
    const res = await request(app).get("/api/v2/health");
    expect(res.status).toBe(200);
  });

  it("a neighbouring v2 route still behaves as before (401, not 404)", async () => {
    // /detection-settings is mounted with verifyToken, so an unauthenticated
    // call is rejected by auth. If the X-ray change had disturbed the router's
    // mount order, this would 404 instead.
    const res = await request(app).get("/api/v2/detection-settings");
    expect(res.status).not.toBe(404);
  });
});

describe("XRAY_ENABLED unset: nothing X-ray is loaded", () => {
  /**
   * The 404s above prove the route is unreachable. This proves something
   * stronger and more consequential for a deployment: the X-ray Mongoose model
   * was never compiled.
   *
   * Compiling a model registers it and lets Mongoose build its indexes against
   * the live database, which would create an `xraysessions` collection on a box
   * that is supposed to be untouched. It is the one import-time side effect in
   * this module that a user would actually notice, and it is why
   * xray.routes.js imports its controller per request instead of at the top.
   */
  it("has not compiled the XRaySession model", () => {
    expect(Object.keys(mongoose.models)).not.toContain("XRaySession");
  });

  it("while the rest of the app's models did load (so the check means something)", () => {
    // If the v2 router had failed to import at all, mongoose.models would be
    // near-empty and the assertion above would pass for the wrong reason.
    expect(Object.keys(mongoose.models).length).toBeGreaterThan(5);
  });
});
