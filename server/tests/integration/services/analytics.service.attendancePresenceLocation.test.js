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

const { default: AnalyticsService } = await import(
  "../../../core/v2/analytics/analytics.service.js"
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
const { default: AuthorizedChannels } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("AnalyticsService.attendancePresence — location filter", () => {
  it("scopes roster and counts to the selected location", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const bangaloreEmployee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Bangalore",
      lastName: "User",
      email: "blr@test.com",
      location: "bangalore",
    });
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Mumbai",
      lastName: "User",
      email: "mum@test.com",
      location: "mumbai",
    });

    const day = new Date("2026-08-10T09:00:00.000Z");
    await Attendance.create({
      user: admin._id,
      employee: bangaloreEmployee._id,
      createdAt: day,
      events: [
        {
          cameraType: "checkin",
          timestamp: day,
          channel: new mongoose.Types.ObjectId(),
          nvr: new mongoose.Types.ObjectId(),
          images: { face: "f1" },
        },
      ],
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      user_id: admin.user_id,
      query: {
        date: "2026-08-10",
        location: "bangalore",
      },
      body: {},
    });

    await AnalyticsService.attendancePresence(req, res);

    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.employees).toBe(1);
    expect(data.checkinLogs).toBe(1);
    // The Mumbai employee is out of scope entirely. If the location filter ever
    // leaked they would surface here as a second, never-checked-in absentee, so
    // this is the assertion that actually guards the scoping.
    expect(data.notCheckedIn).toBe(0);
    // The row above has a check-in and no check-out, and its date is
    // deliberately weeks in the past — far outside the grace window. It
    // therefore grades absent rather than going on claiming the employee is
    // still on site, and lands in the noCheckout bucket rather than earlyLeave
    // (they never left; no check-out was ever recorded).
    expect(data.earlyLeave).toBe(0);
    expect(data.noCheckout).toBe(1);
    expect(data.absent).toBe(1);
  });

  it("reports absent as early-leave plus not-checked-in for the selected location", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const earlyLeaveEmployee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Early",
      lastName: "Leave",
      email: "early@test.com",
      location: "bangalore",
    });
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "No",
      lastName: "Show",
      email: "noshow@test.com",
      location: "bangalore",
    });

    await Attendance.create({
      user: admin._id,
      employee: earlyLeaveEmployee._id,
      createdAt: new Date("2026-08-10T09:00:00.000Z"),
      events: [
        {
          cameraType: "checkin",
          timestamp: new Date("2026-08-10T09:00:00.000Z"),
          channel: new mongoose.Types.ObjectId(),
          nvr: new mongoose.Types.ObjectId(),
          images: { face: "f1" },
        },
        {
          cameraType: "checkout",
          timestamp: new Date("2026-08-10T10:00:00.000Z"),
          channel: new mongoose.Types.ObjectId(),
          nvr: new mongoose.Types.ObjectId(),
          images: { face: "f2" },
        },
      ],
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      user_id: admin.user_id,
      query: {
        date: "2026-08-10",
        location: "bangalore",
      },
      body: {},
    });

    await AnalyticsService.attendancePresence(req, res);

    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.earlyLeave).toBe(1);
    expect(data.notCheckedIn).toBe(1);
    expect(data.absent).toBe(2);
  });

  it("keeps attendance counts within the member-scoped employee roster", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const memberId = new mongoose.Types.ObjectId();

    const bangaloreEmployee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Bangalore",
      lastName: "User",
      email: "blr@test.com",
      location: "bangalore",
    });
    const mumbaiEmployee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Mumbai",
      lastName: "User",
      email: "mum@test.com",
      location: "mumbai",
    });

    await AuthorizedChannels.create({
      adminId: admin._id,
      userId: memberId,
      locations: [],
      employeeLocations: ["bangalore"],
      nvrIds: [],
      departmentIds: [],
      channels: [],
    });

    await Attendance.create({
      user: admin._id,
      employee: bangaloreEmployee._id,
      createdAt: new Date("2026-08-10T09:00:00.000Z"),
      events: [
        {
          cameraType: "checkin",
          timestamp: new Date("2026-08-10T09:00:00.000Z"),
          channel: new mongoose.Types.ObjectId(),
          nvr: new mongoose.Types.ObjectId(),
          images: { face: "f1" },
        },
      ],
    });
    await Attendance.create({
      user: admin._id,
      employee: mumbaiEmployee._id,
      createdAt: new Date("2026-08-10T09:00:00.000Z"),
      events: [
        {
          cameraType: "checkin",
          timestamp: new Date("2026-08-10T09:00:00.000Z"),
          channel: new mongoose.Types.ObjectId(),
          nvr: new mongoose.Types.ObjectId(),
          images: { face: "f2" },
        },
        {
          cameraType: "checkout",
          timestamp: new Date("2026-08-10T10:00:00.000Z"),
          channel: new mongoose.Types.ObjectId(),
          nvr: new mongoose.Types.ObjectId(),
          images: { face: "f3" },
        },
      ],
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      user_id: admin.user_id,
      memberId: String(memberId),
      authorizedChannel: {
        employeeLocations: ["bangalore"],
        channels: [],
        nvrIds: [],
      },
      query: {
        date: "2026-08-10",
      },
      body: {},
    });

    await AnalyticsService.attendancePresence(req, res);

    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.employees).toBe(1);
    expect(data.checkinLogs).toBe(1);
    expect(data.absent).toBeLessThanOrEqual(data.employees);
  });
});
