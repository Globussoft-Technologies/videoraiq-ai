/**
 * Unit tests for the Monthly Status workbook (monthlyStatusSheet.js).
 *
 * This is the matrix-shaped report: every day of the period is a column, each
 * employee gets their own worksheet, and four rows (Status / InTime / OutTime /
 * Total) sit above a summary block.
 *
 * The behaviour worth pinning down is how a day gets its Status mark, because
 * two different sources feed it:
 *   - a day WITH an attendance record uses the status the attendance pipeline
 *     already graded (so this sheet can never disagree with Attendance Logs);
 *   - a day with NO record at all exists only in the calendar, so the
 *     employee's shift decides — an off day reads WO, a working day reads A.
 * The tests below cover both, plus the summary figures derived from the shift.
 */
import { describe, it, expect } from "vitest";
import moment from "moment-timezone";
import ExcelJS from "exceljs";
import {
  buildMonthlyStatusWorkbook,
  __test__,
} from "../../../core/v2/attendanceAutoEmailReport/monthlyStatusSheet.js";

const TZ = "Asia/Kolkata";

// 09:00-18:00 with a 60-minute break = an 8-hour day, Mon-Fri.
const SHIFT = {
  name: "General Shift",
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: 60,
  workingDays: {
    sunday: { type: "off" },
    monday: { type: "full" },
    tuesday: { type: "full" },
    wednesday: { type: "full" },
    thursday: { type: "full" },
    friday: { type: "full" },
    saturday: { type: "off" },
  },
};

const START = moment.tz("2026-06-01", "YYYY-MM-DD", TZ).startOf("day");
const END = moment.tz("2026-06-30", "YYYY-MM-DD", TZ).endOf("day");

const row = (dateKey, status, inTime, outTime, workingMinutesDay, shift = SHIFT) => ({
  employeeKey: "e1",
  employee: "KATARU SAI CHAITHANYA",
  employeeId: "1460206",
  department: "CAS",
  dateKey,
  status,
  inTime,
  outTime,
  workingMinutesDay,
  shift,
});

