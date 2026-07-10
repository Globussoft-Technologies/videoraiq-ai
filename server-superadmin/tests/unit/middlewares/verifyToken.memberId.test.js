/**
 * Extra coverage for middlewares/verifyToken.js.
 *
 * The existing verifyToken.test.js pins the admin-token, missing-token,
 * service-token short-circuit, and outer-catch paths. This file covers the
 * remaining gaps inside the user-token branch:
 *
 *   - decoded.memberId === <userId> → uses User.findOne +
 *     authorizedChannelsModel.findOne + roleModel.aggregate to build
 *     `permissionConfig` and `authorizedChannel` on req.verified
 *     (lines 65-98 — previously uncovered).
 *   - decoded?.service === "python-backend" on a USER-signed (not backend-
 *     signed) token → decoded.system = true (lines 100-102).
 *   - decoded?.user_email present + getEmpAuthInfo returns
 *     { data: [{ id: <number> }] } → decoded.orgId assigned (lines
 *     108-110, the success arm of the EMP lookup; the rejection arm is
 *     already covered).
 *
 * Mocks: 2 (checkActivePlan to swallow next() without DB lookup;
 * helperFunctions for getEmpAuthInfo). Same pattern as the existing
 * verifyToken.test.js.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { makeReqRes, signJwt } from "../../helpers/factory.js";
import { connectMongo, disconnectMongo, clearCollections } from "../../integration/dbSetup.js";

vi.mock("../../../middlewares/checkActivePlan.js", () => ({
  checkActivePlan: (req, res, next) => next(),
}));

vi.mock("../../../utils/helperFunctions.js", () => ({
  getEmpAuthInfo: vi.fn().mockResolvedValue(null),
}));

const { default: verifyToken } = await import(
  "../../../middlewares/verifyToken.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: User } = await import(
  "../../../core/v1/users/users.model.js"
);
const { default: roleModel } = await import(
  "../../../core/v1/roles/roles.model.js"
);
const { default: permissionModel } = await import(
  "../../../core/v1/permission/permissions.model.js"
);
const { default: authorizedChannelsModel } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);
const helperFns = await import("../../../utils/helperFunctions.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  helperFns.getEmpAuthInfo.mockReset();
  helperFns.getEmpAuthInfo.mockResolvedValue(null);
});

/**
 * Drive the middleware and resolve once next() or res.send fires.
 * The user-token branch calls `jwt.verify(token, secret, callback)` —
 * the callback is invoked asynchronously, so we give it a short macrotask
 * grace period before resolving the harness promise.
 */
function runMiddleware(req, res) {
  return new Promise((resolve) => {
    const next = (err) => {
      next.calls.push(err);
      resolve();
    };
    next.calls = [];
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
    setTimeout(resolve, 300);
  });
}

describe("verifyToken — user-token memberId branch (lines 65-98)", () => {
  it("attaches req.verified with permissionConfig + authorizedChannel for a memberId user", async () => {
    const admin = await Admin.create({
      user_id: "9",
      login: "memberAdmin",
      email: "memberAdmin@test.com",
    });

    // Seed the permission + role chain so the aggregate pipeline produces
    // a non-empty `permissionDetails` lookup. The schema uses
    // `from: "permissionschemas"` for the $lookup — the default collection
    // name for the `permissionSchema` mongoose model.
    const perm = await permissionModel.create({
      adminId: admin._id,
      permissionName: "memberPerm",
      permissionConfig: { dashboard: { view: true } },
      is_default: false,
    });
    const role = await roleModel.create({
      adminId: admin._id,
      roleName: "Member",
      permissionId: perm._id,
    });
    const user = await User.create({
      adminId: admin._id,
      emp_id: "5",
      email: "member@test.com",
      firstName: "Mem",
      lastName: "Ber",
      roleIds: role._id,
    });
    // authorizedChannel is loaded via `findOne({ userId: decoded.memberId })`.
    await authorizedChannelsModel.create({
      adminId: admin._id,
      userId: user._id,
      locations: ["L1"],
    });

    const token = signJwt({
      memberId: user._id.toString(),
      adminId: admin._id.toString(),
    });
    const { req, res } = makeReqRes();
    req.originalUrl = "/api/v1/dashboard";
    req.path = "/dashboard";
    req.baseUrl = "/api/v1";
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;

    await runMiddleware(req, res);
    expect(req.verified).toBeDefined();
    expect(req.verified.userData.memberId).toBe(user._id.toString());
    // permissionConfig should be the result of the role $lookup aggregate.
    expect(Array.isArray(req.verified.permissionConfig)).toBe(true);
    expect(req.verified.permissionConfig.length).toBe(1);
    expect(
      req.verified.permissionConfig[0].permissionConfig.dashboard.view
    ).toBe(true);
    // authorizedChannel should be the seeded doc, not null.
    expect(req.verified.authorizedChannel).not.toBeNull();
    expect(String(req.verified.authorizedChannel.userId)).toBe(
      String(user._id)
    );
    expect(req.mainRoute).toBe("/api/v1/dashboard");
  });

  it("falls through with empty permissionConfig + null authorizedChannel when the user has no role/channels", async () => {
    // memberId is set but matches no User doc — User.findOne returns null,
    // authorizedChannelsModel.findOne returns null, the role aggregate
    // matches nothing → permissionConfig is []. The middleware still
    // proceeds (the commented-out "User not found" guard is dead code).
    const ghostUserId = new mongoose.Types.ObjectId().toString();
    const token = signJwt({ memberId: ghostUserId });
    const { req, res } = makeReqRes();
    req.originalUrl = "/api/v1/foo";
    req.path = "/foo";
    req.baseUrl = "/api/v1";
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;

    await runMiddleware(req, res);
    expect(req.verified).toBeDefined();
    expect(req.verified.permissionConfig).toEqual([]);
    expect(req.verified.authorizedChannel).toBeNull();
  });
});

