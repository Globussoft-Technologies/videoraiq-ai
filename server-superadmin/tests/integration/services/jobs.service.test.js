/**
 * Integration test for JobsService — the tractable mockCreateJobs paths and
 * the pure handleProfileNotification logic. The BullMQ scheduler
 * (createJobsForNextDays) is mocked; Redis-backed paths (mockDeleteAllJobs,
 * Digest mode) are not exercised.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../core/v1/jobs/utils/scheduleJobs.js", () => ({
  createJobsForNextDays: vi.fn().mockResolvedValue(undefined),
}));

const { default: JobsService } = await import(
  "../../../core/v1/jobs/jobs.service.js"
);
const { default: Profile } = await import(
  "../../../core/v1/profiles/profiles.model.js"
);
await import("../../../core/v1/channels/channels.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

function seedProfile(over = {}) {
  return Profile.create({
    userType: "Admin",
    createdBy: new mongoose.Types.ObjectId(),
    user: new mongoose.Types.ObjectId(),
    basics: { profileName: "Seeded" },
    ...over,
  });
}

describe("JobsService.mockCreateJobs", () => {
  it("returns 400 when profileId is missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await JobsService.mockCreateJobs(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an unknown profile", async () => {
    const { req, res, next } = serviceCtx({
      body: { profileId: new mongoose.Types.ObjectId().toString() },
    });
    await JobsService.mockCreateJobs(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("creates jobs for an existing profile (200)", async () => {
    const profile = await seedProfile();
    const { req, res, next } = serviceCtx({
      body: { profileId: profile._id.toString() },
    });
    await JobsService.mockCreateJobs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });
});

describe("JobsService.handleProfileNotification", () => {
  it("returns false when there is no profile", async () => {
    expect(await JobsService.handleProfileNotification(null)).toBe(false);
  });

  it("returns false when the profile has no notification config", async () => {
    expect(await JobsService.handleProfileNotification({})).toBe(false);
  });

  it("returns false when the email channel is disabled", async () => {
    const profile = { notification: { channels: { email: false } } };
    expect(await JobsService.handleProfileNotification(profile)).toBe(false);
  });

  it("returns true for an Instant notification with email enabled", async () => {
    const profile = {
      notification: { notify: "Instant", channels: { email: true } },
    };
    expect(await JobsService.handleProfileNotification(profile)).toBe(true);
  });
});
