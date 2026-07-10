/**
 * Gap-fill for permissions.utility.js — hits the Joi-validation-failure
 * arm in `updatePermissions` (lines 137-143) and the outer catch arm in
 * `deletePermissions` (lines 311-313). The existing suite covers the
 * happy paths but never feeds a payload that fails Joi or forces
 * deletePermissions to throw.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { makeReqRes } from "../../helpers/factory.js";

const { default: PermissionsService } = await import(
  "../../../core/v1/permission/permissions.utility.js"
);
const { default: Permission } = await import(
  "../../../core/v1/permission/permissions.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.restoreAllMocks();
});

const adminId = new mongoose.Types.ObjectId();

function ctx({ query, body } = {}) {
  const { req, res, next } = makeReqRes();
  req.verified = {
    userData: {
      _id: new mongoose.Types.ObjectId().toString(),
      adminId: adminId.toString(),
      language: "en",
    },
  };
  if (query) req.query = query;
  if (body) req.body = body;
  return { req, res, next };
}

describe("PermissionsService.updatePermissions Joi failure (lines 137-143)", () => {
  it("sends FailResp('VALIDATION_FAIL') when the body fails Joi validation", async () => {
    // permissionConfig must be an object; sending a string fails Joi.
    const { req, res } = ctx({
      query: { permissionId: new mongoose.Types.ObjectId().toString() },
      body: { permissionConfig: "not-an-object" },
    });
    await PermissionsService.updatePermissions(req, res);
    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
  });
});

describe("PermissionsService.deletePermissions catch (lines 311-313)", () => {
  it("falls into the outer catch and sends FailResp when findById throws", async () => {
    // permissionId branch: deletePermissions hits findById first. Make it throw.
    const spy = vi
      .spyOn(Permission, "findById")
      .mockImplementationOnce(() => Promise.reject(new Error("findById-blew-up")));

    const { req, res } = ctx({
      query: { permissionId: new mongoose.Types.ObjectId().toString() },
    });
    await PermissionsService.deletePermissions(req, res);

    expect(spy).toHaveBeenCalled();
    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/Invalid permission Id/);
  });
});
