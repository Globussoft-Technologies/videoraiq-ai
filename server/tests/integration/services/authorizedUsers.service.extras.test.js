/**
 * Integration tests for AuthUsersService — extra branches not covered by
 * the existing authorizedUsers.service.test.js. Covers:
 *   - fetchAuthUser deeper branches (roleIds invalid, search→department lookup,
 *     locations filter, verified=true filter, departmentIds via body)
 *   - deleteAllAuthUsers (no adminId, admin not found, no users, happy path
 *     with unverified users — SFTP/AI cleanup short-circuits)
 *   - authUserLogin (missing fields, unknown user/null password)
 *   - verifyUser (missing file)
 *   - bulkImportAuthUser (no admin, no users, missing field rows, duplicate
 *     emails in file, duplicate emails in DB, happy path)
 *   - fetchUniqueLocations (search filter, pagination)
 *
 * Mocks: 3 — axios, sftpConnectionCheck, newSFTPConnectionCheck.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("axios", () => ({
  default: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../../utils/sftpConnectionCheck.js", () => ({
  checkSftpConnection: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  }),
}));

const { default: AuthUsersService } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.service.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);

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
    user_id: "10",
    login: "x",
    email: "x@test.com",
  });
});

function seedEmployee(over = {}) {
  return AuthorizedUsers.create({
    adminId: admin._id,
    firstName: "Emp",
    lastName: "One",
    email: `emp-${Math.random()}@test.com`,
    location: "HQ",
    verified: false,
    ...over,
  });
}

// ----------------------------------------------------------------------------
// fetchAuthUser — additional branches
// ----------------------------------------------------------------------------
describe("AuthUsersService.fetchAuthUser — deeper branches", () => {
  it("rejects invalid roleIds (mismatch with rolesCount)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
      body: { roleIds: [new mongoose.Types.ObjectId().toString()] },
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("filters by departmentIds list provided in body", async () => {
    const dept = await Department.create({
      adminId: admin._id,
      departmentName: "Sales",
    });
    await seedEmployee({ departmentId: dept._id });
    await seedEmployee({ firstName: "NoDept" }); // no department

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
      body: { departmentIds: [dept._id.toString()] },
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("filters by locations list provided in body", async () => {
    await seedEmployee({ location: "Mumbai" });
    await seedEmployee({ location: "Delhi" });
    await seedEmployee({ location: "Mumbai" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
      body: { locations: ["Mumbai"] },
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
  });

  it("filters by verified flag from the query", async () => {
    await seedEmployee({ verified: true });
    await seedEmployee({ verified: false });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { verified: true },
      body: {},
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("widens search to departmentId via a matching departmentName", async () => {
    const dept = await Department.create({
      adminId: admin._id,
      departmentName: "Engineering",
    });
    await seedEmployee({ departmentId: dept._id, firstName: "Alice" });
    await seedEmployee({ firstName: "Bob" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { search: "engineer" },
      body: {},
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    // Search → no userName/email hit, but department fallback should find Alice.
    expect(payload(res).data.totalCount).toBe(1);
  });
});

// ----------------------------------------------------------------------------
// deleteAllAuthUsers
// ----------------------------------------------------------------------------
describe("AuthUsersService.deleteAllAuthUsers", () => {
  it("returns 400 when adminId is missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    req.verified = { userData: {} };
    await AuthUsersService.deleteAllAuthUsers(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("returns failed when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId().toString(),
      body: {},
    });
    req.verified.userData.user_id = "10";
    await AuthUsersService.deleteAllAuthUsers(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 404 when no authorized users exist for the admin", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {},
    });
    req.verified.userData.user_id = "10";
    await AuthUsersService.deleteAllAuthUsers(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("deletes unverified users for an admin (short-circuits SFTP/AI cleanup)", async () => {
    await seedEmployee({ verified: false, firstName: "A" });
    await seedEmployee({ verified: false, firstName: "B" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {},
    });
    req.verified.userData.user_id = "10";
    await AuthUsersService.deleteAllAuthUsers(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.deletedUsers).toHaveLength(2);

    const remaining = await AuthorizedUsers.countDocuments({
      adminId: admin._id,
    });
    expect(remaining).toBe(0);
  });
});

// ----------------------------------------------------------------------------
// authUserLogin
// ----------------------------------------------------------------------------
describe("AuthUsersService.authUserLogin", () => {
  it("returns 400 when usernameOrEmail/password are missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await AuthUsersService.authUserLogin(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 401 for an unknown user (null-check before decrypt)", async () => {
    const { req, res, next } = serviceCtx({
      body: { usernameOrEmail: "ghost@test.com", password: "p" },
    });
    await AuthUsersService.authUserLogin(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Invalid email\/username or password/);
  });
});

// ----------------------------------------------------------------------------
// verifyUser
// ----------------------------------------------------------------------------
describe("AuthUsersService.verifyUser", () => {
  it("returns 400 when no file is attached to the request", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await AuthUsersService.verifyUser(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// bulkImportAuthUser
// ----------------------------------------------------------------------------
describe("AuthUsersService.bulkImportAuthUser", () => {
  it("fails when there is no verified user context", async () => {
    const { req, res, next } = serviceCtx({ body: { users: [] } });
    req.verified = {};
    await AuthUsersService.bulkImportAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when the users array is empty", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { users: [] },
    });
    await AuthUsersService.bulkImportAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("collects row-level errors for missing fields and duplicate-in-file emails", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        users: [
          { firstName: "A", lastName: "x", email: "a@test.com" }, // missing userName
          { userName: "b", lastName: "x", email: "b@test.com" }, // missing firstName
          { userName: "c", firstName: "c", email: "c@test.com" }, // missing lastName
          { userName: "d", firstName: "d", lastName: "d" }, // missing email
          { userName: "e", firstName: "e", lastName: "e", email: "dup@test.com" },
          { userName: "f", firstName: "f", lastName: "f", email: "dup@test.com" },
        ],
      },
    });
    await AuthUsersService.bulkImportAuthUser(req, res, next);
    // success:false with errors array
    expect(res._body.success).toBe(false);
    expect(Array.isArray(res._body.errors)).toBe(true);
    expect(res._body.errors.length).toBeGreaterThanOrEqual(5);
  });

  it("flags users that already exist in the DB", async () => {
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Old",
      lastName: "User",
      email: "exists@test.com",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        users: [
          {
            userName: "n1",
            firstName: "N1",
            lastName: "L1",
            email: "exists@test.com",
          },
        ],
      },
    });
    await AuthUsersService.bulkImportAuthUser(req, res, next);
    expect(res._body.success).toBe(false);
    expect(res._body.errors[0].error).toMatch(/already exists/);
  });

  it("imports valid new users into the DB (happy path)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        users: [
          {
            userName: "n1",
            firstName: "N1",
            lastName: "L1",
            email: "n1@test.com",
          },
          {
            userName: "n2",
            firstName: "N2",
            lastName: "L2",
            email: "n2@test.com",
          },
        ],
      },
    });
    await AuthUsersService.bulkImportAuthUser(req, res, next);
    expect(payload(res).status).toBe("success");

    const count = await AuthorizedUsers.countDocuments({ adminId: admin._id });
    expect(count).toBe(2);
  });
});

// ----------------------------------------------------------------------------
// fetchUniqueLocations — extra branches
// ----------------------------------------------------------------------------
describe("AuthUsersService.fetchUniqueLocations — extras", () => {
  it("applies a regex search to the location field", async () => {
    await seedEmployee({ location: "Mumbai" });
    await seedEmployee({ location: "Delhi" });
    await seedEmployee({ location: "Mumbai-Branch" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { search: "mum" },
    });
    await AuthUsersService.fetchUniqueLocations(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
  });

  it("respects skip/limit pagination on the location list", async () => {
    await seedEmployee({ location: "A" });
    await seedEmployee({ location: "B" });
    await seedEmployee({ location: "C" });
    await seedEmployee({ location: "D" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { skip: "1", limit: "2" },
    });
    await AuthUsersService.fetchUniqueLocations(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.locations).toHaveLength(2);
    expect(payload(res).data.totalCount).toBe(4);
  });
});
