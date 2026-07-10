/**
 * Integration tests for AttendanceService.getAttendance,
 * AttendanceService.buildAttendancePipeline, and
 * AttendanceService.exportAttendance against in-memory MongoDB.
 *
 * These methods are pure read-side aggregations (no socket emits, no axios),
 * so we exercise them end-to-end via Attendance.aggregate(pipeline). The Excel
 * and PDF export paths are NOT exercised (binary streams require additional
 * harness work); only the early-return "no data" branch of exportAttendance is.
 *
 * Mock count: 1 (socket.js — imported transitively by the service module).
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

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));

const { default: AttendanceService } = await import(
  "../../../core/v1/attendance/attendance.service.js"
);
const { default: Attendance } = await import(
  "../../../core/v1/attendance/attendance.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);
await import("../../../core/v1/NVR/nvr.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

/** Build a fresh admin + employee + channel + department for a test. */
async function seed({ employeeOver = {} } = {}) {
  const admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
  const department = await Department.create({
    adminId: admin._id,
    departmentName: "Engineering",
  });
  const employee = await AuthorizedUsers.create({
    adminId: admin._id,
    firstName: "Emp",
    lastName: "One",
    email: "emp@test.com",
    departmentId: department._id,
    ...employeeOver,
  });
  const nvrId = new mongoose.Types.ObjectId();
  const channel = await Channel.create({
    nvrId,
    userId: admin.user_id,
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam-Main",
    customName: "Front Door",
  });
  return { admin, department, employee, channel, nvrId };
}

