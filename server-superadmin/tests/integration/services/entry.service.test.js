/**
 * Integration test for EntryService — register / log / get / getUsers /
 * getUserEntries against in-memory MongoDB. Socket + jobs + mail are mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { entryLog: vi.fn().mockResolvedValue(undefined) },
}));

const { default: EntryService } = await import(
  "../../../core/v1/entry/entry.service.js"
);
const { default: Entry } = await import(
  "../../../core/v1/entry/entry.model.js"
);
const { default: EntryUser } = await import(
  "../../../core/v1/entry/user.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
// Imported so Mongoose registers the NVR + Channel schemas that
// getUserEntries / log populate against.
await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/channels/channels.model.js");

const adminId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("EntryService.register", () => {
  it("registers a new entry user (201)", async () => {
    const { req, res } = serviceCtx({
      adminId,
      body: { firstName: "Jane", lastName: "Doe", email: "jane@test.com" },
    });
    await EntryService.register(req, res);
    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    expect(await EntryUser.countDocuments()).toBe(1);
  });

  it("rejects a missing required field (400)", async () => {
    const { req, res } = serviceCtx({
      adminId,
      body: { firstName: "Jane" },
    });
    await EntryService.register(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a duplicate email (409)", async () => {
    await EntryUser.create({
      firstName: "A",
      lastName: "B",
      email: "dup@test.com",
    });
    const { req, res } = serviceCtx({
      adminId,
      body: { firstName: "C", lastName: "D", email: "dup@test.com" },
    });
    await EntryService.register(req, res);
    expect(res.statusCode).toBe(409);
  });
});

describe("EntryService.log", () => {
  it("returns 400 for an invalid body", async () => {
    const { req, res } = serviceCtx({ adminId, body: {} });
    await EntryService.log(req, res);
    expect(res.statusCode).toBe(400);
    expect(res._body.success).toBe(false);
  });

  it("returns 404 when the admin does not exist", async () => {
    const { req, res } = serviceCtx({
      adminId,
      body: {
        adminId: new mongoose.Types.ObjectId().toString(),
        userId: new mongoose.Types.ObjectId().toString(),
        nvrId: new mongoose.Types.ObjectId().toString(),
        channelId: new mongoose.Types.ObjectId().toString(),
        images: { face: "http://cdn/f.jpg" },
      },
    });
    await EntryService.log(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("EntryService.getUsers", () => {
  beforeEach(async () => {
    await EntryUser.create({ firstName: "Alice", lastName: "Smith", email: "a@x.com" });
    await EntryUser.create({ firstName: "Bob", lastName: "Jones", email: "b@x.com" });
  });

  it("returns all users when no search term", async () => {
    const { req, res } = serviceCtx({ adminId, query: {} });
    await EntryService.getUsers(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.users).toHaveLength(2);
  });

  it("filters users by search term", async () => {
    const { req, res } = serviceCtx({ adminId, query: { search: "alice" } });
    await EntryService.getUsers(req, res);
    expect(payload(res).data.users).toHaveLength(1);
    expect(payload(res).data.users[0].firstName).toBe("Alice");
  });
});

describe("EntryService.getUserEntries", () => {
  it("rejects an invalid user id (400)", async () => {
    const { req, res } = serviceCtx({
      adminId,
      params: { userId: "not-valid" },
      query: {},
    });
    await EntryService.getUserEntries(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns the user's entries", async () => {
    const user = await EntryUser.create({
      firstName: "E",
      lastName: "F",
      email: "e@x.com",
    });
    await Entry.create({ adminId, userId: user._id, events: [] });
    const { req, res } = serviceCtx({
      adminId,
      params: { userId: user._id.toString() },
      query: {},
    });
    await EntryService.getUserEntries(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.entries).toHaveLength(1);
  });
});

describe("EntryService.get", () => {
  it("returns an entry summary with a total", async () => {
    const user = await EntryUser.create({
      firstName: "G",
      lastName: "H",
      email: "g@x.com",
    });
    await Entry.create({ adminId, userId: user._id, events: [] });
    const { req, res } = serviceCtx({ adminId, query: {} });
    await EntryService.get(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data).toHaveProperty("total");
    expect(payload(res).data).toHaveProperty("entryLogs");
  });
});
