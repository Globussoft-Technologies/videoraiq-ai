/**
 * Integration tests for AttendanceService (v2) getAttendance /
 * buildAttendancePipeline against in-memory MongoDB.
 *
 * Baseline coverage for the aggregation path that getAttendance runs three
 * times per request (pipeline, rowCountPipeline, countPipeline) plus a
 * separate buildNotCheckedInDataset call — written to lock in current
 * behaviour before optimizing away the duplicate aggregation work.
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
  "../../../core/v2/attendance/attendance.service.js"
);
const { default: Attendance } = await import(
  "../../../core/v2/attendance/attendance.model.js"
);
const { default: Admin } = await import(
  "../../../core/v2/admin/admin.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v2/authorizedUsers/authorizedUsers.model.js"
);
const { default: Channel } = await import(
  "../../../core/v2/channels/channels.model.js"
);
const { default: Department } = await import(
  "../../../core/v2/departments/departments.model.js"
);
await import("../../../core/v2/NVR/nvr.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

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

describe("AttendanceService (v2) getAttendance", () => {
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

  it("returns aggregated check-in / check-out per employee per day, with status counts", async () => {
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
    expect(row.checkinCam).toBe("Front Door");
    expect(row.checkoutCam).toBe("Front Door");
    expect(row.imageUrls).toHaveLength(2);
    // Status-tally is computed off the same match/filter set as the table rows.
    expect(data.statusCounts.checkinLogs).toBe(1);
    expect(data.statusCounts.checkoutLogs).toBe(1);
  });

  it("filters by name (case-insensitive regex on employee.fullName) without affecting status tile counts", async () => {
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
    // Tiles reflect the full range regardless of the name search.
    expect(payload(res).data.statusCounts.checkinLogs).toBe(1);

    const ctx2 = serviceCtx({
      adminId: seeded.admin._id,
      query: { name: "no-such-name-xyz" },
      body: {},
    });
    await AttendanceService.getAttendance(ctx2.req, ctx2.res);
    expect(ctx2.res.statusCode).toBe(200);
    expect(payload(ctx2.res).data.total).toBe(0);
    // Table rows are filtered by name, but tile counts are not.
    expect(payload(ctx2.res).data.statusCounts.checkinLogs).toBe(1);
  });

  it("filters by departmentIds", async () => {
    const seeded = await seed();
    await seedAttendance(seeded);

    const ctx1 = serviceCtx({
      adminId: seeded.admin._id,
      query: { departmentIds: seeded.department._id.toString() },
      body: {},
    });
    await AttendanceService.getAttendance(ctx1.req, ctx1.res);
    expect(payload(ctx1.res).data.total).toBe(1);

    const ctx2 = serviceCtx({
      adminId: seeded.admin._id,
      query: { departmentIds: new mongoose.Types.ObjectId().toString() },
      body: {},
    });
    await AttendanceService.getAttendance(ctx2.req, ctx2.res);
    expect(payload(ctx2.res).data.total).toBe(0);
  });

  it("filters by status=checkin / status=checkout pseudo-statuses", async () => {
    const seeded = await seed();
    await seedAttendance(seeded);

    const ctxCheckin = serviceCtx({
      adminId: seeded.admin._id,
      query: { status: "checkin" },
      body: {},
    });
    await AttendanceService.getAttendance(ctxCheckin.req, ctxCheckin.res);
    expect(payload(ctxCheckin.res).data.total).toBe(1);

    const ctxCheckout = serviceCtx({
      adminId: seeded.admin._id,
      query: { status: "checkout" },
      body: {},
    });
    await AttendanceService.getAttendance(ctxCheckout.req, ctxCheckout.res);
    expect(payload(ctxCheckout.res).data.total).toBe(1);
  });

  it("honours a time-window (fromTime/toTime + timeType=checkin)", async () => {
    const seeded = await seed();
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

  it("respects pagination (skip / limit) while total stays un-paginated", async () => {
    const seeded = await seed();
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
    expect(payload(res).data.total).toBe(3);
  });

  it("supports every sortField without erroring (fullname / date / checkout / location / department / checkin)", async () => {
    const seeded = await seed();
    await seedAttendance(seeded);
    for (const sortField of [
      "fullname",
      "date",
      "checkout",
      "location",
      "department",
      "checkin",
    ]) {
      const { req, res } = serviceCtx({
        adminId: seeded.admin._id,
        query: { sortField, sortOrder: "asc" },
        body: {},
      });
      await AttendanceService.getAttendance(req, res);
      expect(res.statusCode).toBe(200);
      expect(payload(res).data.total).toBe(1);
    }
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
