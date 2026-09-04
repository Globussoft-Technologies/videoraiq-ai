import ExcelJS from "exceljs";
import moment from "moment-timezone";
import { SHIFT_DAY_KEYS, resolveShiftDay } from "../shifts/shifts.model.js";

/**
 * The "Monthly Status Report (Basic Work Duration)" workbook.
 *
 * A different shape from the PDF/CSV report, not a restyling of it. That one is
 * a long list of one row per employee-day; this one is a matrix — every day of
 * the period is a COLUMN, and each employee gets their own worksheet with four
 * rows (Status / InTime / OutTime / Total) plus a summary block underneath.
 *
 * Why a separate module: the row-per-day layout and the matrix layout share
 * nothing but their source rows, so keeping them apart leaves the existing
 * PDF/CSV builders untouched.
 */

/** Short weekday initials as the day header renders them: "1 M", "13 St". */
const DAY_INITIALS = ["S", "M", "T", "W", "Th", "F", "St"];

/** Grid states. Present/Half Day/Checked In come from the attendance record. */
const MARK = {
  PRESENT: "P",
  HALF_DAY: "HD",
  CHECKED_IN: "CI",
  ABSENT: "A",
  WEEK_OFF: "WO",
};

/**
 * Map an existing report-row status onto its grid mark.
 *
 * The strings come from `statusForRow` in the service, which is itself the
 * plain-JS twin of the `attendanceStatusStage` grading the Attendance Logs
 * screen uses. Reading them rather than re-deriving anything is what keeps this
 * sheet from ever disagreeing with that screen.
 */
function markForStatus(status) {
  if (status === "Present") return MARK.PRESENT;
  if (status === "Half Day") return MARK.HALF_DAY;
  if (status === "Checked In") return MARK.CHECKED_IN;
  return MARK.ABSENT;
}

