/**
 * Integration test for AUTHService — the pure plan/transform helpers, the
 * token decode paths, and registerAdminIfNotExists against in-memory MongoDB.
 * The aMember-backed verifyUser/getAmemberUserDetails happy paths (network
 * fetch) are not exercised; only their early validation branches are.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import config from "config";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";
import { signJwt } from "../../helpers/factory.js";

const { default: AUTHService } = await import(
  "../../../core/v1/Auth/auth.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

/** serviceCtx + an Express-like `req.header()` the auth service expects. */
function authCtx(opts) {
  const ctx = serviceCtx(opts);
  ctx.req.header = (name) => ctx.req.headers[name.toLowerCase()];
  return ctx;
}

describe("AUTHService.isPlanActive", () => {
  it("is true for a subscription expiring in the future", () => {
    expect(
      AUTHService.isPlanActive({ subscriptions: { p1: "2099-12-31" } })
    ).toBe(true);
  });

  it("is false for an expired subscription", () => {
    expect(
      AUTHService.isPlanActive({ subscriptions: { p1: "2000-01-01" } })
    ).toBe(false);
  });

  it("is false when there are no subscriptions", () => {
    expect(AUTHService.isPlanActive({ subscriptions: {} })).toBe(false);
    expect(AUTHService.isPlanActive({})).toBe(false);
  });
});

describe("AUTHService.extractSubscriptions", () => {
  it("collapses access records to productId → latest expiry", () => {
    const result = AUTHService.extractSubscriptions({
      _total: 2,
      0: { product_id: "prodA", expire_date: "2030-01-01" },
      1: { product_id: "prodA", expire_date: "2031-01-01" },
    });
    expect(result.prodA).toBe("2031-01-01");
  });
});

describe("AUTHService.transformData", () => {
  it("returns the defaults for empty input", () => {
    const result = AUTHService.transformData({});
    expect(result.planDetails.name).toBe("Basic Monitoring Plan");
    expect(result["Connected Cameras"]).toBe(4);
  });

  it("applies a boolean override", () => {
    expect(AUTHService.transformData({ "Cloud Backup": true })["Cloud Backup"]).toBe(
      true
    );
  });
});

describe("AUTHService.transformTopUpData", () => {
  it("returns the defaults at $0", () => {
    const result = AUTHService.transformTopUpData([]);
    expect(result.planDetails.price).toBe("$0");
    expect(result["Connected Cameras"]).toBe(4);
  });

  it("upgrades cameras + storage at $20 of top-up", () => {
    const result = AUTHService.transformTopUpData([10, 10]);
    expect(result["Connected Cameras"]).toBe(6);
    expect(result["Video Storage (Days)"]).toBe(10);
  });
});

describe("AUTHService.decodeToken", () => {
  it("returns 400 when the token is missing", async () => {
    const { req, res } = authCtx({ body: {} });
    await AUTHService.decodeToken(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 for an invalid token", async () => {
    const { req, res } = authCtx({ body: { token: "not-a-jwt" } });
    await AUTHService.decodeToken(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("decodes a valid user token (200)", async () => {
    const token = signJwt({ adminId: "abc", login: "u" });
    const { req, res } = authCtx({ body: { token } });
    await AUTHService.decodeToken(req, res);
    expect(res.statusCode).toBe(200);
    expect(res._body.type).toBe("user-token");
  });

  it("decodes a python-backend service token (200)", async () => {
    const token = jwt.sign(
      { service: "python-backend" },
      config.get("Backend.token")
    );
    const { req, res } = authCtx({ body: { token } });
    await AUTHService.decodeToken(req, res);
    expect(res.statusCode).toBe(200);
    expect(res._body.type).toBe("service-token");
  });
});

describe("AUTHService.verifyUser", () => {
  it("returns 403 when login/password are missing", async () => {
    const { req, res } = authCtx({ body: {} });
    await AUTHService.verifyUser(req, res);
    expect(res.statusCode).toBe(403);
  });
});

describe("AUTHService.getAmemberUserDetails", () => {
  it("returns 400 when username is missing", async () => {
    const { req, res } = authCtx({ params: {} });
    await AUTHService.getAmemberUserDetails(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when admin with username does not exist", async () => {
    const { req, res } = authCtx({ params: { username: "nonexistent_user" } });
    await AUTHService.getAmemberUserDetails(req, res);
    expect(res.statusCode).toBe(404);
    expect(res._body.success).toBe(false);
    expect(res._body.message).toContain("No Admin found");
  });
});

describe("AUTHService.registerAdminIfNotExists", () => {
  it("creates a new admin", async () => {
    const result = await AUTHService.registerAdminIfNotExists({
      user_id: "77",
      login: "l77",
      email: "e77@test.com",
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(await Admin.findOne({ user_id: "77" })).not.toBeNull();
  });

  it("is a no-op for an existing admin", async () => {
    await Admin.create({ user_id: "88", login: "l88", email: "e88@test.com" });
    const result = await AUTHService.registerAdminIfNotExists({
      user_id: "88",
      login: "l88",
      email: "e88@test.com",
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);
  });
});
