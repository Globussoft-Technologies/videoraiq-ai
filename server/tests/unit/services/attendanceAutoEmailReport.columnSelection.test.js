import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import axios from "axios";
import { ATTENDANCE_COLUMNS, BREAK_COLUMNS, selectTableColumns } from "../../../core/v2/attendanceAutoEmailReport/reportColumns.js";
import { createReportSchema, updateReportSchema } from "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.validation.js";
import Report from "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.model.js";
import { buildAttendanceWorkbook } from "../../../core/v2/attendanceAutoEmailReport/attendanceWorkbook.js";
import { buildCsv, buildPdf, reportTableRows, REPORT_HEADERS, usesDailyAttendanceWorkbook } from "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.service.js";
import { BREAK_HEADERS, buildBreakPdf, buildBreakWorkbook } from "../../../core/v2/attendanceAutoEmailReport/breakLogReport.js";

afterEach(() => vi.restoreAllMocks());

const row = {
  employee: "Shoaib", employeeId: "969", department: "Production", date: "28 Oct 2026",
  shift: { name: "Morning", startTime: "09:00", endTime: "18:00" },
  checkIn: "09:00 AM", checkOut: "06:00 PM", sessions: [], breaks: [],
  workingHoursDay: "09:00", breakHoursDay: "00:00", workingHoursPeriod: "09:00",
  checkInImage: "https://example.test/image.jpg",
};
const context = { rows: [row], label: "28 Oct 2026", timezone: "Asia/Kolkata", rowCount: 1 };

describe("optional auto email report columns", () => {
  it("keeps the selectable options aligned with both renderer schemas", () => {
    expect(REPORT_HEADERS).toEqual(ATTENDANCE_COLUMNS);
    expect(BREAK_HEADERS).toEqual(BREAK_COLUMNS);
  });

  it("validates selections and allows clearing them on update", () => {
    const payload = { title: "Test Report", recipients: ["test@example.com"], schedule: { frequency: "daily" }, formats: ["pdf", "xlsx"] };
    const result = createReportSchema.validate(payload);
    expect(result.error).toBeUndefined();
    expect(result.value.selectedColumns).toEqual([]);
    expect(result.value.selectedBreakColumns).toEqual([]);
    expect(updateReportSchema.validate({ selectedColumns: ["Shift Name"], selectedBreakColumns: ["Break Time"] }).error).toBeUndefined();
    expect(updateReportSchema.validate({ selectedColumns: [] }).value.selectedColumns).toEqual([]);
    expect(updateReportSchema.validate({ selectedColumns: ["Invalid"] }).error).toBeDefined();
    expect(updateReportSchema.validate({ selectedBreakColumns: ["Employee ID", "Employee ID"] }).error).toBeDefined();
  });

  it("retains both selections in saved report documents", () => {
    const report = new Report({ selectedColumns: ["Shift Name"], selectedBreakColumns: ["Break Time"] });
    expect(report.toObject().selectedColumns).toEqual(["Shift Name"]);
    expect(report.toObject().selectedBreakColumns).toEqual(["Break Time"]);
    expect(new Report().selectedColumns).toEqual([]);
  });

  it("keeps all columns when omitted or empty, and preserves hyperlinks when selecting", () => {
    const lines = reportTableRows([row]);
    expect(selectTableColumns(REPORT_HEADERS, lines).headers).toEqual(REPORT_HEADERS);
    expect(selectTableColumns(REPORT_HEADERS, lines, []).lines).toEqual(lines);
    const table = selectTableColumns(REPORT_HEADERS, lines, ["Checkin Image", "Employee Name"]);
    expect(table.headers).toEqual(["Employee Name", "Checkin Image"]);
    expect(table.lines[0].cells).toEqual(["Shoaib", { text: "Checkin Image", link: row.checkInImage }]);
    expect(table.lines.every((line) => line.cells.length === 2)).toBe(true);
  });

  it("limits CSV data and headers to selected attendance columns", () => {
    const csv = buildCsv({ ...context, report: { selectedColumns: ["Shift Name", "Shift Timings"] } }).toString();
    expect(csv).toContain("Shift Name,Shift Timings\r\nMorning,09:00 - 18:00");
    expect(csv).not.toContain("Employee ID");
    expect(csv).not.toContain("Shoaib");
  });

  it("uses a table for selected columns on multi-day reports and retains the default matrix otherwise", () => {
    const summary = { start: "2026-10-01", end: "2026-10-28", timezone: context.timezone };
    expect(usesDailyAttendanceWorkbook({ schedule: { frequency: "monthly" } }, summary)).toBe(false);
    expect(usesDailyAttendanceWorkbook({ schedule: { frequency: "monthly" }, selectedColumns: ["Shift Name"] }, summary)).toBe(true);
  });

  it.each([[["Shift Name"]], [["Employee Name", "Shift Timings", "Checkin Image"]]])("renders attendance Excel with exactly %j", async (selected) => {
    const table = selectTableColumns(REPORT_HEADERS, reportTableRows([row]), selected);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildAttendanceWorkbook({ ...context, ...table }));
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(6).values.slice(1)).toEqual(table.headers);
    expect(sheet.columnCount).toBe(table.headers.length);
    expect(sheet.getCell(7, 1).value).toBe(selected.length === 1 ? "Morning" : "Shoaib");
    if (selected.includes("Checkin Image")) expect(sheet.getCell(7, 3).value.hyperlink).toBe(row.checkInImage);
  });

  it("renders a single selected break-log Excel column", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildBreakWorkbook({ ...context, selectedColumns: ["Shift Timings"] }));
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(4).values.slice(1)).toEqual(["Shift Timings"]);
    expect(sheet.columnCount).toBe(1);
    expect(sheet.getCell(5, 1).value).toBe("09:00 - 18:00");
  });

  it.each(["attendance", "break"])("limits %s PDF headings and values to its own selection", async (kind) => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("No branding network request"));
    const text = vi.spyOn(PDFDocument.prototype, "text");
    const report = { selectedColumns: ["Shift Name"], selectedBreakColumns: ["Shift Timings"] };
    const buffer = kind === "attendance" ? await buildPdf({ ...context, report }) : await buildBreakPdf({ ...context, report });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    const printed = text.mock.calls.map(([value]) => String(value));
    expect(printed).toContain(kind === "attendance" ? "Shift Name" : "Shift Timings");
    expect(printed).toContain(kind === "attendance" ? "Morning" : "09:00 - 18:00");
    expect(printed).not.toContain("Employee ID");
    expect(printed).not.toContain("Shoaib");
    expect(printed).not.toContain(kind === "attendance" ? "Shift Timings" : "Shift Name");
  });

  it.each([undefined, ["Late By (minutes)"]])("formats PDF lateness as HH:mm:ss with selection %j", async (selectedColumns) => {
    vi.spyOn(axios, "get").mockRejectedValue(new Error("No branding network request"));
    const text = vi.spyOn(PDFDocument.prototype, "text");
    const lateRows = [489, 224, 185, 49, 0, null].map((lateMinutes) => ({ ...row, lateMinutes }));
    await buildPdf({ ...context, rows: lateRows, report: { selectedColumns } });
    const printed = text.mock.calls.map(([value]) => String(value));
    expect(printed).toContain("Late By (HH:mm:ss)");
    for (const duration of ["08:09:00", "03:44:00", "03:05:00", "00:49:00", "00:00:00", "-"]) {
      expect(printed).toContain(duration);
    }
    for (const raw of ["489", "224", "185", "49"]) expect(printed).not.toContain(raw);
    expect(lateRows[0].lateMinutes).toBe(489);
  });
});