/** Load a generated workbook back so assertions read real cells. */
async function build(rows) {
  const buffer = await buildMonthlyStatusWorkbook({
    rows,
    label: "Jun 01 2026 To Jun 30 2026",
    timezone: TZ,
    start: START,
    end: END,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

/** Column index of a given date, mirroring how the sheet lays days out. */
function columnFor(dateKey, shift = SHIFT) {
  const days = __test__.daysInRange(START, END, TZ, shift);
  return 3 + days.findIndex((day) => day.dateKey === dateKey);
}

const STATUS_ROW = 11;
const IN_ROW = 12;
const OUT_ROW = 13;
const TOTAL_ROW = 14;

describe("monthlyStatusSheet — day grid", () => {
  it("gives each employee their own worksheet, named for them", async () => {
    const workbook = await build([row("2026-06-01", "Present", "21:55", "06:30", 515)]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "KATARU SAI CHAITHANYA",
    ]);
  });

  it("lays out one column per calendar day in the period", () => {
    expect(__test__.daysInRange(START, END, TZ, SHIFT)).toHaveLength(30);
  });

  it("labels day headers with the date and weekday initial", () => {
    const days = __test__.daysInRange(START, END, TZ, SHIFT);
    // 1 Jun 2026 is a Monday; the 6th a Saturday, the 7th a Sunday.
    expect(days[0].label).toBe("1 M");
    expect(days[5].label).toBe("6 St");
    expect(days[6].label).toBe("7 S");
  });

  it("marks a day that has a record with the status already graded for it", async () => {
    const workbook = await build([
      row("2026-06-01", "Present", "21:55", "06:30", 515),
      row("2026-06-17", "Half Day", "10:00", "14:00", 240),
      // A record exists but the pipeline graded it absent (e.g. left early) —
      // that verdict is reused rather than re-derived from the clock times.
      row("2026-06-15", "Absent", "", "", 0),
    ]);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(STATUS_ROW, columnFor("2026-06-01")).value).toBe("P");
    expect(sheet.getCell(STATUS_ROW, columnFor("2026-06-17")).value).toBe("HD");
    expect(sheet.getCell(STATUS_ROW, columnFor("2026-06-15")).value).toBe("A");
  });

  it("fills a day with no record at all from the shift: WO on an off day, A on a working day", async () => {
    // Only the 1st has a record, so every other day is filled from the shift.
    const workbook = await build([row("2026-06-01", "Present", "21:55", "06:30", 515)]);
    const sheet = workbook.worksheets[0];
    // 3 Jun is a Wednesday the shift works — absent.
    expect(sheet.getCell(STATUS_ROW, columnFor("2026-06-03")).value).toBe("A");
    // 6 Jun is a Saturday and 7 Jun a Sunday — both week offs.
    expect(sheet.getCell(STATUS_ROW, columnFor("2026-06-06")).value).toBe("WO");
    expect(sheet.getCell(STATUS_ROW, columnFor("2026-06-07")).value).toBe("WO");
  });

  it("writes clock times and the day total, and zeroes the total on a day with no record", async () => {
    const workbook = await build([row("2026-06-01", "Present", "21:55", "06:30", 515)]);
    const sheet = workbook.worksheets[0];
    const column = columnFor("2026-06-01");
    expect(sheet.getCell(IN_ROW, column).value).toBe("21:55");
    expect(sheet.getCell(OUT_ROW, column).value).toBe("06:30");
    expect(sheet.getCell(TOTAL_ROW, column).value).toBe("8:35");
    expect(sheet.getCell(TOTAL_ROW, columnFor("2026-06-03")).value).toBe("00:00");
  });

  it("marks no week offs for an employee with no shift rather than assuming a Mon-Fri week", () => {
    const days = __test__.daysInRange(START, END, TZ, null);
    expect(days.some((day) => day.isOff)).toBe(false);
  });
});

describe("monthlyStatusSheet — summary block", () => {
  it("counts working days from the shift's week and derives expected hours from its window", async () => {
    const workbook = await build([
      row("2026-06-01", "Present", "21:55", "06:30", 515),
      row("2026-06-02", "Present", "21:06", "06:37", 571),
    ]);
    const sheet = workbook.worksheets[0];
    // June 2026 has 22 Mon-Fri days; 22 x 8h = 176:00 expected.
    expect(sheet.getCell(18, 1).value).toBe(22);
    expect(sheet.getCell(24, 1).value).toBe("176:00");
    // Only the two days that have records count as actually worked.
    expect(sheet.getCell(18, 2).value).toBe(2);
    expect(sheet.getCell(24, 2).value).toBe("18:06");
  });

  it("shows the shift's start and end as the standard login/logout times", async () => {
    const workbook = await build([row("2026-06-01", "Present", "21:55", "06:30", 515)]);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(21, 1).value).toBe("09:00");
    expect(sheet.getCell(21, 2).value).toBe("18:00");
  });

  it("shows '-' instead of inventing figures when the employee has no shift", async () => {
    const workbook = await build([
      row("2026-06-01", "Present", "21:55", "06:30", 515, null),
    ]);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(18, 1).value).toBe("-"); // total working days
    expect(sheet.getCell(21, 1).value).toBe("-"); // standard login
    expect(sheet.getCell(24, 1).value).toBe("-"); // expected hours
  });

  it("counts only present and half days as actually worked", () => {
    expect(__test__.markForStatus("Present")).toBe("P");
    expect(__test__.markForStatus("Half Day")).toBe("HD");
    expect(__test__.markForStatus("Checked In")).toBe("CI");
    expect(__test__.markForStatus("Absent")).toBe("A");
    // Anything unrecognised is absence, never a silent pass.
    expect(__test__.markForStatus(undefined)).toBe("A");
  });
});

describe("monthlyStatusSheet — shift arithmetic", () => {
  it("subtracts the unpaid break from a full day", () => {
    // 09:00-18:00 less a 60-minute break = 480 minutes.
    expect(__test__.payableMinutesForDay(SHIFT, { key: "monday" })).toBe(480);
  });

  it("halves a half day and zeroes an off day", () => {
    const shift = {
      ...SHIFT,
      workingDays: { ...SHIFT.workingDays, saturday: { type: "half" } },
    };
    expect(__test__.payableMinutesForDay(shift, { key: "saturday" })).toBe(240);
    expect(__test__.payableMinutesForDay(SHIFT, { key: "sunday" })).toBe(0);
  });

  it("handles a night shift whose window crosses midnight", () => {
    const night = { ...SHIFT, startTime: "21:00", endTime: "06:00", breakMinutes: 60 };
    // 21:00 -> 06:00 is 9h; less the break, 480 minutes.
    expect(__test__.payableMinutesForDay(night, { key: "monday" })).toBe(480);
  });
});

describe("monthlyStatusSheet — edge cases", () => {
  it("renders a placeholder sheet when the period produced no rows", async () => {
    const workbook = await build([]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["No data"]);
  });

  it("groups rows by employee so each gets one sheet", () => {
    const grouped = __test__.groupByEmployee([
      row("2026-06-01", "Present", "09:00", "18:00", 480),
      row("2026-06-02", "Present", "09:00", "18:00", 480),
      { ...row("2026-06-01", "Present", "09:00", "18:00", 480), employeeKey: "e2", employee: "PAVAN" },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].rows).toHaveLength(2);
  });

  it("keeps a name with characters Excel forbids in a sheet name", async () => {
    const workbook = await build([
      { ...row("2026-06-01", "Present", "09:00", "18:00", 480), employee: "A/B:C[D]" },
    ]);
    // Excel rejects : \ / ? * [ ] — the sheet must still be created.
    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0].name).not.toMatch(/[:\\/?*[\]]/);
  });
});
