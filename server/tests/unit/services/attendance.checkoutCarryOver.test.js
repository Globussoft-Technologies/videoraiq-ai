/**
 * Unit coverage for core/v1/attendance/checkoutCarryOver.js
 *
 * This is the fix for overnight shifts. A shift running 22:00 -> 06:00 logs its
 * check-out on the calendar day AFTER its check-in, where logAttendance finds no
 * row to close and used to reject it outright — losing the night's hours for
 * good. The helper finds yesterday's still-open row so the check-out can be
 * appended there instead.
 *
 * The two things worth pinning down are the boundaries, because both failure
 * modes are silent: too tight a window drops a real overnight check-out back on
 * the floor, and too loose a one lets this morning's walk past a check-out
 * camera close a row someone simply forgot to check out of yesterday, inventing
 * a 24-hour shift.
 *
 * Mocks (2):
 *   1. attendance.model.js          — findOne().sort().select()
 *   2. attendanceSettings.model.js  — findOne().select().lean() + the defaults
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/attendance/attendance.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../../../core/v1/attendance/attendanceSettings.model.js", () => ({
  default: { findOne: vi.fn() },
  DEFAULT_FULL_DAY_HOURS: 8,
  DEFAULT_HALF_DAY_HOURS: 4,
  DEFAULT_GRACE_HOURS: 8,
}));

const { default: Attendance } = await import(
  "../../../core/v1/attendance/attendance.model.js"
);
const { default: AttendanceSettings } = await import(
  "../../../core/v1/attendance/attendanceSettings.model.js"
);
const { findOpenCheckinToCarryOver, resolveCarryOverWindowMs } = await import(
  "../../../core/v1/attendance/checkoutCarryOver.js"
);

const HOUR = 60 * 60 * 1000;
const USER = "admin-1";
const EMPLOYEE = "employee-1";

/** Local midnight of the given day, the same way logAttendance builds it. */
function midnight(day) {
  const date = new Date(2026, 7, day); // August 2026
  date.setHours(0, 0, 0, 0);
  return date;
}

/** A wall-clock instant on the given August day. */
function at(day, hours, minutes = 0) {
  return new Date(2026, 7, day, hours, minutes, 0, 0).getTime();
}

function mockCandidate(row) {
  Attendance.findOne.mockReturnValue({
    sort: () => ({ select: () => Promise.resolve(row) }),
  });
}

function mockSettings(saved) {
  AttendanceSettings.findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(saved) }),
  });
}

/** A still-open row: one check-in, no check-out. */
function openRow(checkInAt) {
  return {
    _id: "row-1",
    events: [{ cameraType: "checkin", timestamp: new Date(checkInAt) }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveCarryOverWindowMs", () => {
  it("falls back to fullDay + grace defaults with no admin", async () => {
    await expect(resolveCarryOverWindowMs(null)).resolves.toBe(16 * HOUR);
    expect(AttendanceSettings.findOne).not.toHaveBeenCalled();
  });

  it("falls back to the defaults when the org has never saved settings", async () => {
    mockSettings(null);
    await expect(resolveCarryOverWindowMs(USER)).resolves.toBe(16 * HOUR);
  });

  it("sums the org's own fullDayHours and graceHours", async () => {
    mockSettings({ fullDayHours: 9, graceHours: 6 });
    await expect(resolveCarryOverWindowMs(USER)).resolves.toBe(15 * HOUR);
  });

  it("tracks fullDayHours when only grace is missing", async () => {
    mockSettings({ fullDayHours: 10 });
    await expect(resolveCarryOverWindowMs(USER)).resolves.toBe(18 * HOUR);
  });
});

describe("findOpenCheckinToCarryOver", () => {
  it("closes yesterday's open row for a 22:00 -> 06:00 shift", async () => {
    mockCandidate(openRow(at(28, 22)));

    const row = await findOpenCheckinToCarryOver({
      userId: USER,
      employeeId: EMPLOYEE,
      startOfDay: midnight(29),
      windowMs: 16 * HOUR,
      now: at(29, 6),
    });

    expect(row?._id).toBe("row-1");
  });

  it("scopes the lookup to before today, needing a check-in and no check-out", async () => {
    mockCandidate(openRow(at(28, 22)));

    await findOpenCheckinToCarryOver({
      userId: USER,
      employeeId: EMPLOYEE,
      startOfDay: midnight(29),
      windowMs: 16 * HOUR,
      now: at(29, 6),
    });

    const filter = Attendance.findOne.mock.calls[0][0];
    expect(filter.user).toBe(USER);
    expect(filter.employee).toBe(EMPLOYEE);
    expect(filter["events.cameraType"]).toBe("checkin");
    expect(filter.events).toEqual({
      $not: { $elemMatch: { cameraType: "checkout" } },
    });
    // Never reaches into today, and never further back than the window.
    expect(filter.createdAt.$lt).toEqual(midnight(29));
    expect(filter.createdAt.$gte).toEqual(new Date(at(29, 6) - 16 * HOUR));
  });

  it("refuses a row whose check-in is older than the window", async () => {
    // Checked in 08:00 yesterday and never checked out; someone walking past a
    // check-out camera at 06:00 today must not close it as a 22-hour shift.
    mockCandidate(openRow(at(28, 8)));

    const row = await findOpenCheckinToCarryOver({
      userId: USER,
      employeeId: EMPLOYEE,
      startOfDay: midnight(29),
      windowMs: 16 * HOUR,
      now: at(29, 6),
    });

    expect(row).toBeNull();
  });

  it("does not query at all once the window can no longer reach yesterday", async () => {
    const row = await findOpenCheckinToCarryOver({
      userId: USER,
      employeeId: EMPLOYEE,
      startOfDay: midnight(29),
      windowMs: 16 * HOUR,
      now: at(29, 23),
    });

    expect(row).toBeNull();
    expect(Attendance.findOne).not.toHaveBeenCalled();
  });

  it("returns null when there is no open row to carry over", async () => {
    mockCandidate(null);

    await expect(
      findOpenCheckinToCarryOver({
        userId: USER,
        employeeId: EMPLOYEE,
        startOfDay: midnight(29),
        windowMs: 16 * HOUR,
        now: at(29, 6),
      })
    ).resolves.toBeNull();
  });

  it("returns null when a matched row somehow carries no check-in timestamp", async () => {
    mockCandidate({ _id: "row-1", events: [] });

    await expect(
      findOpenCheckinToCarryOver({
        userId: USER,
        employeeId: EMPLOYEE,
        startOfDay: midnight(29),
        windowMs: 16 * HOUR,
        now: at(29, 6),
      })
    ).resolves.toBeNull();
  });

  it("never queries without the arguments it needs", async () => {
    const missing = [
      { userId: null, employeeId: EMPLOYEE, startOfDay: midnight(29), windowMs: HOUR },
      { userId: USER, employeeId: null, startOfDay: midnight(29), windowMs: HOUR },
      { userId: USER, employeeId: EMPLOYEE, startOfDay: null, windowMs: HOUR },
      { userId: USER, employeeId: EMPLOYEE, startOfDay: midnight(29), windowMs: 0 },
    ];

    for (const args of missing) {
      await expect(findOpenCheckinToCarryOver(args)).resolves.toBeNull();
    }
    expect(Attendance.findOne).not.toHaveBeenCalled();
  });
});
