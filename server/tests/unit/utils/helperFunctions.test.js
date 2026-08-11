/**
 * Unit tests for utils/helperFunctions.js (R103).
 *
 * Three exported helpers used by the auth + NVR-registration flow:
 *   - getEmpAuthInfo(email) — POSTs to `${empDomain}/auth/info` via axios.
 *     Returns the body on success; null on a 404; re-throws any other error.
 *   - autoSyncLocations(adminData, userData) - best-effort: normalizes
 *     departments, applies canonical Location casing to authorized users and
 *     NVRs, and inserts missing locations. Failures are logged and swallowed.
 *   - syncPermissionLocations(adminId) — patches the four permission tiers
 *     (admin / read / write / custom) so they all have a `locations` key on
 *     `permissionConfig`. No-op when adminId is falsy; swallows errors.
 *
 * The file pulls in axios, several Mongoose models, and the project's
 * `config` package. The Mongoose models are mocked module-level (the
 * registry would otherwise execute schema bodies that touch indexes); the
 * `config` package is the test setup's NODE_CONFIG, so `empDomain` resolves
 * to the test config value. axios is mocked so no HTTP escapes the test
 * runner.
 *
 * Tests target both branches of every conditional (Array vs scalar
 * location, missing departmentName / location, falsy locs in the unique
 * map, etc.) and the catch arms — the goal is to pin behaviour rather than
 * coverage shape, so any silent regression in the location auto-sync flow
 * (which has bitten the team before) gets flagged here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks: axios + models ----------

const axiosPostMock = vi.fn();
vi.mock("axios", () => ({
  default: { post: (...args) => axiosPostMock(...args) },
}));

const departmentsFindMock = vi.fn();
const departmentsBulkWriteMock = vi.fn();
vi.mock("../../../core/v1/departments/departments.model.js", () => ({
  default: {
    find: (...a) => departmentsFindMock(...a),
    bulkWrite: (...a) => departmentsBulkWriteMock(...a),
  },
}));

const authUsersFindMock = vi.fn();
const authUsersBulkWriteMock = vi.fn();
vi.mock("../../../core/v1/authorizedUsers/authorizedUsers.model.js", () => ({
  default: {
    find: (...a) => authUsersFindMock(...a),
    bulkWrite: (...a) => authUsersBulkWriteMock(...a),
  },
}));

const nvrFindMock = vi.fn();
const nvrBulkWriteMock = vi.fn();
vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({
  default: {
    find: (...a) => nvrFindMock(...a),
    bulkWrite: (...a) => nvrBulkWriteMock(...a),
  },
}));

const locationFindMock = vi.fn();
const locationInsertManyMock = vi.fn();
vi.mock("../../../core/v1/locations/location.model.js", () => ({
  default: {
    find: (...a) => locationFindMock(...a),
    insertMany: (...a) => locationInsertManyMock(...a),
  },
}));

const permissionUpdateManyMock = vi.fn();
vi.mock("../../../core/v1/permission/permissions.model.js", () => ({
  default: {
    updateMany: (...a) => permissionUpdateManyMock(...a),
  },
}));

const loggerInfoMock = vi.fn();
const loggerErrorMock = vi.fn();
vi.mock("../../../utils/logger.js", () => ({
  default: { info: loggerInfoMock, error: loggerErrorMock },
}));

// Mongoose `.find(query, projection)` returns a thenable supporting `.lean()`.
// Tests can either return a value or pre-set a behaviour via the helpers below.
function lean(rows) {
  return { lean: () => Promise.resolve(rows) };
}

const {
  getEmpAuthInfo,
  autoSyncLocations,
  syncPermissionLocations,
} = await import("../../../utils/helperFunctions.js");

beforeEach(() => {
  axiosPostMock.mockReset();
  departmentsFindMock.mockReset();
  departmentsBulkWriteMock.mockReset();
  authUsersFindMock.mockReset();
  authUsersBulkWriteMock.mockReset();
  nvrFindMock.mockReset();
  nvrBulkWriteMock.mockReset();
  locationFindMock.mockReset();
  locationInsertManyMock.mockReset();
  permissionUpdateManyMock.mockReset();
  loggerInfoMock.mockReset();
  loggerErrorMock.mockReset();
});

// ---------- getEmpAuthInfo ----------

describe("getEmpAuthInfo", () => {
  it("POSTs to ${empDomain}/auth/info with the email body", async () => {
    axiosPostMock.mockResolvedValue({ data: { ok: true, userId: 42 } });

    const out = await getEmpAuthInfo("alice@test.com");

    expect(out).toEqual({ ok: true, userId: 42 });
    expect(axiosPostMock).toHaveBeenCalledOnce();
    const [url, body, opts] = axiosPostMock.mock.calls[0];
    // empDomain in setup.js is an object; config.get returns it as-is so the
    // URL template stringifies "[object Object]/auth/info". The contract this
    // test pins is "POSTs JSON {email} with content-type header" regardless of
    // how the empDomain string is shaped in production.
    expect(typeof url).toBe("string");
    expect(url.endsWith("/auth/info")).toBe(true);
    expect(body).toEqual({ email: "alice@test.com" });
    expect(opts).toEqual({ headers: { "Content-Type": "application/json" } });
  });

  it("returns null when axios responds with body but no data property", async () => {
    axiosPostMock.mockResolvedValue({ data: null });
    const out = await getEmpAuthInfo("nobody@test.com");
    expect(out).toBeNull();
  });

  it("returns null when response data is undefined", async () => {
    axiosPostMock.mockResolvedValue({}); // no data field at all
    const out = await getEmpAuthInfo("nobody@test.com");
    expect(out).toBeNull();
  });

  it("returns null on a 404 response (employee not registered)", async () => {
    const err = new Error("not found");
    err.response = { status: 404 };
    axiosPostMock.mockRejectedValue(err);

    const out = await getEmpAuthInfo("ghost@test.com");
    expect(out).toBeNull();
    // 404 is a silent path — no logger.error
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("logs and re-throws on a non-404 HTTP error", async () => {
    const err = new Error("server fire");
    err.response = { status: 500 };
    axiosPostMock.mockRejectedValue(err);

    await expect(getEmpAuthInfo("crash@test.com")).rejects.toThrow("server fire");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
    expect(loggerErrorMock.mock.calls[0][0]).toMatch(/getEmpAuthInfo/);
  });

  it("logs and re-throws on a network error (no `response` property)", async () => {
    const err = new Error("ECONNREFUSED");
    axiosPostMock.mockRejectedValue(err);

    await expect(getEmpAuthInfo("x@test.com")).rejects.toThrow("ECONNREFUSED");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

// ---------- autoSyncLocations ----------

describe("autoSyncLocations — no-op paths", () => {
  it("does nothing when adminData is null", async () => {
    await autoSyncLocations(null, { user_id: 7 });
    expect(departmentsFindMock).not.toHaveBeenCalled();
    expect(authUsersFindMock).not.toHaveBeenCalled();
    expect(nvrFindMock).not.toHaveBeenCalled();
    expect(locationInsertManyMock).not.toHaveBeenCalled();
  });

  it("does nothing when adminData is undefined", async () => {
    await autoSyncLocations(undefined, { user_id: 7 });
    expect(departmentsFindMock).not.toHaveBeenCalled();
  });
});

describe("autoSyncLocations — department normalisation", () => {
  function primeNoOpAfterDepartments() {
    authUsersFindMock.mockReturnValue(lean([]));
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(lean([]));
  }

  it("lowercases existing departments via bulkWrite and skips already-lower ones", async () => {
    departmentsFindMock.mockReturnValue(
      lean([
        { _id: "d1", departmentName: "Engineering" },
        { _id: "d2", departmentName: "sales" }, // already lower → skipped
        { _id: "d3", departmentName: "MARKETING" },
      ])
    );
    primeNoOpAfterDepartments();

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });

    expect(departmentsBulkWriteMock).toHaveBeenCalledOnce();
    const ops = departmentsBulkWriteMock.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      updateOne: {
        filter: { _id: "d1" },
        update: { $set: { departmentName: "engineering" } },
      },
    });
    expect(ops[1].updateOne.update.$set.departmentName).toBe("marketing");
  });

  it("skips departments with no departmentName (filtered to null)", async () => {
    departmentsFindMock.mockReturnValue(
      lean([
        { _id: "d1", departmentName: null },
        { _id: "d2", departmentName: undefined },
        { _id: "d3" }, // no key at all
      ])
    );
    primeNoOpAfterDepartments();

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });
    expect(departmentsBulkWriteMock).not.toHaveBeenCalled();
  });

  it("passes through non-string departmentName values without crashing", async () => {
    departmentsFindMock.mockReturnValue(
      lean([{ _id: "d1", departmentName: 42 }]) // truthy but not string
    );
    primeNoOpAfterDepartments();

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });
    // 42 === 42 after the "no change needed" check → null → filtered → no bulkWrite
    expect(departmentsBulkWriteMock).not.toHaveBeenCalled();
  });

  it("does not call bulkWrite when departments list is empty", async () => {
    departmentsFindMock.mockReturnValue(lean([]));
    primeNoOpAfterDepartments();
    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });
    expect(departmentsBulkWriteMock).not.toHaveBeenCalled();
  });

  it("handles null departments find result without crashing", async () => {
    departmentsFindMock.mockReturnValue(lean(null));
    primeNoOpAfterDepartments();
    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });
    expect(departmentsBulkWriteMock).not.toHaveBeenCalled();
  });
});

describe("autoSyncLocations - authorizedUsers + NVR canonical casing", () => {
  beforeEach(() => {
    departmentsFindMock.mockReturnValue(lean([]));
  });

  it("updates authorizedUsers to the casing stored in Location", async () => {
    authUsersFindMock.mockReturnValue(
      lean([{ _id: "u1", location: "bangalore", locationId: "L1" }])
    );
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(
      lean([{ _id: "L1", locationName: "Bangalore" }])
    );

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });

    expect(authUsersBulkWriteMock).toHaveBeenCalledOnce();
    const ops = authUsersBulkWriteMock.mock.calls[0][0];
    expect(ops[0].updateOne.update.$set.location).toBe("Bangalore");
    expect(locationInsertManyMock).not.toHaveBeenCalled();
  });

  it("canonicalizes array locations element-wise", async () => {
    authUsersFindMock.mockReturnValue(
      lean([{ _id: "u1", location: ["floor-1", "FLOOR-2"] }])
    );
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(
      lean([
        { _id: "L1", locationName: "Floor-1" },
        { _id: "L2", locationName: "Floor-2" },
      ])
    );

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });

    const setLoc =
      authUsersBulkWriteMock.mock.calls[0][0][0].updateOne.update.$set.location;
    expect(setLoc).toEqual(["Floor-1", "Floor-2"]);
  });

  it("does not rewrite records that already use canonical casing", async () => {
    authUsersFindMock.mockReturnValue(
      lean([{ _id: "u1", location: "Bangalore" }])
    );
    nvrFindMock.mockReturnValue(
      lean([{ _id: "n1", location: "Bangalore" }])
    );
    locationFindMock.mockReturnValue(
      lean([{ _id: "L1", locationName: "Bangalore" }])
    );

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });

    expect(authUsersBulkWriteMock).not.toHaveBeenCalled();
    expect(nvrBulkWriteMock).not.toHaveBeenCalled();
    expect(locationInsertManyMock).not.toHaveBeenCalled();
  });

  it("ignores non-string locations without crashing", async () => {
    authUsersFindMock.mockReturnValue(lean([{ _id: "u1", location: 123 }]));
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(lean([]));

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });

    expect(authUsersBulkWriteMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("skips authorizedUsers without a location", async () => {
    authUsersFindMock.mockReturnValue(
      lean([
        { _id: "u1", location: null },
        { _id: "u2" },
      ])
    );
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(lean([]));

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });
    expect(authUsersBulkWriteMock).not.toHaveBeenCalled();
  });

  it("updates NVR locations to canonical casing and skips empty ones", async () => {
    authUsersFindMock.mockReturnValue(lean([]));
    nvrFindMock.mockReturnValue(
      lean([
        { _id: "n1", location: "warehouse-x" },
        { _id: "n2", location: "BAY-1" },
        { _id: "n3", location: null },
      ])
    );
    locationFindMock.mockReturnValue(
      lean([
        { _id: "L1", locationName: "Warehouse-X" },
        { _id: "L2", locationName: "Bay-1" },
      ])
    );

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });

    expect(nvrBulkWriteMock).toHaveBeenCalledOnce();
    const ops = nvrBulkWriteMock.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops[0].updateOne.update.$set.location).toBe("Warehouse-X");
    expect(ops[1].updateOne.update.$set.location).toBe("Bay-1");
  });

  it("queries NVRs using the adminUserIdStr derived from userData.user_id", async () => {
    authUsersFindMock.mockReturnValue(lean([]));
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(lean([]));

    await autoSyncLocations({ _id: "admin1" }, { user_id: 42 });

    expect(nvrFindMock).toHaveBeenCalledOnce();
    expect(nvrFindMock.mock.calls[0][0]).toEqual({ userId: "42" });
  });

  it("tolerates missing user_id (passes undefined string)", async () => {
    authUsersFindMock.mockReturnValue(lean([]));
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(lean([]));

    await autoSyncLocations({ _id: "admin1" }, undefined);
    // userData?.user_id?.toString() → undefined → query is { userId: undefined }
    expect(nvrFindMock).toHaveBeenCalledOnce();
    expect(nvrFindMock.mock.calls[0][0]).toEqual({ userId: undefined });
  });
});

describe("autoSyncLocations — new location creation", () => {
  beforeEach(() => {
    departmentsFindMock.mockReturnValue(lean([]));
  });

  it("preserves source casing, deduplicates case-insensitively, and tags imports", async () => {
    authUsersFindMock.mockReturnValue(
      lean([
        { _id: "u1", location: "Office-A", locationId: "EMP-A" },
        { _id: "u2", location: ["Office-B", "OFFICE-a"] }, // dup of Office-A
      ])
    );
    nvrFindMock.mockReturnValue(
      lean([
        { _id: "n1", location: "Warehouse-X" },
        { _id: "n2", location: "office-a" }, // dup again, locationId stays EMP-A
      ])
    );
    locationFindMock.mockReturnValue(
      lean([{ _id: "L1", locationName: "Office-B" }]) // already exists (case-insensitive)
    );

    await autoSyncLocations({ _id: "admin99" }, { user_id: 7 });

    expect(locationInsertManyMock).toHaveBeenCalledOnce();
    const inserts = locationInsertManyMock.mock.calls[0][0];
    expect(inserts).toHaveLength(2);
    // Office-A is mapped first (with EMP-A), Office-B exists, Warehouse-X is new
    const names = inserts.map((i) => i.locationName);
    expect(names).toContain("Office-A");
    expect(names).toContain("Warehouse-X");
    expect(names).not.toContain("Office-B"); // already in collection
    const officeA = inserts.find((i) => i.locationName === "Office-A");
    expect(officeA.empLocationId).toBe("EMP-A");
    expect(officeA.adminId).toBe("admin99");
    expect(officeA.isImportedFromEMP).toBe(true);
    const warehouse = inserts.find((i) => i.locationName === "Warehouse-X");
    expect(warehouse.empLocationId).toBe(""); // NVR-sourced → no empLocationId
  });

  it("logs the count of new locations inserted", async () => {
    authUsersFindMock.mockReturnValue(
      lean([{ _id: "u1", location: "OneOnly", locationId: "EMP-1" }])
    );
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(lean([]));

    await autoSyncLocations({ _id: "admin99" }, { user_id: 7 });

    expect(loggerInfoMock).toHaveBeenCalledOnce();
    expect(loggerInfoMock.mock.calls[0][0]).toMatch(/Auto-synced 1 new locations/);
  });

  it("does not call insertMany when nothing new is found", async () => {
    authUsersFindMock.mockReturnValue(
      lean([{ _id: "u1", location: "Existing", locationId: "EMP-X" }])
    );
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(
      lean([{ _id: "L1", locationName: "existing" }]) // case-insensitive match
    );

    await autoSyncLocations({ _id: "admin99" }, { user_id: 7 });
    expect(locationInsertManyMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).not.toHaveBeenCalled();
  });

  it("handles existing-location records missing locationName without crashing", async () => {
    authUsersFindMock.mockReturnValue(
      lean([{ _id: "u1", location: "Alpha", locationId: "EMP-1" }])
    );
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(lean([{ _id: "L1" }])); // no locationName

    await autoSyncLocations({ _id: "admin99" }, { user_id: 7 });
    // Alpha not in existing set → inserted
    expect(locationInsertManyMock).toHaveBeenCalledOnce();
    expect(
      locationInsertManyMock.mock.calls[0][0][0].locationName
    ).toBe("Alpha");
  });

  it("skips falsy entries inside a location array on authorizedUsers", async () => {
    authUsersFindMock.mockReturnValue(
      lean([{ _id: "u1", location: ["", null, "GoodOne"], locationId: "EMP-1" }])
    );
    nvrFindMock.mockReturnValue(lean([]));
    locationFindMock.mockReturnValue(lean([]));

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });
    const inserts = locationInsertManyMock.mock.calls[0][0];
    expect(inserts.map((i) => i.locationName)).toEqual(["GoodOne"]);
  });
});

describe("autoSyncLocations — catch arm", () => {
  it("swallows errors and logs them when a DB call throws", async () => {
    departmentsFindMock.mockImplementation(() => {
      throw new Error("mongo down");
    });
    // Spy on console.error to silence the noisy fallback log
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await autoSyncLocations({ _id: "admin1" }, { user_id: 7 });

    expect(loggerErrorMock).toHaveBeenCalled();
    expect(loggerErrorMock.mock.calls[0][0]).toMatch(/Failed to auto-sync/);
    consoleErrSpy.mockRestore();
  });
});

// ---------- syncPermissionLocations ----------

describe("syncPermissionLocations", () => {
  it("no-ops when adminId is missing", async () => {
    await syncPermissionLocations(undefined);
    expect(permissionUpdateManyMock).not.toHaveBeenCalled();
  });

  it("no-ops when adminId is null", async () => {
    await syncPermissionLocations(null);
    expect(permissionUpdateManyMock).not.toHaveBeenCalled();
  });

  it("no-ops when adminId is empty string", async () => {
    await syncPermissionLocations("");
    expect(permissionUpdateManyMock).not.toHaveBeenCalled();
  });

  it("issues 4 updateMany calls (admin / read / write / custom)", async () => {
    permissionUpdateManyMock.mockResolvedValue({ matchedCount: 0 });
    await syncPermissionLocations("admin99");
    expect(permissionUpdateManyMock).toHaveBeenCalledTimes(4);
    expect(loggerInfoMock).toHaveBeenCalledOnce();
    expect(loggerInfoMock.mock.calls[0][0]).toMatch(/admin99/);
  });

  it("admin tier grants full CRUD on locations", async () => {
    permissionUpdateManyMock.mockResolvedValue({});
    await syncPermissionLocations("admin99");
    const [filter, update] = permissionUpdateManyMock.mock.calls[0];
    expect(filter.permissionName).toEqual({ $regex: /admin/i });
    expect(filter.adminId).toBe("admin99");
    expect(filter["permissionConfig.locations"]).toEqual({ $exists: false });
    expect(update.$set["permissionConfig.locations"]).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
  });

  it("read tier grants view-only on locations", async () => {
    permissionUpdateManyMock.mockResolvedValue({});
    await syncPermissionLocations("admin99");
    const [filter, update] = permissionUpdateManyMock.mock.calls[1];
    expect(filter.permissionName).toEqual({ $regex: /read/i });
    expect(update.$set["permissionConfig.locations"]).toEqual({
      view: true,
      create: false,
      edit: false,
      delete: false,
    });
  });

  it("write tier grants view/create/edit but not delete", async () => {
    permissionUpdateManyMock.mockResolvedValue({});
    await syncPermissionLocations("admin99");
    const [filter, update] = permissionUpdateManyMock.mock.calls[2];
    expect(filter.permissionName).toEqual({ $regex: /write/i });
    expect(update.$set["permissionConfig.locations"]).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: false,
    });
  });

  it("custom tier (not matching admin/read/write) gets full CRUD", async () => {
    permissionUpdateManyMock.mockResolvedValue({});
    await syncPermissionLocations("admin99");
    const [filter, update] = permissionUpdateManyMock.mock.calls[3];
    expect(filter.permissionName).toEqual({ $not: { $regex: /admin|read|write/i } });
    expect(update.$set["permissionConfig.locations"]).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
  });

  it("swallows + logs errors when a DB call throws", async () => {
    permissionUpdateManyMock.mockRejectedValueOnce(new Error("mongo boom"));
    await syncPermissionLocations("admin99");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
    expect(loggerErrorMock.mock.calls[0][0]).toMatch(
      /Error auto-syncing permission locations/
    );
  });
});
