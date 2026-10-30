/**
 * Integration test for AuthUsersService — the tractable read paths against
 * in-memory MongoDB. SFTP/AI-heavy create/delete methods are not exercised;
 * axios + connectSFTP are mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import axios from "axios";
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
const { default: V2AuthUsersService } = await import("../../../core/v2/authorizedUsers/authorizedUsers.service.js");
const { default: AccessLogs } = await import("../../../core/v1/accesslogs/newAccessLogs.model.js");

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

describe("V2 access-log tagging", () => {
  beforeEach(() => {
    axios.post.mockReset();
    vi.spyOn(V2AuthUsersService, "getDSAuthUsersAPI").mockResolvedValue("http://ds-auth-users.test");
  });
  afterEach(() => vi.restoreAllMocks());

  async function tag(log, user, tagValue = true) {
    const ctx = serviceCtx({
      adminId: admin._id,
      query: { userId: String(user._id) },
      body: { tag: tagValue, accessLogId: String(log._id), profileImages: ["https://images.test/person.jpg"] },
    });
    await V2AuthUsersService.tagUser(ctx.req, ctx.res, ctx.next);
    return ctx.res;
  }

  it("links an unknown log to the selected user and includes it in tagged results", async () => {
    const user = await seedEmployee();
    const log = await AccessLogs.create({ admin: admin._id });
    axios.post.mockResolvedValue({ status: 200 });
    expect((await tag(log, user)).statusCode).toBe(200);
    const tagged = await AccessLogs.findOne({ _id: log._id, tag: true }).populate("userId");
    expect(String(tagged.userId._id)).toBe(String(user._id));
    expect(tagged.userId.tag).toBe(true);
    expect(tagged.taggedAt).toBeInstanceOf(Date);
  });

  it("does not change identity or tag state when the face service fails", async () => {
    const user = await seedEmployee();
    const log = await AccessLogs.create({ admin: admin._id });
    axios.post.mockRejectedValue(new Error("Face service unavailable"));
    expect((await tag(log, user)).statusCode).toBe(502);
    const unchanged = await AccessLogs.findById(log._id);
    expect(unchanged.userId).toBeUndefined();
    expect(unchanged.tag).toBe(false);
    expect((await AuthorizedUsers.findById(user._id)).tag).not.toBe(true);
  });

  it("rejects a log owned by another account before contacting the face service", async () => {
    const user = await seedEmployee();
    const log = await AccessLogs.create({ admin: new mongoose.Types.ObjectId() });
    expect((await tag(log, user)).statusCode).toBe(404);
    expect(axios.post).not.toHaveBeenCalled();
    expect((await AccessLogs.findById(log._id)).tag).toBe(false);
  });

  it("untags a linked log while preserving its recognized identity", async () => {
    const user = await seedEmployee({ tag: true });
    const log = await AccessLogs.create({ admin: admin._id, userId: user._id, tag: true });
    axios.post.mockResolvedValue({ status: 200 });
    expect((await tag(log, user, false)).statusCode).toBe(200);
    const updated = await AccessLogs.findById(log._id);
    expect(updated.tag).toBe(false);
    expect(String(updated.userId)).toBe(String(user._id));
  });
});

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
