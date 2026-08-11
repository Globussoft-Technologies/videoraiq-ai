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
const { default: Department } = await import(
  "../../../core/v2/departments/departments.model.js"
);
const { default: Shift } = await import(
  "../../../core/v2/shifts/shifts.model.js"
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

describe("AttendanceService.getAttendance — not_checked_in", () => {
  it("returns only employees expected on that weekday who have no check-in", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const department = await Department.create({
      adminId: admin._id,
      departmentName: "Engineering",
    });
    const weekdayShift = await Shift.create({
      adminId: admin._id,
      name: "Weekday",
      color: "#22c55e",
      timings: {
        monday: { enabled: true, start: "09:00", end: "18:00" },
        tuesday: { enabled: true, start: "09:00", end: "18:00" },
        wednesday: { enabled: true, start: "09:00", end: "18:00" },
        thursday: { enabled: true, start: "09:00", end: "18:00" },
        friday: { enabled: true, start: "09:00", end: "18:00" },
        saturday: { enabled: false, start: "", end: "" },
        sunday: { enabled: false, start: "", end: "" },
      },
    });
    const offDayShift = await Shift.create({
      adminId: admin._id,
      name: "Off Monday",
      color: "#ef4444",
      timings: {
        monday: { enabled: false, start: "", end: "" },
        tuesday: { enabled: true, start: "09:00", end: "18:00" },
        wednesday: { enabled: true, start: "09:00", end: "18:00" },
        thursday: { enabled: true, start: "09:00", end: "18:00" },
        friday: { enabled: true, start: "09:00", end: "18:00" },
        saturday: { enabled: false, start: "", end: "" },
        sunday: { enabled: false, start: "", end: "" },
      },
    });

    const checkedInEmployee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Checked",
      lastName: "In",
      email: "checked@test.com",
      departmentId: department._id,
      shiftId: weekdayShift._id,
      location: "HQ",
    });
    const missingEmployee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Missing",
      lastName: "Checkin",
      email: "missing@test.com",
      departmentId: department._id,
      shiftId: weekdayShift._id,
      location: "HQ",
    });
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Off",
      lastName: "Day",
      email: "off@test.com",
      departmentId: department._id,
      shiftId: offDayShift._id,
      location: "HQ",
    });

    const day = new Date("2026-08-10T09:00:00.000Z");
    await Attendance.create({
      user: admin._id,
      employee: checkedInEmployee._id,
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
      query: {
        status: "not_checked_in",
        startDate: "2026-08-10",
        endDate: "2026-08-10",
      },
      body: { employeeLocations: ["HQ"] },
    });

    await AttendanceService.getAttendance(req, res);

    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.total).toBe(1);
    expect(data.attendanceLogs).toHaveLength(1);
    expect(data.attendanceLogs[0].employee._id.toString()).toBe(
      missingEmployee._id.toString()
    );
    expect(data.attendanceLogs[0].status).toBe("not_checked_in");
  });

  it("splits absent totals into early-leave and not-checked-in without overlap", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const department = await Department.create({
      adminId: admin._id,
      departmentName: "Engineering",
    });
    const earlyLeaveEmployee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Early",
      lastName: "Leave",
      email: "early@test.com",
      departmentId: department._id,
      location: "HQ",
    });
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "No",
      lastName: "Show",
      email: "noshow@test.com",
      departmentId: department._id,
      location: "HQ",
    });
    const presentEmployee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Present",
      lastName: "User",
      email: "present@test.com",
      departmentId: department._id,
      location: "HQ",
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
    await Attendance.create({
      user: admin._id,
      employee: presentEmployee._id,
      createdAt: new Date("2026-08-10T09:00:00.000Z"),
      events: [
        {
          cameraType: "checkin",
          timestamp: new Date("2026-08-10T09:00:00.000Z"),
          channel: new mongoose.Types.ObjectId(),
          nvr: new mongoose.Types.ObjectId(),
          images: { face: "f3" },
        },
        {
          cameraType: "checkout",
          timestamp: new Date("2026-08-10T18:00:00.000Z"),
          channel: new mongoose.Types.ObjectId(),
          nvr: new mongoose.Types.ObjectId(),
          images: { face: "f4" },
        },
      ],
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      user_id: admin.user_id,
      query: {
        startDate: "2026-08-10",
        endDate: "2026-08-10",
      },
      body: { employeeLocations: ["HQ"] },
    });

    await AttendanceService.getAttendance(req, res);

    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.statusCounts.earlyLeave).toBe(1);
    expect(data.statusCounts.notCheckedIn).toBe(1);
    expect(data.statusCounts.absent).toBe(2);
  });

  it("scopes total employees in attendance summary to the selected location filter", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const department = await Department.create({
      adminId: admin._id,
      departmentName: "Engineering",
    });

    const bangaloreEmployee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Bangalore",
      lastName: "User",
      email: "blr@test.com",
      departmentId: department._id,
      location: "bangalore",
    });
    await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Mumbai",
      lastName: "User",
      email: "mum@test.com",
      departmentId: department._id,
      location: "mumbai",
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

    const { req, res } = serviceCtx({
      adminId: admin._id,
      user_id: admin.user_id,
      query: {
        startDate: "2026-08-10",
        endDate: "2026-08-10",
      },
      body: { employeeLocations: ["Bangalore"] },
    });

    await AttendanceService.getAttendance(req, res);

    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.totalEmployees).toBe(1);
  });
});