describe("verifyToken — python-backend flag on user-signed token (lines 100-102)", () => {
  it("sets decoded.system = true when a USER-signed token carries service='python-backend'", async () => {
    // This token is signed with the USER secret, not the backend secret,
    // so the inner service-token try/catch fails and execution falls
    // through to jwt.verify(token, jwtSecret, cb). Inside that callback,
    // the `if (decoded?.service === "python-backend")` arm at lines
    // 100-102 flips `decoded.system = true` regardless of the service
    // token check above.
    const admin = await Admin.create({
      user_id: "13",
      login: "sysAdmin",
      email: "sysAdmin@test.com",
    });
    const token = signJwt({
      adminId: admin._id.toString(),
      service: "python-backend",
    });
    const { req, res } = makeReqRes();
    req.originalUrl = "/api/v1/foo";
    req.path = "/foo";
    req.baseUrl = "/api/v1";
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;

    await runMiddleware(req, res);
    expect(req.verified).toBeDefined();
    expect(req.verified.userData.system).toBe(true);
    expect(req.verified.userData.service).toBe("python-backend");
  });
});

describe("verifyToken — orgId assignment from EMP lookup (lines 108-110)", () => {
  it("assigns decoded.orgId when getEmpAuthInfo returns data[0].id", async () => {
    helperFns.getEmpAuthInfo.mockResolvedValueOnce({
      data: [{ id: 4242 }],
    });
    const admin = await Admin.create({
      user_id: "14",
      login: "orgAdmin",
      email: "orgAdmin@test.com",
    });
    const token = signJwt({
      adminId: admin._id.toString(),
      user_email: "orgAdmin@test.com",
    });
    const { req, res } = makeReqRes();
    req.originalUrl = "/api/v1/foo";
    req.path = "/foo";
    req.baseUrl = "/api/v1";
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;

    await runMiddleware(req, res);
    expect(req.verified).toBeDefined();
    expect(req.verified.userData.orgId).toBe(4242);
    // Confirm the stub received the user_email from the decoded payload.
    expect(helperFns.getEmpAuthInfo).toHaveBeenCalledWith("orgAdmin@test.com");
  });

  it("leaves decoded.orgId undefined when getEmpAuthInfo returns null", async () => {
    helperFns.getEmpAuthInfo.mockResolvedValueOnce(null);
    const admin = await Admin.create({
      user_id: "15",
      login: "noOrgAdmin",
      email: "noOrgAdmin@test.com",
    });
    const token = signJwt({
      adminId: admin._id.toString(),
      user_email: "noOrgAdmin@test.com",
    });
    const { req, res } = makeReqRes();
    req.originalUrl = "/api/v1/foo";
    req.path = "/foo";
    req.baseUrl = "/api/v1";
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;

    await runMiddleware(req, res);
    expect(req.verified).toBeDefined();
    expect(req.verified.userData.orgId).toBeUndefined();
  });

  it("leaves decoded.orgId undefined when empData.data is empty (no `[0].id`)", async () => {
    helperFns.getEmpAuthInfo.mockResolvedValueOnce({ data: [] });
    const admin = await Admin.create({
      user_id: "16",
      login: "emptyOrgAdmin",
      email: "emptyOrgAdmin@test.com",
    });
    const token = signJwt({
      adminId: admin._id.toString(),
      user_email: "emptyOrgAdmin@test.com",
    });
    const { req, res } = makeReqRes();
    req.originalUrl = "/api/v1/foo";
    req.path = "/foo";
    req.baseUrl = "/api/v1";
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;

    await runMiddleware(req, res);
    expect(req.verified).toBeDefined();
    expect(req.verified.userData.orgId).toBeUndefined();
  });
});

describe("verifyToken — mainRoute ObjectId masking", () => {
  it("rewrites 24-hex segments in mainRoute as ':id'", async () => {
    // The middleware applies `.replace(/\/[0-9a-fA-F]{24}(?=\/|$)/g, ":id")`
    // to baseUrl+path. Hit a route that includes a real ObjectId so the
    // mask runs.
    const admin = await Admin.create({
      user_id: "17",
      login: "maskAdmin",
      email: "maskAdmin@test.com",
    });
    const oid = "507f1f77bcf86cd799439011";
    const token = signJwt({
      adminId: admin._id.toString(),
    });
    const { req, res } = makeReqRes();
    req.originalUrl = `/api/v1/users/${oid}`;
    req.path = `/users/${oid}`;
    req.baseUrl = "/api/v1";
    req.header = (name) =>
      name.toLowerCase() === "x-access-token" ? token : undefined;

    await runMiddleware(req, res);
    expect(req.verified).toBeDefined();
    expect(req.mainRoute).toBe("/api/v1/users:id");
  });
});
