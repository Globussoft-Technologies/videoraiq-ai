import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import emailMonitoringRoutes from "../../core/v2/emailMonitoring/emailMonitoring.routes.js";

/**
 * Exercises the router as it is actually mounted in routes/v2/v2.js — no
 * verifyToken wrapper, the router guards itself. Kept off the real app so it
 * does not need Mongo.
 */
const app = express();
app.use(express.json());
app.use("/api/v2/email-monitoring", emailMonitoringRoutes);

const BASE = "/api/v2/email-monitoring";

describe("email monitoring routes (contract)", () => {
  it("logs in with the configured credentials and uses the token", async () => {
    const login = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ username: "opsadmin", password: "test-email-pass" });

    expect(login.status).toBe(200);
    expect(login.body.expiresIn).toBe(86_400);
    expect(typeof login.body.token).toBe("string");

    const me = await request(app)
      .get(`${BASE}/auth/me`)
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(me.status).toBe(200);
    expect(me.body.username).toBe("opsadmin");
  });

  it("rejects bad credentials", async () => {
    const res = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ username: "opsadmin", password: "wrong" });

    expect(res.status).toBe(401);
  });

  it("blocks a protected route when no token is sent", async () => {
    const res = await request(app).get(`${BASE}/auth/me`);
    expect(res.status).toBe(401);
  });
});