/** Seed an attendance row with a checkin + checkout pair on a given date. */
async function seedAttendance(
  { admin, employee, channel, nvrId },
  { checkinAt, checkoutAt, createdAt } = {},
) {
  const now = new Date();
  return Attendance.create({
    user: admin._id,
    employee: employee._id,
    createdAt: createdAt ?? now,
    events: [
      {
        cameraType: "checkin",
        timestamp: checkinAt ?? new Date(now.getTime() - 60 * 60 * 1000),
        channel: channel._id,
        nvr: nvrId,
        images: { face: "f1" },
      },
      {
        cameraType: "checkout",
        timestamp: checkoutAt ?? new Date(now.getTime() - 10 * 60 * 1000),
        channel: channel._id,
        nvr: nvrId,
        images: { face: "f2" },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// buildAttendancePipeline — returns a Mongo aggregation array; we sanity-check
// shape and a few branches.
// ---------------------------------------------------------------------------
describe("AttendanceService.buildAttendancePipeline", () => {
  it("returns an array of stages including $match + $unwind + $sort", async () => {
    const seeded = await seed();
    const { req } = serviceCtx({
      adminId: seeded.admin._id,
      query: {},
      body: {},
    });
    const pipeline = await AttendanceService.buildAttendancePipeline(req);
    expect(Array.isArray(pipeline)).toBe(true);
    const stageKeys = pipeline.map((stage) => Object.keys(stage)[0]);
    expect(stageKeys).toContain("$match");
    expect(stageKeys).toContain("$unwind");
    expect(stageKeys).toContain("$sort");
    // Pagination present when not exporting.
    expect(stageKeys).toContain("$skip");
    expect(stageKeys).toContain("$limit");
  });

  it("omits $skip/$limit when export is requested", async () => {
    const seeded = await seed();
    const { req } = serviceCtx({
      adminId: seeded.admin._id,
      query: { export: "true" },
      body: {},
    });
    const pipeline = await AttendanceService.buildAttendancePipeline(req, true);
    const stageKeys = pipeline.map((stage) => Object.keys(stage)[0]);
    expect(stageKeys).not.toContain("$skip");
    expect(stageKeys).not.toContain("$limit");
  });

  it("short-circuits to [{ $match: { _id: null } }] when a non-admin requests channels outside their authorization", async () => {
    const seeded = await seed();
    const someChannelId = new mongoose.Types.ObjectId().toString();
    const { req } = serviceCtx({
      adminId: seeded.admin._id,
      memberId: "member-1", // non-admin
      authorizedChannel: { channels: [], nvrIds: [] },
      query: { channelId: someChannelId },
      body: {},
    });
    const pipeline = await AttendanceService.buildAttendancePipeline(req);
    expect(pipeline).toEqual([{ $match: { _id: null } }]);
  });

  it("short-circuits when a non-admin requests NVRs outside their authorization", async () => {
    const seeded = await seed();
    const someNvrId = new mongoose.Types.ObjectId().toString();
    const { req } = serviceCtx({
      adminId: seeded.admin._id,
      memberId: "member-1",
      authorizedChannel: { channels: [], nvrIds: [] },
      query: { nvrId: someNvrId },
      body: {},
    });
    const pipeline = await AttendanceService.buildAttendancePipeline(req);
    expect(pipeline).toEqual([{ $match: { _id: null } }]);
  });

  it("supports a custom sortField (fullname / date / checkout / location / department)", async () => {
    const seeded = await seed();
    for (const sortField of [
      "fullname",
      "date",
      "checkout",
      "location",
      "department",
    ]) {
      const { req } = serviceCtx({
        adminId: seeded.admin._id,
        query: { sortField, sortOrder: "asc" },
        body: {},
      });
      const pipeline = await AttendanceService.buildAttendancePipeline(req);
      const sortStage = pipeline.find((s) => "$sort" in s);
      expect(sortStage).toBeDefined();
    }
  });

  it("filters by employeeLocations passed in the body", async () => {
    const seeded = await seed({ employeeOver: { location: "HQ" } });
    const { req } = serviceCtx({
      adminId: seeded.admin._id,
      query: {},
      body: { employeeLocations: ["HQ"] },
    });
    const pipeline = await AttendanceService.buildAttendancePipeline(req);
    const matchStage = pipeline.find((s) => "$match" in s);
    expect(matchStage.$match.employee).toBeDefined();
    expect(matchStage.$match.employee.$in).toBeInstanceOf(Array);
  });
});

// ---------------------------------------------------------------------------
// getAttendance — the read endpoint that runs buildAttendancePipeline and
// shapes the response.
// ---------------------------------------------------------------------------
describe("AttendanceService.getAttendance", () => {
  it("returns an empty summary when no attendance rows exist", async () => {
    const seeded = await seed();
    const { req, res } = serviceCtx({
      adminId: seeded.admin._id,
      query: {},
      body: {},
    });
    await AttendanceService.getAttendance(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.total).toBe(0);
    expect(payload(res).data.attendanceLogs).toEqual([]);
  });

  it("returns aggregated check-in / check-out per employee per day", async () => {
    const seeded = await seed();
    await seedAttendance(seeded);
    const { req, res } = serviceCtx({
      adminId: seeded.admin._id,
      query: {},
      body: {},
    });
    await AttendanceService.getAttendance(req, res);
    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.total).toBe(1);
    expect(data.attendanceLogs).toHaveLength(1);
    const row = data.attendanceLogs[0];
    expect(row.logInTime).toBeDefined();
    expect(row.logOutTime).toBeDefined();
    expect(row.minutesSpent).toBeGreaterThan(0);
    // Channel customName takes precedence over name.
    expect(row.checkinCam).toBe("Front Door");
    expect(row.checkoutCam).toBe("Front Door");
    expect(row.imageUrls).toHaveLength(2);
  });

  it("filters by name (case-insensitive regex on employee.fullName)", async () => {
    const seeded = await seed();
    await seedAttendance(seeded);
    const { req, res } = serviceCtx({
      adminId: seeded.admin._id,
      query: { name: "emp" },
      body: {},
    });
    await AttendanceService.getAttendance(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);

    // Non-matching name → zero rows.
    const ctx2 = serviceCtx({
      adminId: seeded.admin._id,
      query: { name: "no-such-name-xyz" },
      body: {},
    });
    await AttendanceService.getAttendance(ctx2.req, ctx2.res);
    expect(ctx2.res.statusCode).toBe(200);
    expect(payload(ctx2.res).data.total).toBe(0);
  });

  it("filters by departmentIds", async () => {
    const seeded = await seed();
    await seedAttendance(seeded);

    // Real department → row included.
    const ctx1 = serviceCtx({
      adminId: seeded.admin._id,
      query: { departmentIds: seeded.department._id.toString() },
      body: {},
    });
    await AttendanceService.getAttendance(ctx1.req, ctx1.res);
    expect(payload(ctx1.res).data.total).toBe(1);

    // Bogus department → zero rows.
    const ctx2 = serviceCtx({
      adminId: seeded.admin._id,
      query: { departmentIds: new mongoose.Types.ObjectId().toString() },
      body: {},
    });
    await AttendanceService.getAttendance(ctx2.req, ctx2.res);
    expect(payload(ctx2.res).data.total).toBe(0);
  });

  it("honours a time-window (fromTime/toTime + timeType=checkin)", async () => {
    const seeded = await seed();
    // Mongo's `$dateToString` defaults to UTC, so build the timestamps in UTC.
    const today = new Date();
    const checkinAt = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        10,
        0,
        0,
      ),
    );
    const checkoutAt = new Date(checkinAt.getTime() + 8 * 60 * 60 * 1000);
    await seedAttendance(seeded, {
      checkinAt,
      checkoutAt,
      createdAt: checkinAt,
    });

    // Window includes the check-in → row included.
    const ctx1 = serviceCtx({
      adminId: seeded.admin._id,
      query: {
        fromTime: "09:00",
        toTime: "11:00",
        timeType: "checkin",
        startDate: checkinAt,
        endDate: checkinAt,
      },
      body: {},
    });
    await AttendanceService.getAttendance(ctx1.req, ctx1.res);
    expect(payload(ctx1.res).data.total).toBe(1);

    // Window excludes the check-in → zero rows.
    const ctx2 = serviceCtx({
      adminId: seeded.admin._id,
      query: {
        fromTime: "20:00",
        toTime: "23:00",
        timeType: "checkin",
        startDate: checkinAt,
        endDate: checkinAt,
      },
      body: {},
    });
    await AttendanceService.getAttendance(ctx2.req, ctx2.res);
    expect(payload(ctx2.res).data.total).toBe(0);
  });

  it("respects pagination (skip / limit)", async () => {
    const seeded = await seed();
    // Seed three days worth of attendance for the same employee.
    const baseDay = new Date();
    baseDay.setHours(10, 0, 0, 0);
    for (let i = 0; i < 3; i++) {
      const day = new Date(baseDay.getTime() - i * 24 * 60 * 60 * 1000);
      await seedAttendance(seeded, {
        checkinAt: new Date(day.getTime()),
        checkoutAt: new Date(day.getTime() + 60 * 60 * 1000),
        createdAt: day,
      });
    }

    const { req, res } = serviceCtx({
      adminId: seeded.admin._id,
      query: {
        startDate: new Date(baseDay.getTime() - 5 * 24 * 60 * 60 * 1000),
        endDate: baseDay,
        skip: 0,
        limit: 2,
      },
      body: {},
    });
    await AttendanceService.getAttendance(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.attendanceLogs.length).toBeLessThanOrEqual(2);
    // total is the un-paginated count.
    expect(payload(res).data.total).toBe(3);
  });

  it("returns the start date of the earliest attendance row", async () => {
    const seeded = await seed();
    const old = new Date("2024-01-01T08:00:00Z");
    await seedAttendance(seeded, {
      checkinAt: old,
      checkoutAt: new Date(old.getTime() + 3600_000),
      createdAt: old,
    });
    const { req, res } = serviceCtx({
      adminId: seeded.admin._id,
      query: {
        startDate: "2023-01-01",
        endDate: new Date().toISOString().slice(0, 10),
      },
      body: {},
    });
    await AttendanceService.getAttendance(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.attendanceLogsStartDate).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// exportAttendance — only the "no data" early-return is exercised. The Excel
// and PDF binary writers are not exercised in this file.
// ---------------------------------------------------------------------------
describe("AttendanceService.exportAttendance", () => {
  it("returns a 200 'no data' response when nothing matches", async () => {
    const seeded = await seed();
    const { req, res } = serviceCtx({
      adminId: seeded.admin._id,
      query: { format: "excel", export: "true" },
      body: {},
    });
    await AttendanceService.exportAttendance(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).message).toMatch(/No attendance data/i);
  });

  it("returns 500 when buildAttendancePipeline throws", async () => {
    // Pass an explicitly invalid sortField path is fine, but an easier branch:
    // pass an unbuildable query (an invalid hex departmentId) so the ObjectId
    // constructor inside the pipeline builder throws.
    const seeded = await seed();
    const { req, res } = serviceCtx({
      adminId: seeded.admin._id,
      query: { departmentIds: "not-a-valid-hex-id", format: "excel" },
      body: {},
    });
    await AttendanceService.exportAttendance(req, res);
    expect(res.statusCode).toBe(500);
  });
});
