import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildAttendanceWorkbook } from "../../../core/v2/attendanceAutoEmailReport/attendanceWorkbook.js";

describe("daily attendance auto-email workbook", () => {
  it("renders expanded rows and keeps attendance image links clickable", async () => {
    const buffer = await buildAttendanceWorkbook({
      headers: ["S No", "Employee Name", "View Image"],
      lines: [
        { kind: "day", cells: ["1", "Test Employee", { text: "View Image", link: "https://example.com/image.jpg" }] },
        { kind: "session", cells: ["", "", ""] },
        { kind: "total", cells: ["", "", "00:03"] },
      ],
      label: "14 Sep 2026 – 14 Sep 2026",
      timezone: "Asia/Kolkata",
      rowCount: 1,
    });

    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Attendance Report");

    expect(sheet.getRow(6).values.slice(1)).toEqual(["S No", "Employee Name", "View Image"]);
    expect(sheet.getCell("B7").value).toBe("Test Employee");
    expect(sheet.getCell("C7").value).toEqual(
      expect.objectContaining({ text: "View Image", hyperlink: "https://example.com/image.jpg" }),
    );
    expect(sheet.getCell("A9").fill.fgColor.argb).toBe("FFDCE6F8");
  });

  it("adds a visible empty-state row when a daily report has no attendance records", async () => {
    const buffer = await buildAttendanceWorkbook({
      headers: ["S No", "Employee Name", "Date"],
      lines: [],
      label: "14 Sep 2026 - 14 Sep 2026",
      timezone: "Asia/Kolkata",
      rowCount: 0,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Attendance Report");

    expect(sheet.getCell("A7").value).toBe("No attendance records");
    expect(sheet.getCell("A7").isMerged).toBe(true);
    expect(sheet.getCell("A7").fill.fgColor.argb).toBe("FFE9EEF9");
  });
});
