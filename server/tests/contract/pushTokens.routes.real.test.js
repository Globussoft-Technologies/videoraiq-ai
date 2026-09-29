/**
 * Real vertical contract for `/api/v2/push-tokens` — the real router, service
 * and model against an in-memory Mongo. verifyToken is replaced by a fixture
 * that injects `req.verified.userData` (the decoded JWT), the only thing the
 * routes read from it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { connectMongo, disconnectMongo, clearCollections } from "../integration/dbSetup.js";
import pushTokensRoutes from "../../core/v2/pushTokens/pushTokens.routes.js";
import PushToken from "../../core/v2/pushTokens/pushTokens.model.js";

const appAs = (userData) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.verified = { userData };
    next();
  });
  app.use("/api/v2/push-tokens", pushTokensRoutes);
  return app;
};

const admin = appAs({ adminId: "admin-A", user_id: 39 });
const member = appAs({ adminId: "admin-A", memberId: "member-7" });
const otherTenant = appAs({ adminId: "admin-B", user_id: 40 });
const TOKEN = "fcm-token-abcdefghijklmnop";

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(clearCollections);

describe("POST /api/v2/push-tokens/register", () => {
  it.each(["android", "ios", "web"])("stores a %s token under the caller's tenant", async (platform) => {
    const res = await request(admin).post("/api/v2/push-tokens/register").send({ token: TOKEN, platform });
    expect(res.status).toBe(200);
    const row = await PushToken.findOne({ token: TOKEN }).lean();
    expect(row).toMatchObject({ platform, adminId: "admin-A", userId: "39" });
  });

  it("is idempotent and moves a token to whoever registers it last", async () => {
    await request(admin).post("/api/v2/push-tokens/register").send({ token: TOKEN, platform: "android" });
    await request(admin).post("/api/v2/push-tokens/register").send({ token: TOKEN, platform: "android" });
    await request(otherTenant).post("/api/v2/push-tokens/register").send({ token: TOKEN, platform: "android" });

    const rows = await PushToken.find({ token: TOKEN }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].adminId).toBe("admin-B");
  });

  it("records the memberId for a user (non-admin) login", async () => {
    await request(member).post("/api/v2/push-tokens/register").send({ token: TOKEN, platform: "ios" });
    expect((await PushToken.findOne({ token: TOKEN }).lean()).userId).toBe("member-7");
  });

  it("rejects an unknown platform or a missing token", async () => {
    const badPlatform = await request(admin).post("/api/v2/push-tokens/register").send({ token: TOKEN, platform: "windows" });
    const noToken = await request(admin).post("/api/v2/push-tokens/register").send({ platform: "web" });
    expect(badPlatform.status).toBe(400);
    expect(noToken.status).toBe(400);
    expect(await PushToken.countDocuments()).toBe(0);
  });

  it("rejects a caller whose JWT has no adminId (e.g. a service token)", async () => {
    const res = await request(appAs({ system: true })).post("/api/v2/push-tokens/register").send({ token: TOKEN, platform: "web" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v2/push-tokens/unregister", () => {
  it("deletes the caller's token", async () => {
    await request(admin).post("/api/v2/push-tokens/register").send({ token: TOKEN, platform: "web" });
    const res = await request(admin).post("/api/v2/push-tokens/unregister").send({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(await PushToken.countDocuments()).toBe(0);
  });

  it("cannot delete another tenant's token", async () => {
    await request(admin).post("/api/v2/push-tokens/register").send({ token: TOKEN, platform: "web" });
    await request(otherTenant).post("/api/v2/push-tokens/unregister").send({ token: TOKEN });
    expect(await PushToken.countDocuments()).toBe(1);
  });
});
