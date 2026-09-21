import ExcelJS from "exceljs";

const NAVY = "FF26358C";
const BLUE = "FF6F95EF";
const PURPLE = "FF9562E8";
const DAY_FILL = "FFE9EEF9";
const TOTAL_FILL = "FFDCE6F8";
const BORDER_COLOR = "FFC9D4EA";

const COLUMN_WIDTHS = {
  "S No": 8,
  "Employee ID": 15,
  "Employee Name": 24,
  Department: 20,
  "Shift ID": 17,
  "Shift Timings": 24,
  Date: 16,
  "Location/Unit Number": 22,
  "Check in": 15,
  "Check out": 15,
  Duration: 13,
  "Total Working Hours for the Day": 20,
  "Break Time": 15,
  "Total Break Hours for the Day": 20,
  "Total Break Hours for the Selected Period": 23,
  "Total Working Hours for the Selected Period": 23,
  "Checkin Camera": 20,
  "Checkout Camera": 20,
  "Checkin Image": 15,
  "Checkout Image": 15,
};

const thinBorder = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

function worksheetValue(value) {
  if (value && typeof value === "object") {
    if (value.link) {
      return {
        text: String(value.text || "View Image"),
        hyperlink: String(value.link),
        tooltip: "Open attendance image",
      };
    }
    return value.text || "";
  }
  return value ?? "";
}

/** Daily workbook using the PDF's expanded day/session/total table. */
export async function buildAttendanceWorkbook({ headers, lines, label, timezone, rowCount }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VideoraIQ";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Attendance Report", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 8,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
    },
  });

  const lastColumn = Math.max(1, headers.length);
  sheet.mergeCells(1, 1, 2, Math.max(1, lastColumn - 5));
  sheet.mergeCells(1, Math.max(2, lastColumn - 4), 2, lastColumn);

  const brand = sheet.getCell(1, 1);
  brand.value = "VideoraIQ";
  brand.font = { bold: true, size: 24, color: { argb: "FFFFFFFF" } };
  brand.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  brand.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const title = sheet.getCell(1, Math.max(2, lastColumn - 4));
  title.value = "Attendance Report";
  title.font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 24;

  sheet.mergeCells(3, 1, 3, lastColumn);
  const period = sheet.getCell(3, 1);
  period.value = label;
  period.font = { bold: true, size: 14, color: { argb: NAVY } };
  period.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(3).height = 25;

  sheet.mergeCells(4, 1, 4, lastColumn);
  const meta = sheet.getCell(4, 1);
  meta.value = `Timezone: ${timezone}  •  ${rowCount} attendance record${rowCount === 1 ? "" : "s"}`;
  meta.font = { size: 10, color: { argb: "FF52658C" } };
  meta.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const headerRow = sheet.getRow(6);
  headerRow.values = headers;
  headerRow.height = 34;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  });

  for (const line of lines) {
    const row = sheet.addRow(line.cells.map(worksheetValue));
    row.height = line.kind === "total" ? 23 : 30;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 9, bold: line.kind === "day" || line.kind === "total", color: { argb: NAVY } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = thinBorder;
      if (line.kind === "day") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DAY_FILL } };
      if (line.kind === "total") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
      if (cell.value && typeof cell.value === "object" && cell.value.hyperlink) {
        cell.font = { ...cell.font, color: { argb: "FF3973E6" }, underline: true };
      }
    });
  }

  if (!lines.length) {
    const row = sheet.addRow(["No attendance records"]);
    row.height = 28;
    sheet.mergeCells(row.number, 1, row.number, lastColumn);
    const cell = sheet.getCell(row.number, 1);
    cell.font = { bold: true, size: 11, color: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DAY_FILL } };
    cell.border = thinBorder;
  }

  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = COLUMN_WIDTHS[header] || 16;
  });
  sheet.views = [{ state: "frozen", ySplit: 6 }];
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: lastColumn } };
  sheet.pageSetup.printTitlesRow = "1:6";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const __test__ = { worksheetValue };
