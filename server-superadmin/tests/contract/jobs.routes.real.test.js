/**
 * Real vertical Supertest contract for `/api/v1/jobs` — mounts the real
 * router on a fresh Express app and exercises the actual controller +
 * service + Mongo persistence. Targets `jobs.controller.js` (0% covered).
 *
 * Mocks:
 *   1. core/v1/jobs/utils/scheduleJobs.js  — stub `createJobsForNextDays`
 *      (BullMQ scheduler — not test-safe).
 *   2. utils/database.js                   — stub `redis` (ioredis client)
 *      so `mockDeleteAllJobs` `#clearBullKeys` doesn't touch real Redis.
 *
 * Total: 2 mocks. Everything else (Joi-free validation, controller
 * pass-through, profile model lookup) runs for real.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

vi.mock("../../core/v1/jobs/utils/scheduleJobs.js", () => ({
  createJobsForNextDays: vi.fn().mockResolvedValue(undefined),
}));

// The redis client is module-scope inside jobs.service.js. Stub it so
// `#clearBullKeys` runs to completion without touching a real instance.
vi.mock("../../utils/database.js", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
  redis: {
    scan: vi.fn().mockResolvedValue(["0", []]),
    del: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: jobsRoutes } = await import(
  "../../core/v1/jobs/jobs.routes.js"
);
const { default: Profile } = await import(
  "../../core/v1/profiles/profiles.model.js"
);
await import("../../core/v1/channels/channels.model.js");
const { createJobsForNextDays } = await import(
  "../../core/v1/jobs/utils/scheduleJobs.js"
);
const { redis: mockRedis } = await import("../../utils/database.js");

let app;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
  // re-prime scan default so it returns no keys
  mockRedis.scan.mockResolvedValue(["0", []]);
  app = buildApp((a) => a.use("/api/v1/jobs", jobsRoutes));
});

const inner = (res) => res.body?.body ?? res.body;

function seedProfile(over = {}) {
  return Profile.create({
    userType: "Admin",
    createdBy: new mongoose.Types.ObjectId(),
    user: new mongoose.Types.ObjectId(),
    basics: { profileName: "Seeded" },
    ...over,
  });
}

// ----------------------------------------------------------------------------
// POST /mock  →  mockCreateJobs
// ----------------------------------------------------------------------------
describe("POST /api/v1/jobs/mock (real vertical)", () => {
  it("returns 400 when profileId is missing", async () => {
    const res = await request(app).post("/api/v1/jobs/mock").send({});
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
    expect(createJobsForNextDays).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown profileId", async () => {
    const res = await request(app)
      .post("/api/v1/jobs/mock")
      .send({ profileId: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
    expect(createJobsForNextDays).not.toHaveBeenCalled();
  });

  it("returns 200 and calls createJobsForNextDays for an existing profile", async () => {
    const profile = await seedProfile();
    const res = await request(app)
      .post("/api/v1/jobs/mock")
      .send({ profileId: profile._id.toString() });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(createJobsForNextDays).toHaveBeenCalledTimes(1);
    expect(createJobsForNextDays.mock.calls[0][0]._id.toString()).toBe(
      profile._id.toString(),
    );
  });

  it("returns 400 when createJobsForNextDays throws", async () => {
    const profile = await seedProfile();
    createJobsForNextDays.mockRejectedValueOnce(new Error("scheduler blew up"));
    const res = await request(app)
      .post("/api/v1/jobs/mock")
      .send({ profileId: profile._id.toString() });
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// DELETE /mock  →  mockDeleteAllJobs
// ----------------------------------------------------------------------------
describe("DELETE /api/v1/jobs/mock (real vertical)", () => {
  it("returns 200 when no bull:* keys exist", async () => {
    const res = await request(app).delete("/api/v1/jobs/mock");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(mockRedis.scan).toHaveBeenCalled();
    // No keys found, so del should not be invoked.
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("scans iteratively and deletes any bull:* keys found", async () => {
    // First scan returns two keys with cursor "1"; second returns no keys
    // with cursor "0" so the do-while loop exits.
    mockRedis.scan
      .mockResolvedValueOnce(["1", ["bull:queue:1", "bull:queue:2"]])
      .mockResolvedValueOnce(["0", []]);
    const res = await request(app).delete("/api/v1/jobs/mock");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    expect(mockRedis.del).toHaveBeenCalledTimes(1);
    expect(mockRedis.del).toHaveBeenCalledWith("bull:queue:1", "bull:queue:2");
  });

  it("returns 400 when redis.scan throws", async () => {
    mockRedis.scan.mockRejectedValueOnce(new Error("redis is down"));
    const res = await request(app).delete("/api/v1/jobs/mock");
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });
});