/** "HH:MM" -> minutes since midnight; null for anything unparseable. */
function hhmmToMinutes(text) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(text || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Minutes an employee owes on one working day of their shift: the window, less
 * the unpaid break, halved for a half day. Mirrors `shiftContextStage`'s
 * `expectedFullDayMinutes` so the "expected hours" total here and the per-day
 * grading elsewhere are computed the same way.
 */
function payableMinutesForDay(shift, calendarDay) {
  const day = resolveShiftDay(shift, calendarDay.key);
  if (!day || day.type === "off") return 0;
  const start = hhmmToMinutes(day.start);
  const end = hhmmToMinutes(day.end);
  if (start == null || end == null) return 0;
  // A window that ends before it starts has crossed midnight (night shift).
  const span = end > start ? end - start : end + 24 * 60 - start;
  const payable = Math.max(0, span - (shift.breakMinutes || 0));
  return day.type === "half" ? payable / 2 : payable;
}

/** Minutes -> "H:MM", the compact form the summary and Total row use. */
function minutesToHm(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "00:00";
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Every calendar day in the range, as `{ key, label, dayKey, isOff }`. */
function daysInRange(start, end, timezone, shift) {
  const days = [];
  const cursor = moment.tz(start.format("YYYY-MM-DD"), "YYYY-MM-DD", timezone);
  const last = moment.tz(end.format("YYYY-MM-DD"), "YYYY-MM-DD", timezone);
  while (cursor.isSameOrBefore(last, "day")) {
    const weekday = cursor.day();
    const key = SHIFT_DAY_KEYS[weekday];
    days.push({
      key,
      dateKey: cursor.format("YYYY-MM-DD"),
      label: `${cursor.date()} ${DAY_INITIALS[weekday]}`,
      // With no shift assigned nothing marks a day as off, so an employee
      // without one gets no WO cells rather than an invented Mon-Fri week.
      isOff: shift ? resolveShiftDay(shift, key)?.type === "off" : false,
    });
    cursor.add(1, "day");
  }
  return days;
}

const HEADER_FILL = "FFF2F2F2";
const SUMMARY_FILL = "FFFFFF00"; // The yellow summary labels in the source sheet.
const BORDER = { style: "thin", color: { argb: "FFBFBFBF" } };

function bordered(cell) {
  cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
  return cell;
}

/** One labelled summary box: yellow caption over its value. */
function summaryBox(sheet, row, column, label, value) {
  const head = bordered(sheet.getCell(row, column));
  head.value = label;
  head.font = { bold: true, size: 9, color: { argb: "FFC00000" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUMMARY_FILL } };
  head.alignment = { horizontal: "center", vertical: "middle" };

  const body = bordered(sheet.getCell(row + 1, column));
  body.value = value;
  body.alignment = { horizontal: "center", vertical: "middle" };
  body.font = { size: 10 };
}

/**
 * One employee's worksheet.
 *
 * `rows` are that employee's report rows (one per day that has an attendance
 * record). Days with no record at all are filled from the shift: an off day
 * reads WO, a working day reads A.
 */
function addEmployeeSheet(workbook, { employee, rows, days, label, timezone, shift }) {
  // Excel forbids : \ / ? * [ ] in a sheet name and caps it at 31 chars.
  const safeName = (employee.name || "Employee").replace(/[:\\/?*[\]]/g, " ").slice(0, 26);
  const sheet = workbook.addWorksheet(`${safeName}`.trim() || "Employee");

  const byDate = new Map(rows.map((row) => [row.dateKey, row]));
  const firstDayColumn = 3;
  const lastColumn = firstDayColumn + days.length - 1;

  sheet.getColumn(1).width = 4;
  sheet.getColumn(2).width = 22;
  for (let index = 0; index < days.length; index += 1) {
    sheet.getColumn(firstDayColumn + index).width = 9;
  }

  // ---- Title -------------------------------------------------------------
  sheet.mergeCells(1, 1, 1, lastColumn);
  const title = sheet.getCell(1, 1);
  title.value = "Monthly Status Report (Basic Work Duration)";
  title.font = { bold: true, size: 12 };
  title.alignment = { horizontal: "center" };

  sheet.mergeCells(2, 1, 2, lastColumn);
  const period = sheet.getCell(2, 1);
  period.value = label;
  period.alignment = { horizontal: "center" };
  period.font = { size: 10 };

  sheet.mergeCells(3, 1, 3, lastColumn);
  const printed = sheet.getCell(3, 1);
  printed.value = `Printed On : ${moment().tz(timezone).format("MMM DD YYYY HH:mm")}`;
  printed.alignment = { horizontal: "right" };
  printed.font = { size: 9, color: { argb: "FF666666" } };

  // ---- Identity ----------------------------------------------------------
  const identity = [
    ["Department:", employee.department || "-"],
    ["Emp. Code:", employee.employeeId || "-"],
    ["Emp. Name:", employee.name || "-"],
    ["Shift:", shift ? shift.name || "-" : "Not assigned"],
  ];
  identity.forEach(([labelText, value], index) => {
    const row = 5 + index;
    const head = sheet.getCell(row, 1);
    head.value = labelText;
    head.font = { bold: true, size: 10 };
    const body = sheet.getCell(row, 2);
    body.value = value;
    body.font = { size: 10 };
  });

  // ---- Day header --------------------------------------------------------
  const headerRow = 10;
  const daysLabel = bordered(sheet.getCell(headerRow, 2));
  daysLabel.value = "Days";
  daysLabel.font = { bold: true, size: 10 };
  daysLabel.alignment = { horizontal: "center", vertical: "middle" };
  days.forEach((day, index) => {
    const cell = bordered(sheet.getCell(headerRow, firstDayColumn + index));
    cell.value = day.label;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });

  // ---- Status / InTime / OutTime / Total ---------------------------------
  const lines = [
    {
      title: "Status",
      // A day with a record is graded by the attendance pipeline; a day
      // without one exists only in the calendar, so the shift decides.
      value: (day, row) => (row ? markForStatus(row.status) : day.isOff ? MARK.WEEK_OFF : MARK.ABSENT),
    },
    { title: "InTime", value: (day, row) => (row ? row.inTime : "") },
    { title: "OutTime", value: (day, row) => (row ? row.outTime : "") },
    { title: "Total", value: (day, row) => minutesToHm(row ? row.workingMinutesDay : 0) },
  ];

  lines.forEach((line, lineIndex) => {
    const rowNumber = headerRow + 1 + lineIndex;
    const head = bordered(sheet.getCell(rowNumber, 2));
    head.value = line.title;
    head.font = { bold: true, size: 10 };
    head.alignment = { horizontal: "center", vertical: "middle" };

    days.forEach((day, index) => {
      const cell = bordered(sheet.getCell(rowNumber, firstDayColumn + index));
      cell.value = line.value(day, byDate.get(day.dateKey) || null);
      cell.font = { size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
  });

  // ---- Summary -----------------------------------------------------------
  // Working days come from the shift's week, so they count the days the
  // employee was *expected* — not the days that happen to have a record.
  const totalWorkingDays = shift ? days.filter((day) => !day.isOff).length : null;
  const actualWorkingDays = rows.filter((row) => {
    const mark = markForStatus(row.status);
    return mark === MARK.PRESENT || mark === MARK.HALF_DAY;
  }).length;

  const expectedMinutes = shift
    ? days.reduce((sum, day) => sum + payableMinutesForDay(shift, day), 0)
    : null;
  const actualMinutes = rows.reduce((sum, row) => sum + (row.workingMinutesDay || 0), 0);

  const summaryRow = headerRow + 7;
  summaryBox(sheet, summaryRow, 1, "Total working Days", totalWorkingDays ?? "-");
  summaryBox(sheet, summaryRow, 2, "Actual working days", actualWorkingDays);
  summaryBox(sheet, summaryRow + 3, 1, "Standard Login Time", shift?.startTime || "-");
  summaryBox(sheet, summaryRow + 3, 2, "Standard Logout Time", shift?.endTime || "-");
  summaryBox(
    sheet,
    summaryRow + 6,
    1,
    "Expected Monthly Working Hours",
    expectedMinutes == null ? "-" : minutesToHm(expectedMinutes),
  );
  summaryBox(sheet, summaryRow + 6, 2, "Actual Monthly Working Hours", minutesToHm(actualMinutes));

  // Freeze the label column and everything above the grid, so scrolling
  // across a 31-day month keeps the row titles visible.
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: headerRow }];
  return sheet;
}

/**
 * Group report rows by employee. Rows already carry the employee's identity
 * and their shift, so no extra query is needed here.
 */
function groupByEmployee(rows) {
  const employees = new Map();
  for (const row of rows) {
    const key = row.employeeKey || row.employee;
    if (!employees.has(key)) {
      employees.set(key, {
        employee: {
          name: row.employee,
          employeeId: row.employeeId,
          department: row.department,
        },
        shift: row.shift || null,
        rows: [],
      });
    }
    employees.get(key).rows.push(row);
  }
  return [...employees.values()];
}

/**
 * A workbook is one worksheet per employee. An org with thousands of employees
 * would produce a file no spreadsheet opens comfortably, so the sheet count is
 * capped and the overflow reported on a final summary sheet rather than
 * silently dropped.
 */
const MAX_EMPLOYEE_SHEETS = 200;

/**
 * Build the monthly-status workbook and return it as a Buffer, ready to be
 * uploaded next to the report's PDF/CSV.
 */
export async function buildMonthlyStatusWorkbook({ rows, label, timezone, start, end }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VideoRAIQ";
  workbook.created = new Date();

  const employees = groupByEmployee(rows).sort((left, right) =>
    String(left.employee.name).localeCompare(String(right.employee.name)),
  );
  const included = employees.slice(0, MAX_EMPLOYEE_SHEETS);

  for (const entry of included) {
    addEmployeeSheet(workbook, {
      employee: entry.employee,
      rows: entry.rows,
      // Each employee's day columns are built against their own shift, so two
      // employees on different weeks each get their own WO days.
      days: daysInRange(start, end, timezone, entry.shift),
      label,
      timezone,
      shift: entry.shift,
    });
  }

  if (!included.length) {
    const sheet = workbook.addWorksheet("No data");
    sheet.getCell(1, 1).value = `No attendance records for ${label}.`;
  }

  if (employees.length > included.length) {
    const sheet = workbook.addWorksheet("Not included");
    sheet.getCell(1, 1).value =
      `${employees.length - included.length} more employees are not shown — this report covers ` +
      `the first ${MAX_EMPLOYEE_SHEETS} by name. Narrow the report's target to see the rest.`;
    sheet.getColumn(1).width = 120;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export const __test__ = {
  markForStatus,
  minutesToHm,
  payableMinutesForDay,
  daysInRange,
  groupByEmployee,
  MARK,
};
