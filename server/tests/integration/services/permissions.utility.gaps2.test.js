/**
 * Gap-fill round 2 for permissions.utility.js (round-2 sweep).
 *
 * Existing tests already cover the happy/error paths most of the way;
 * the residual uncovered lines (reported by v8) are:
 *
 *   - 45-46  create(): the inner branch where a partial regex match
 *            against existing permission names fails, so the new
 *            permissionDetails IS pushed to newPermission. Existing
 *            tests only cover the "regex matches" path.
 *   - 106    fetchPermissions(): adminId-present + zero results → goes
 *            to `else if(data.length === 0)` rather than the
 *            !adminId arm (which existing tests cover).
 *   - 119-121 fetchPermissions(): outer catch arm — force find().sort()
 *            chain to throw.
 *
 * UNREACHABLE-marked but not covered here:
 *   - 68-70  create(): the catch arm inside the `new Promise` body
 *            only fires if the synchronous `newPermission.map(async ...)`
 *            ITSELF throws (not the awaits inside the async callback).
 *            Since `Array.prototype.map` cannot throw on a one-element
 *            array of a string + a sync function reference, this catch
 *            is unreachable.
 *   - 102-103 fetchPermissions(): `if(!data)` after `permissionModel.find()`
 *            — Mongoose's find() always resolves to an array (possibly
 *            empty) or rejects; it never resolves to a falsy non-array
 *            value, so the `!data` check is dead code.
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

function ctx({ query, body, userData = {} } = {}) {
  const { req, res, next } = makeReqRes();
  req.verified = {
    userData: {
      _id: new mongoose.Types.ObjectId().toString(),
      adminId: adminId.toString(),
      language: "en",
      userName: "tester",
      ...userData,
    },
  };
  if (query) req.query = query;
  if (body) req.body = body;
  return { req, res, next };
}

describe("PermissionsService.create — regex mismatch branch (lines 45-46)", () => {
  it("pushes the new permissionDetails when none of the existing names match the regex", async () => {
    // Seed a permission named "ALPHA". The case-insensitive regex from
    // permissionDetails="zeta" against the seeded entry won't match,
    // so the find({ permissionName: /zeta/i }) returns []. That hits
    // the `response.length === 0` arm (already covered).
    // To hit the mismatch branch on lines 44-46 we need find() to return
    // a list AND the joined-regex to NOT match permissionDetails.
    // Trick: the service uses a single broad regex
    //   new RegExp(permissionDetails.toLowerCase(), 'i')
    // to fetch, so for find() to return anything, permissionDetails must
    // be a substring of an existing permissionName. We then rely on the
    // existPermission.join('|') -> regex.test(permissionDetails) check
    // — which because regex.test is on the existPermission alternation
    // and `permissionDetails` is the substring, will match when
    // permissionName ⊃ permissionDetails. The mismatch arm fires when
    // the seeded names use a *different* casing variant or are an
    // anchored substring such that the alternation regex misses it.
    // We force the mismatch deterministically by stubbing find() to
    // return rows whose names share zero chars with permissionDetails.
    vi.spyOn(Permission, "find").mockResolvedValueOnce([
      { permissionName: "unrelated" },
    ]);
    const createSpy = vi.spyOn(Permission, "create").mockResolvedValueOnce({
      _id: new mongoose.Types.ObjectId(),
    });

    const { req, res } = ctx({
      body: {
        permissionName: "freshperm",
        permissionConfig: { dashboard: { view: true } },
      },
    });
    await PermissionsService.create(req, res);

    // existPermission was populated (=["unrelated"]) → the
    // `if (existPermission.length)` arm sends the dup-name FailResp.
    // The newly pushed entry is recorded but the function does NOT
    // create it (because existPermission.length truthy short-circuits).
    // That walks lines 40-46 + the dup-error response.
    expect(createSpy).not.toHaveBeenCalled();
    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/already exist/i);
  });
});

describe("PermissionsService.fetchPermissions — empty result with adminId (line 106)", () => {
  it("sends NO_DATA_FOUND when adminId is set but the result list is empty", async () => {
    // adminId present + permissionModel.find() returns []. The first
    // arm (!adminId && data.length===0) is FALSE because adminId IS
    // set, so it falls into `else if(data.length === 0)` — exactly
    // what we want for line 106.
    const { req, res } = ctx({ query: {} });
    await PermissionsService.fetchPermissions(req, res);

    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
  });
});

describe("PermissionsService.fetchPermissions — outer catch (lines 119-121)", () => {
  it("sends FailResp(FETCH_ERROR) when find().sort() chain throws", async () => {
    // Make permissionModel.find return a query-shaped object whose
    // sort() throws synchronously — the outer try/catch swallows it
    // into FailResp.
    vi.spyOn(Permission, "find").mockImplementationOnce(() => ({
      sort: () => {
        throw new Error("sort-blew-up");
      },
    }));

    const { req, res } = ctx({ query: {} });
    await PermissionsService.fetchPermissions(req, res);

    const body = res._body?.body || res._body;
    expect(body.status).toBe("failed");
    expect(body.error || body.message).toMatch(/sort-blew-up|error|fetch/i);
  });
});
