/**
 * Catch-arm + trailing-slash coverage for permissionMiddleware.js and
 * permissionConfigChecker.js (R96).
 *
 * Pins behavior on:
 *
 * 1. `viewAccessCheck` / `createAccessCheck` catch arms in
 *    `middlewares/permissionMiddleware.js` (lines 21-23 and 39-41 in the
 *    source — `res.send(FailResp(...))` on a thrown `req.verified` access).
 *    The existing test suite only covers `editAccessCheck` + `deleteAccessCheck`
 *    catch arms, so the view + create branches were uncovered until now.
 *
 * 2. Trailing-slash-true branch in
 *    `middlewares/permissionConfigChecker.js` for the three checkers that
 *    weren't exercised: `createPermissionConfigChecker` (line 73-74),
 *    `editPermissionConfigChecker` (line 131-132), and
 *    `deletePermissionConfigChecker` (line 188-189). The existing test only
 *    covered the trailing-slash branch for `viewPermissionConfigChecker`.
 *
 * No mocks (mock budget = 0). Pure-function + middleware-with-stub-req tests.
 */
import { describe, it, expect } from "vitest";
import {
  viewAccessCheck,
  createAccessCheck,
} from "../../../middlewares/permissionMiddleware.js";
import {
  createPermissionConfigChecker,
  editPermissionConfigChecker,
  deletePermissionConfigChecker,
} from "../../../middlewares/permissionConfigChecker.js";
import { makeReqRes } from "../../helpers/factory.js";

describe("permissionMiddleware — view/create catch arms", () => {
  it("viewAccessCheck returns FailResp when req.verified is missing", async () => {
    // req.verified is undefined → `result.userData` throws → catch arm.
    const { req, res, next } = makeReqRes();
    await viewAccessCheck(req, res, next);
    expect(next.calls).toHaveLength(0);
    // The catch sends a FailResp envelope; Response.FailResp wraps the message
    // in `{ body: { status: "failed", ... } }`.
    expect(res._body?.body?.status).toBe("failed");
  });

  it("createAccessCheck returns FailResp when req.verified is missing", async () => {
    const { req, res, next } = makeReqRes();
    await createAccessCheck(req, res, next);
    expect(next.calls).toHaveLength(0);
    expect(res._body?.body?.status).toBe("failed");
  });

  it("createAccessCheck returns FailResp when permissionConfig array is empty (member path)", async () => {
    // Hits the catch arm via destructuring: result.userData.memberId is
    // truthy → enters the body → `permissionConfig[pathCheck]?.create`
    // throws because `roleWithPermission[0]` is undefined → permissionConfig
    // is undefined → property access on undefined throws.
    const { req, res, next } = makeReqRes();
    req.verified = {
      userData: { memberId: "u1" },
      permissionConfig: [], // empty array → [0] is undefined → throws
    };
    req.mainRoute = "/api/v1/incidents";
    await createAccessCheck(req, res, next);
    expect(next.calls).toHaveLength(0);
    expect(res._body?.body?.status).toBe("failed");
  });
});

describe("permissionConfigChecker — trailing-slash normalization for create/edit/delete", () => {
  it("createPermissionConfigChecker strips a trailing slash before matching", () => {
    expect(createPermissionConfigChecker("/api/v1/incidents/")).toBe("incidents");
    expect(createPermissionConfigChecker("/api/v1/shifts/")).toBe("shifts");
  });

  it("editPermissionConfigChecker strips a trailing slash before matching", () => {
    expect(editPermissionConfigChecker("/api/v1/channel/")).toBe("channels");
    expect(editPermissionConfigChecker("/api/v1/nvr/")).toBe("NVR");
  });

  it("deletePermissionConfigChecker strips a trailing slash before matching", () => {
    expect(deletePermissionConfigChecker("/api/v1/users/")).toBe("Users");
    expect(deletePermissionConfigChecker("/v1/user/")).toBe("employee");
  });

  it("trailing-slash-only path with no prefix match still returns empty string", () => {
    // Exercises the strip-then-no-match branch.
    expect(createPermissionConfigChecker("/")).toBe("");
    expect(editPermissionConfigChecker("/")).toBe("");
    expect(deletePermissionConfigChecker("/")).toBe("");
  });
});
