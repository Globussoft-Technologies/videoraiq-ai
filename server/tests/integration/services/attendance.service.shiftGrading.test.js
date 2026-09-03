/**
 * Integration coverage for shift-aware attendance grading.
 *
 * An employee holding a shift is graded against that shift's own window —
 * its length sets the full/half-day marks, and its clock times make late /
 * early leave / overtime meaningful. An employee with no shift keeps the
 * org-wide duration thresholds, which is what makes this safe to ship without
 * a data migration.
 *
 * Times below are written in Asia/Kolkata (UTC+05:30), the zone the admin is
 * configured with, because that conversion is exactly what the grading has to
 * get right: a "09:00" shift start is 03:30Z, and comparing wall clock against
 * a raw UTC instant would put every employee 5h30m out.
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

vi.mock("../../../socket.js", () => ({ sendPayloadToUser: vi.fn() }));

const { default: AttendanceService } = await import(
  "../../../core/v2/attendance/attendance.service.js"
);
const { default: Attendance } = await import(
  "../../../core/v2/attendance/attendance.model.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: AuthorizedUsers } = await import(
  "../../../core/v2/authorizedUsers/authorizedUsers.model.js"
);
const { default: Shift } = await import("../../../core/v2/shifts/shifts.model.js");

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
    user_id: "901",
    login: "shift-grading",
    email: "shiftgrading@test.com",
    // Grading reads wall-clock shift times in this zone.
    timezone: "Asia/Kolkata",
  });
});

/** An IST wall-clock time on a given date, as the UTC instant it really is. */
const ist = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`);

const makeEmployee = (over = {}) =>
  AuthorizedUsers.create({
    adminId: admin._id,
    firstName: "Test",
    lastName: "Employee",
    location: "HQ",
    ...over,
  });

const logDay = async (employee, { date, in: checkIn, out: checkOut }) => {
  const events = [
    {
      cameraType: "checkin",
      timestamp: checkIn,
      channel: new mongoose.Types.ObjectId(),
      nvr: new mongoose.Types.ObjectId(),
      images: { face: "f" },
    },
  ];
  if (checkOut) {
    events.push({
      cameraType: "checkout",
      timestamp: checkOut,
      channel: new mongoose.Types.ObjectId(),
      nvr: new mongoose.Types.ObjectId(),
      images: { face: "f" },
    });
  }
  const row = await Attendance.create({
    user: admin._id,
    employee: employee._id,
    events,
  });
  // `createdAt` is what the pipeline buckets on, and Mongoose stamps it "now".
  // Written through the raw driver because the timestamps option marks
  // createdAt immutable, so a model-level update is silently dropped — which
  // would leave every fixture on today's date and the dates below untested.
  await Attendance.collection.updateOne(
    { _id: row._id },
    { $set: { createdAt: checkIn } },
  );
  return row;
};

const fetchDay = async (date) => {
  const { req, res } = serviceCtx({
    adminId: admin._id,
    query: { startDate: date, endDate: date, limit: 50 },
    body: {},
  });
  await AttendanceService.getAttendance(req, res);
  expect(res.statusCode).toBe(200);
  return payload(res).data.attendanceLogs;
};

// 2026-09-03 is a Thursday — a full working day on the default Mon-Fri week.
const DAY = "2026-09-03";

const dayShift = (over = {}) =>
  Shift.create({
    adminId: admin._id,
    name: "General Shift",
    startTime: "10:00",
    endTime: "19:00",
    breakMinutes: 90,
    graceLateMinutes: 15,
    graceEarlyMinutes: 15,
    ...over,
  });

describe("shift-aware grading — thresholds", () => {
  it("grades against the shift's payable hours, not the org default", async () => {
    // 10:00-19:00 less a 90m break = 7h30m owed, under the 8h org default.
    const shift = await dayShift();
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: DAY,
      in: ist(DAY, "10:00"),
      out: ist(DAY, "17:35"), // 7h35m — short of 8h, but past the shift's 7h30m
    });

    const [row] = await fetchDay(DAY);
    expect(row.status).toBe("present");
    expect(row.shiftName).toBe("General Shift");
  });

  it("leaves an employee with no shift on the org-wide thresholds", async () => {
    const employee = await makeEmployee();
    await logDay(employee, {
      date: DAY,
      in: ist(DAY, "10:00"),
      out: ist(DAY, "17:35"), // 7h35m — under the 8h org default
    });

    const [row] = await fetchDay(DAY);
    expect(row.status).toBe("half_day");
    expect(row.shiftName ?? null).toBeNull();
  });

  it("halves the requirement on a configured half day", async () => {
    // 2026-09-05 is a Saturday.
    const saturday = "2026-09-05";
    const shift = await dayShift({
      workingDays: { saturday: { type: "half" } },
    });
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: saturday,
      in: ist(saturday, "10:00"),
      out: ist(saturday, "13:50"), // 3h50m — over half of 7h30m
    });

    const [row] = await fetchDay(saturday);
    expect(row.shiftDayType).toBe("half");
    expect(row.status).toBe("present");
  });

  it("flags a day worked on the shift's week off", async () => {
    const sunday = "2026-09-06";
    const shift = await dayShift();
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: sunday,
      in: ist(sunday, "10:00"),
      out: ist(sunday, "19:00"),
    });

    const [row] = await fetchDay(sunday);
    expect(row.isWeekOff).toBe(true);
  });
});

describe("shift-aware grading — late and early leave", () => {
  it("allows the grace period, then counts the minutes past it", async () => {
    const shift = await dayShift(); // starts 10:00, 15m grace
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: DAY,
      in: ist(DAY, "10:12"), // inside grace
      out: ist(DAY, "19:00"),
    });

    const [row] = await fetchDay(DAY);
    expect(row.isLate).toBe(false);
    expect(row.lateMinutes).toBe(0);
  });

  it("counts lateness from the end of the grace period", async () => {
    const shift = await dayShift();
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: DAY,
      in: ist(DAY, "10:40"), // 40m late, 15m grace
      out: ist(DAY, "19:00"),
    });

    const [row] = await fetchDay(DAY);
    expect(row.isLate).toBe(true);
    expect(row.lateMinutes).toBe(25);
  });

  it("counts an early departure the same way", async () => {
    const shift = await dayShift(); // ends 19:00, 15m grace
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: DAY,
      in: ist(DAY, "10:00"),
      out: ist(DAY, "18:00"), // 60m early, 15m grace
    });

    const [row] = await fetchDay(DAY);
    expect(row.isEarlyLeave).toBe(true);
    expect(row.earlyLeaveMinutes).toBe(45);
  });

  it("reports overtime past the shift's payable hours", async () => {
    const shift = await dayShift(); // 7h30m payable
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: DAY,
      in: ist(DAY, "10:00"),
      out: ist(DAY, "20:00"), // 10h on site
    });

    const [row] = await fetchDay(DAY);
    expect(row.overtimeMinutes).toBe(150);
  });

  // The regression this whole timezone thread exists to prevent: read as UTC,
  // a 10:00 IST check-in is 04:30 and would read 5h30m early, not on time.
  it("reads the wall clock in the admin's zone, not UTC", async () => {
    const shift = await dayShift();
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: DAY,
      in: ist(DAY, "10:05"),
      out: ist(DAY, "19:05"),
    });

    const [row] = await fetchDay(DAY);
    expect(row.lateMinutes).toBe(0);
    expect(row.earlyLeaveMinutes).toBe(0);
  });
});

describe("shift-aware grading — night shifts", () => {
  const nightShift = () =>
    Shift.create({
      adminId: admin._id,
      name: "Night Shift",
      startTime: "22:00",
      endTime: "06:00",
      breakMinutes: 60,
      graceLateMinutes: 15,
      graceEarlyMinutes: 15,
      workingDays: {
        sunday: { type: "full" },
        monday: { type: "full" },
        tuesday: { type: "full" },
        wednesday: { type: "full" },
        thursday: { type: "full" },
        friday: { type: "full" },
        saturday: { type: "full" },
      },
    });

  it("keeps a shift that crosses midnight on one day", async () => {
    const shift = await nightShift();
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: DAY,
      in: ist(DAY, "22:00"),
      out: ist("2026-09-04", "06:00"), // next calendar morning
    });

    // Bucketed to the day the shift started, not split across two.
    const rows = await fetchDay(DAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].isNightShift).toBe(true);
    // 8h window less a 60m break = 7h owed, and 8h were worked.
    expect(rows[0].status).toBe("present");
    expect(rows[0].minutesSpent).toBe(480);
  });

  // Read naively, a 00:30 check-in against a 22:00 start looks 21.5h *early*
  // rather than 2.5h late. The row is queried under the 4th because the date
  // filter runs before the shift-day rebucketing (documented on
  // shiftDayBucketExpr) — but it still carries the 3rd's bucket, and the
  // lateness is measured against the shift it actually belongs to.
  it("counts lateness across midnight rather than reading it as early", async () => {
    const shift = await nightShift();
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: DAY,
      in: ist("2026-09-04", "00:30"), // 2h30m late for a 22:00 start
      out: ist("2026-09-04", "06:00"),
    });

    const [row] = await fetchDay("2026-09-04");
    expect(row.date).toBe(DAY);
    expect(row.isLate).toBe(true);
    expect(row.lateMinutes).toBe(135); // 150m late, less 15m grace
  });

  it("treats an early arrival before the start as on time", async () => {
    const shift = await nightShift();
    const employee = await makeEmployee({ shiftId: shift._id });
    await logDay(employee, {
      date: DAY,
      in: ist(DAY, "21:45"),
      out: ist("2026-09-04", "06:00"),
    });

    const [row] = await fetchDay(DAY);
    expect(row.lateMinutes).toBe(0);
  });
});
