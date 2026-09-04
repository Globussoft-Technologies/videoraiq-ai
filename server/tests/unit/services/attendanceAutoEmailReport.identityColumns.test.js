/**
 * Unit tests for the employee-identity columns on the PDF/CSV report:
 * Emp. Code, Shift and Shift Timings.
 *
 * These sit beside the attendance times because a check-in only means
 * something against the shift it is judged by — a 09:15 arrival is late on a
 * 09:00 shift and early on a 10:00 one. The cases that matter are the ones
 * where the data is incomplete: an employee with no shift assigned, a shift
 * missing its window, and a night shift whose end time is "before" its start.
 * None of those may render as a real-looking value.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../utils/mediaStorage.js", () => ({
  putMedia: vi.fn(async () => "/uploads/reports/1/x"),
}));

const { reportTableRows, rowFromAttendance, buildCsv, REPORT_HEADERS } = await import(
  "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js"
);

const TZ = "Asia/Kolkata";
const rules = { fullDayHours: 8, halfDayHours: 4 };

const DAY_SHIFT = { name: "General Shift", startTime: "09:00", endTime: "18:00", isNightShift: false };

function attendance(shift, overrides = {}) {
  return {
    createdAt: "2026-08-07T04:00:00.000Z",
    employee: {
      _id: "e1",
      firstName: "Nagul",
      lastName: "Lingiri",
      emp_id: "1460206",
      location: "india",
      shiftId: shift,
      ...overrides,
    },
    events: [
      { cameraType: "checkin", timestamp: "2026-08-07T04:00:00.000Z", images: {} },
      { cameraType: "checkout", timestamp: "2026-08-07T13:00:00.000Z", images: {} },
    ],
  };
}

/** Read a cell by column name, so a future column change can't misalign this. */
const at = (cells, header) => cells[REPORT_HEADERS.indexOf(header)];

/** The day line for one attendance document. */
function dayLine(item) {
  return reportTableRows([rowFromAttendance(item, TZ, rules)])[0].cells;
}

describe("attendanceAutoEmailReport identity columns", () => {
  it("exposes the three columns in the report header", () => {
    expect(REPORT_HEADERS).toContain("Emp. Code");
    expect(REPORT_HEADERS).toContain("Shift");
    expect(REPORT_HEADERS).toContain("Shift Timings");
  });

  it("shows the employee code, shift name and shift window on the day line", () => {
    const cells = dayLine(attendance(DAY_SHIFT));
    expect(at(cells, "Emp. Code")).toBe("1460206");
    expect(at(cells, "Shift")).toBe("General Shift");
    expect(at(cells, "Shift Timings")).toBe("09:00 - 18:00");
  });

  it("flags a night shift, whose end time reads earlier than its start", () => {
    const night = { name: "Night Shift", startTime: "21:00", endTime: "06:00", isNightShift: true };
    expect(at(dayLine(attendance(night)), "Shift Timings")).toBe("21:00 - 06:00 (night)");
  });

  it("shows '-' for an employee with no shift rather than a default window", () => {
    const cells = dayLine(attendance(null));
    expect(at(cells, "Shift")).toBe("-");
    expect(at(cells, "Shift Timings")).toBe("-");
  });

  it("shows '-' for a shift missing its start or end time", () => {
    const partial = { name: "Half-configured", startTime: "09:00" };
    const cells = dayLine(attendance(partial));
    // The name is known, so it still shows; the window is not, so it must not
    // be half-rendered as "09:00 - undefined".
    expect(at(cells, "Shift")).toBe("Half-configured");
    expect(at(cells, "Shift Timings")).toBe("-");
  });

  it("falls back to '-' when the employee record carries no code", () => {
    const item = attendance(DAY_SHIFT, { emp_id: null });
    expect(at(dayLine(item), "Emp. Code")).toBe("-");
  });

  it("leaves the identity columns blank on session sub-rows", () => {
    const item = attendance(DAY_SHIFT);
    item.events = [
      { cameraType: "checkin", timestamp: "2026-08-07T04:00:00.000Z", images: {} },
      { cameraType: "checkout", timestamp: "2026-08-07T04:30:00.000Z", images: {} },
      { cameraType: "checkin", timestamp: "2026-08-07T05:00:00.000Z", images: {} },
      { cameraType: "checkout", timestamp: "2026-08-07T06:15:00.000Z", images: {} },
    ];
    const out = reportTableRows([rowFromAttendance(item, TZ, rules)]);
    expect(out.map((line) => line.kind)).toEqual(["day", "session", "total"]);
    // Identity belongs to the employee-day, not to each session within it.
    for (const header of ["Emp. Code", "Shift", "Shift Timings"]) {
      expect(at(out[1].cells, header)).toBe("");
    }
  });

  it("writes the new columns into the CSV header and its day row", () => {
    const row = rowFromAttendance(attendance(DAY_SHIFT), TZ, rules);
    const csv = buildCsv({ report: {}, rows: [row], label: "Aug 2026", timezone: TZ }).toString("utf8");
    const lines = csv.split("\r\n");
    const header = lines.find((line) => line.startsWith("ID,"));
    expect(header).toContain("Emp. Code");
    expect(header).toContain("Shift,Shift Timings");
    const dayRow = lines[lines.indexOf(header) + 1];
    expect(dayRow).toContain("1460206");
    expect(dayRow).toContain("General Shift");
    expect(dayRow).toContain("09:00 - 18:00");
  });
});
