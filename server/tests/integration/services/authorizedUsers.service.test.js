/**
 * Integration test for AuthUsersService — the tractable read paths against
 * in-memory MongoDB. SFTP/AI-heavy create/delete methods are not exercised;
 * axios + connectSFTP are mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn(),
    end: vi.fn(),
  }),
}));
vi.mock("../../../utils/sftpConnectionCheck.js", () => ({
  checkSftpConnection: vi.fn().mockResolvedValue(true),
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
    login: "a",
    email: "a@test.com",
  });
});

function seedEmployee(over = {}) {
  return AuthorizedUsers.create({
    adminId: admin._id,
    firstName: "Emp",
    lastName: "One",
    email: `emp${Math.random()}@test.com`,
    location: "HQ",
    ...over,
  });
}

describe("AuthUsersService.fetchAuthUser", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: {},
      body: {},
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the admin's authorized users", async () => {
    await seedEmployee();
    await seedEmployee({ firstName: "Emp", lastName: "Two" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
      body: {},
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
  });

  it("returns a single user when userId is given", async () => {
    const emp = await seedEmployee();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: emp._id.toString() },
      body: {},
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("returns an empty result for an unknown userId", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { userId: new mongoose.Types.ObjectId().toString() },
      body: {},
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(0);
  });

  it("filters by search term", async () => {
    await seedEmployee({ firstName: "Alice" });
    await seedEmployee({ firstName: "Bob" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { search: "alice" },
      body: {},
    });
    await AuthUsersService.fetchAuthUser(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

describe("AuthUsersService.fetchUniqueLocations", () => {
  it("returns the distinct locations for the admin's employees", async () => {
    await seedEmployee({ location: "HQ" });
    await seedEmployee({ location: "Branch" });
    await seedEmployee({ location: "HQ" });
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    await AuthUsersService.fetchUniqueLocations(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.locations.sort()).toEqual(["Branch", "HQ"]);
  });

  it("returns 401 when there is no user context", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    req.verified = {};
    await AuthUsersService.fetchUniqueLocations(req, res, next);
    expect(res.statusCode).toBe(401);
  });
});
