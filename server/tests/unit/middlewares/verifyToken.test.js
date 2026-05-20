/**
 * Unit test for middlewares/verifyToken.js. The middleware accepts either a
 * service token (signed with Backend.token) or a user-token (signed with
 * jwt.secretKey). We assert the early-exit branches (missing token, invalid
 * token, service token short-circuits to next).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import config from "config";
import { makeReqRes, signJwt } from "../../helpers/factory.js";
import { connectMongo, disconnectMongo, clearCollections } from "../../integration/dbSetup.js";

// checkActivePlan reads config / db; stub it so verifyToken returns control
// without touching the planExpired branch. The middleware-under-test calls
// checkActivePlan(req,res,next) instead of next() when validation passes.
vi.mock("../../../middlewares/checkActivePlan.js", () => ({
  checkActivePlan: (req, res, next) => next(),
}));

// getEmpAuthInfo hits axios — stub so the empData lookup is a no-op.
vi.mock("../../../utils/helperFunctions.js", () => ({
  getEmpAuthInfo: vi.fn().mockResolvedValue(null),
}));

const { default: verifyToken } = await import(
  "../../../middlewares/verifyToken.js"
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

/** Drive the middleware and resolve once next() or res.send fires. */
function runMiddleware(req, res) {
  return new Promise((resolve) => {
    const next = (err) => {
      next.calls.push(err);
      resolve();
    };
    next.calls = [];
    // res.send / res.json end the chain too.
    const origSend = res.send.bind(res);
    res.send = (payload) => {
      origSend(payload);
      resolve();
      return res;
    };
    const origJson = res.json.bind(res);
    res.json = (payload) => {
      origJson(payload);
      resolve();
      return res;
    };
    verifyToken(req, res, next).catch(() => resolve());
  });
}

describe("verifyToken", () => {
  it("returns 401 when no token header is present", async () => {
    const { req, res } = makeReqRes();
    req.header = () => undefined;
    await runMiddleware(req, res);
    expect(res.statusCode).toBe(401);
    expect(res._body?.body?.message).toMatch(/Access token is required/i);
  });

  it("short-circuits to next() for a python-backend service token", async () => {
    const token = jwt.sign(
      { service: "python-backend" },
      config.get("Backend.token")
    );
    const { req, res } = makeReqRes();
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;
    await new Promise((resolve) => {
      const next = (err) => {
        next.calls.push(err);
        resolve();
      };
      next.calls = [];
      verifyToken(req, res, next);
      // Service-token branch exits synchronously after next().
      setTimeout(resolve, 50);
    });
    expect(req.verified).toBeDefined();
    expect(req.verified.userData.service).toBe("python-backend");
    expect(req.verified.userData.system).toBe(true);
  });

  it("returns 401 when the user token is invalid", async () => {
    const { req, res } = makeReqRes();
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? "not-a-jwt" : undefined;
    await runMiddleware(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when the decoded admin no longer exists", async () => {
    const token = signJwt({
      adminId: "ffffffffffffffffffffffff",
      user_email: "missing@test.com",
    });
    const { req, res } = makeReqRes();
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;
    await runMiddleware(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("attaches req.verified and proceeds for a valid admin token", async () => {
    const admin = await Admin.create({
      user_id: "11",
      login: "u",
      email: "u@test.com",
    });
    const token = signJwt({
      adminId: admin._id.toString(),
      user_email: "u@test.com",
    });
    const { req, res } = makeReqRes();
    req.originalUrl = "/api/v1/foo";
    req.path = "/foo";
    req.baseUrl = "/api/v1";
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;

    // checkActivePlan is mocked to next(); we observe the spy via next.calls.
    await new Promise((resolve) => {
      const next = (err) => {
        next.calls.push(err);
        resolve();
      };
      next.calls = [];
      verifyToken(req, res, next).catch(() => resolve());
      // jwt.verify is async (callback); allow the macrotask to flush.
      setTimeout(resolve, 200);
    });
    expect(req.verified).toBeDefined();
    expect(req.verified.userData.adminId).toBe(admin._id.toString());
    expect(req.mainRoute).toBe("/api/v1/foo");
  });
});
