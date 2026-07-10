/**
 * Extra AdminService coverage — member-context happy paths and the
 * Invalid-Token branch of fetchLogsSound, plus the deletionJobs happy
 * path of getDeletionProgress. The base admin.service.test.js only
 * exercises the admin-context happy paths and the member-not-found
 * failure branches; the matching member-context happy and "no token
 * context" branches were uncovered.
 *
 * Covered here:
 *   - updateLogsSound: member-context happy path (existing user document
 *     gets logsSound flipped).
 *   - fetchLogsSound: member-context happy path (returns the user's
 *     stored logsSound), member-context default-false branch, and the
 *     "neither adminId nor memberId" else arm that returns "Invalid
 *     Token!".
 *   - getDeletionProgress: happy path with deletionJobs Map populated.
 *
 * Mocks: 1 — `axios` (matches the existing admin.service test files,
 * required because admin.service.js imports axios at module-load time).
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

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const { default: AdminService, deletionJobs } = await import(
  "../../../core/v1/admin/admin.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Users } = await import(
  "../../../core/v1/users/users.model.js"
);

let admin;
let memberUser;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  deletionJobs.clear();
  admin = await Admin.create({
    user_id: "1",
    login: "logsAdmin",
    email: "logsAdmin@test.com",
  });
  // Authorized user with adminId + required roleIds to satisfy the schema.
  memberUser = await Users.create({
    adminId: admin._id,
    roleIds: new mongoose.Types.ObjectId(),
    firstName: "Member",
    lastName: "User",
    email: `member-${Date.now()}@test.com`,
    logsSound: false,
  });
});

describe("AdminService.updateLogsSound — member branch (happy)", () => {
  it("flips logsSound on the user document and returns success", async () => {
    const { req, res, next } = serviceCtx({
      memberId: memberUser._id.toString(),
      body: { logsSound: true },
    });
    await AdminService.updateLogsSound(req, res, next);

    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/user/i);

    const reloaded = await Users.findById(memberUser._id);
    expect(reloaded.logsSound).toBe(true);
  });
});

describe("AdminService.fetchLogsSound — member branch (happy)", () => {
  it("returns the user's stored logsSound value", async () => {
    // Seed a member with logsSound=true so we exercise the "logsSound = ..."
    // assignment and confirm the value is propagated back to the response.
    await Users.findByIdAndUpdate(memberUser._id, { $set: { logsSound: true } });

    const { req, res, next } = serviceCtx({
      memberId: memberUser._id.toString(),
    });
    await AdminService.fetchLogsSound(req, res, next);

    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/user/i);
    expect(payload(res).data).toEqual({ logsSound: true });
  });

  it("defaults to false when the user has no stored logsSound", async () => {
    // logsSound stays at the schema default (false) for this member.
    const { req, res, next } = serviceCtx({
      memberId: memberUser._id.toString(),
    });
    await AdminService.fetchLogsSound(req, res, next);

    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toEqual({ logsSound: false });
  });
});

describe("AdminService.fetchLogsSound — invalid-token branch", () => {
  it("returns 'Invalid Token!' when neither adminId nor memberId is present", async () => {
    // serviceCtx default leaves both adminId and memberId undefined.
    const { req, res, next } = serviceCtx({});
    await AdminService.fetchLogsSound(req, res, next);

    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Invalid Token/i);
  });
});

describe("AdminService.getDeletionProgress — happy path", () => {
  it("returns the in-progress job snapshot when one exists for the email", async () => {
    const email = "deleter@test.com";
    const jobSnap = {
      status: "in-progress",
      total: 3,
      processed: 1,
      startedAt: new Date().toISOString(),
    };
    deletionJobs.set(email, jobSnap);

    const { req, res, next } = serviceCtx({ query: { email } });
    await AdminService.getDeletionProgress(req, res, next);

    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/Deletion progress fetched/i);
    expect(payload(res).data).toEqual(jobSnap);
  });
});
