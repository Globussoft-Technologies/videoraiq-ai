/**
 * Round-2 gap-fill for RolesServices. Builds on
 * roles.service.gaps.test.js by hitting the last two reachable lines:
 *   - update catch arm (lines 336-338): force rolesModel.aggregate to reject
 *     so the long try{} in update() throws and the outer catch returns
 *     userFailResp('Invalid roleId', err).
 *   - delete falsy-deleteRole arm (line 375): mock rolesModel.deleteOne to
 *     return null so `if (deleteRole)` is false and we fall through to
 *     `Response.userFailResp('Error while deleting roles')`.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { makeReqRes } from "../../helpers/factory.js";

const { default: RolesService } = await import(
  "../../../core/v1/roles/roles.service.js"
);
const { default: Role } = await import(
  "../../../core/v1/roles/roles.model.js"
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
  vi.restoreAllMocks();
});

const adminId = new mongoose.Types.ObjectId();

function adminCtx({ query, body } = {}) {
  const { req, res, next } = makeReqRes();
  req.verified = {
    userData: {
      adminId: adminId.toString(),
      _id: new mongoose.Types.ObjectId().toString(),
      orgId: "org-1",
    },
  };
  if (query) req.query = query;
  if (body) req.body = body;
  return { req, res, next };
}

describe("RolesServices.update outer catch (line 336-338)", () => {
  it("returns userFailResp('Invalid roleId', err) when rolesModel.aggregate throws", async () => {
    // Seed an Admin so the early ADMIN_NOT_EXIST guard does NOT short-circuit
    // — we want execution to reach the aggregate call inside the try{}.
    await Admin.create({
      _id: adminId,
      user_id: 1,
      admin_id: 1,
      login: "admin",
      email: "admin@test.com",
      firstName: "A",
      lastName: "B",
      name_f: "A B",
    });

    const boom = new Error("aggregate-exploded");
    const spy = vi
      .spyOn(Role, "aggregate")
      .mockImplementationOnce(() => Promise.reject(boom));

    const { req, res } = adminCtx({
      query: { roleId: new mongoose.Types.ObjectId().toString() },
      body: { roleName: "newName" },
    });
    await RolesService.update(req, res);

    expect(spy).toHaveBeenCalled();
    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/Invalid roleId/);
  });
});

describe("RolesServices.delete falsy deleteRole branch (line 375)", () => {
  it("returns userFailResp('Error while deleting roles') when deleteOne returns falsy", async () => {
    // Seed an admin + a role so the early `if (!roleData)` guard does not fire.
    await Admin.create({
      _id: adminId,
      user_id: 1,
      admin_id: 1,
      login: "admin",
      email: "admin@test.com",
      firstName: "A",
      lastName: "B",
      name_f: "A B",
    });
    const role = await Role.create({
      adminId,
      orgId: "org-1",
      roleName: "to-delete",
      permissionId: new mongoose.Types.ObjectId(),
    });

    // Force deleteOne to return a falsy value so the success branch is skipped.
    const spy = vi
      .spyOn(Role, "deleteOne")
      .mockImplementationOnce(() => Promise.resolve(null));

    const { req, res } = adminCtx({
      query: { roleId: role._id.toString() },
    });
    await RolesService.delete(req, res);

    expect(spy).toHaveBeenCalled();
    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/Error while deleting roles/);
  });
});
