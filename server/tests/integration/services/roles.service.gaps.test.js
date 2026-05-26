/**
 * Extra branch coverage for RolesServices (core/v1/roles/roles.service.js) —
 * fills the reachable gaps left by `roles.service.test.js` (R51 baseline)
 * and `roles.service.extras.test.js` (R67):
 *
 *   createRoles:
 *     - Joi validation failure (role token starts with a digit) → lines 23-25
 *     - mixed pre-existing + new roles → success-message arm that includes
 *       BOTH ROLES_ADD_SUCCESS and ROLES_EXIST (lines 77-79)
 *
 *   update:
 *     - admin lookup miss (real adminId in userData but no Admin row) →
 *       ADMIN_NOT_EXIST short-circuit (lines 197-198)
 *
 *   delete:
 *     - role not found → FailResp ("No role found") (line 352 negative arm)
 *     - outer try/catch via rolesModel.findOne spy that throws (lines 376-379)
 *
 * Mocks: 0 mock factories, 1 `vi.spyOn` ad-hoc throw in the delete-catch
 * test. Well under the ≤8 ceiling.
 *
 * Branches deliberately NOT pinned in this round:
 *
 *   - update lines 204-209 + 262-264 + 282-284 (the `adminId===undefined`
 *     access-check fallback): structurally unreachable today because the
 *     admin-existence guard at line 195-197 always short-circuits with
 *     ADMIN_NOT_EXIST when `adminId` is undefined (`Admin.findOne({_id:
 *     undefined})` returns null in real Mongo). Not filed as its own bug —
 *     it's downstream of, and overlapping with, the broader access-control
 *     plumbing the middleware already handles outside this service.
 *
 *   - update lines 245-247 (duplicate-name guard via `isRoleDuplicate`):
 *     blocked by **#116** — the file does `import { ObjectId } from
 *     "mongoose"` which resolves to `SchemaObjectId`, not
 *     `Types.ObjectId`. `new ObjectId(...)` returns a schema-type wrapper
 *     that never matches a real ObjectId in $match, so `isRoleExist` is
 *     always `[]` and `isRoleDuplicate` is always `false`. Pinning this
 *     today would require asserting "no-op" behavior, which would
 *     silently regress once the product fix lands.
 *
 *   - update lines 329-331 (data-is-null after findOneAndUpdate inside
 *     the permission block): we'd need to break the second
 *     `findOneAndUpdate` to return null while everything else succeeds,
 *     which requires a deep model-internal stub. Out of scope for this
 *     round.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
  afterEach,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: RolesService } = await import(
  "../../../core/v1/roles/roles.service.js"
);
const { default: Role } = await import(
  "../../../core/v1/roles/roles.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
// Side-effect imports: register schemas referenced inside the service
// (userModel.aggregate / usersModel.updateMany) so nothing crashes during
// a happy-path read.
await import("../../../core/v1/permission/permissions.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");
await import("../../../core/v1/users/users.model.js");

const tick = () => new Promise((r) => setTimeout(r, 80));

let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "1",
    login: "rolesGapsAdmin",
    email: "rolesGaps@test.com",
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

function adminCtx(extra = {}) {
  return serviceCtx({ adminId: admin._id, orgId: "org-1", ...extra });
}

describe("RolesServices.createRoles — gap branches", () => {
  it("returns VALIDATION_FAIL when a role name starts with a non-letter (Joi regex)", async () => {
    // RoleValidation.createRole requires items to match /^[a-zA-Z]/.
    // A digit-leading token trips the validator → lines 23-25.
    const { req, res } = adminCtx({ body: { roles: ["1bad"] } });
    await RolesService.createRoles(req, res);
    expect(payload(res).status).toBe("failed");
    // No role row should be inserted.
    await tick();
    expect(await Role.countDocuments()).toBe(0);
  });

  it("reports both 'added' and 'already exists' when the input mixes new + existing names", async () => {
    // Pre-seed one role so existRole gets populated, then ask to add it
    // again plus a fresh name → newRole=['fresh'], existRole=['editor'].
    // The mixed-branch (lines 77-79) is the success-message arm that
    // mentions both ROLES_ADD_SUCCESS and ROLES_EXIST.
    await Role.create({ adminId: admin._id, roleName: "editor" });
    const { req, res } = adminCtx({
      body: { roles: ["Editor", "Fresh"] },
    });
    await RolesService.createRoles(req, res);
    // The branch sends a SUCCESS resp.
    expect(payload(res).status).toBe("success");
    // The literal message embeds both lists.
    expect(payload(res).message).toMatch(/fresh/i);
    expect(payload(res).message).toMatch(/editor/i);

    await tick();
    const names = (await Role.find({ adminId: admin._id })).map(
      (r) => r.roleName,
    ).sort();
    expect(names).toEqual(["editor", "fresh"]);
  });
});

describe("RolesServices.update — gap branches", () => {
  it("returns ADMIN_NOT_EXIST when no Admin doc matches the userData adminId", async () => {
    // Seed a role under our real admin, but pass an unrelated adminId
    // in userData so the admin lookup misses → lines 197-198.
    const role = await Role.create({
      adminId: admin._id,
      roleName: "ghosted",
      is_default: false,
    });
    const fakeAdminId = new mongoose.Types.ObjectId();
    const { req, res } = serviceCtx({
      adminId: fakeAdminId,
      orgId: "org-1",
      query: { roleId: role._id.toString() },
      body: { roleName: "renamed" },
    });
    await RolesService.update(req, res);
    expect(payload(res).status).toBe("failed");
    // Role doc should not have been touched.
    expect((await Role.findById(role._id)).roleName).toBe("ghosted");
  });
});

describe("RolesServices.delete — gap branches", () => {
  it("returns FailResp ('No role found') when the roleId/orgId combo matches nothing", async () => {
    // No seeded role → roleData is null → line 352 FailResp arm.
    const { req, res } = adminCtx({
      query: { roleId: new mongoose.Types.ObjectId().toString() },
    });
    await RolesService.delete(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("returns userFailResp from the outer try/catch when rolesModel.findOne throws", async () => {
    // Spy: force the very first DB call (rolesModel.findOne lookup at
    // line 347) to reject so the outer catch at lines 376-379 fires.
    const boom = new Error("synthetic boom");
    const spy = vi
      .spyOn(Role, "findOne")
      .mockImplementationOnce(() => Promise.reject(boom));

    const { req, res } = adminCtx({
      query: { roleId: new mongoose.Types.ObjectId().toString() },
    });
    await RolesService.delete(req, res);

    expect(spy).toHaveBeenCalledTimes(1);
    // userFailResp body shape: { statusCode: 400, body: { status: "failed",
    // message: "Something went wrong", error: <Error> } }
    expect(res._body?.body?.status).toBe("failed");
    expect(res._body?.body?.message).toBe("Something went wrong");
    // The error object is the rejected Error itself.
    expect(res._body?.body?.error).toBe(boom);
  });
});
