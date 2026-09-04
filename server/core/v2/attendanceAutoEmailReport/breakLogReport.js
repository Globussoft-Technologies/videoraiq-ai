import ExcelJS from "exceljs";
import { buildPdf, csvField, csvCell, imageCell, shiftNameFor, shiftTimingsFor } from "./attendanceAutoEmailReport.service.js";

/**
 * The Break Logs report — one row per break rather than one row per work
 * session.
 *
 * The attendance report answers "when was this person here"; this one answers
 * "when were they away, and for how long". Both read the same attendance rows,
 * but a break is a different unit: it is the gap BETWEEN two work sessions, so
 * it has its own out/in times, its own cameras, and its own duration. Each
 * employee-day's breaks are listed in order and closed by a subtotal line.
 *
 * Rendered as PDF (through the shared drawing code in the service) and as a
 * real .xlsx workbook.
 */

/**
 * Column schema, mirroring REPORT_COLUMNS in the service: each column declares
 * what it renders for each line kind, and a column with no function for a kind
 * renders blank there. `width` is used by the PDF; the Excel sheet uses it as a
 * character-width hint.
 */
const BREAK_COLUMNS = [
  { header: "ID", width: 26, break: (ctx) => String(ctx.index + 1) },
  { header: "Emp. Code", width: 58, break: (ctx) => ctx.row.employeeId },
  { header: "Name", width: 92, wrap: true, break: (ctx) => ctx.row.employee },
  { header: "Department", width: 86, wrap: true, break: (ctx) => ctx.row.department },
  { header: "Shift", width: 74, wrap: true, break: (ctx) => shiftNameFor(ctx.row.shift) },
  { header: "Shift Timings", width: 76, break: (ctx) => shiftTimingsFor(ctx.row.shift) },
  { header: "Date", width: 64, break: (ctx) => ctx.row.date },
  { header: "Location", width: 68, wrap: true, break: (ctx) => ctx.row.location },
  // Which break of the day this is — without it, two breaks by the same person
  // on the same day are hard to tell apart at a glance.
  { header: "Break #", width: 44, break: (ctx) => (ctx.item ? String(ctx.item.index) : "-") },
  { header: "Break Out", width: 76, break: (ctx) => (ctx.item ? ctx.item.outAt : "-") },
  { header: "Break In", width: 76, break: (ctx) => (ctx.item ? ctx.item.inAt : "-") },
  { header: "Break Time", width: 62, break: (ctx) => (ctx.item ? ctx.item.duration : "-") },
  {
    header: "Total Break Time",
    width: 72,
    // Only the subtotal line carries the day's total, so the same number is
    // never repeated down a block of break rows.
    total: (ctx) => ctx.row.breakHoursDay,
  },
  { header: "Break Out Camera", width: 96, wrap: true, break: (ctx) => (ctx.item ? ctx.item.outCamera : "-") },
  { header: "Break In Camera", width: 96, wrap: true, break: (ctx) => (ctx.item ? ctx.item.inCamera : "-") },
  { header: "View Image", width: 56, break: (ctx) => (ctx.item ? imageCell(ctx.item.image) : "-") },
];

export const BREAK_HEADERS = BREAK_COLUMNS.map((column) => column.header);

/** PDF column widths, taken from the same schema so the two cannot drift. */
export const BREAK_PDF_COLUMNS = BREAK_COLUMNS.map(({ header, width, wrap }) => ({
  head: header,
  width,
  ...(wrap ? { wrap: true } : {}),
}));

function lineFor(kind, ctx) {
  return {
    kind,
    cells: BREAK_COLUMNS.map((column) => {
      const value = column[kind] ? column[kind](ctx) : "";
      return value == null ? "" : value;
    }),
  };
}

/**
 * Expand attendance rows into break lines.
 *
 * Every employee-day produces at least one line: a day with no break at all
 * still appears, saying so, rather than vanishing from the report — otherwise
 * "no breaks taken" and "employee missing from the report" look identical.
 * Days with breaks produce one line each, closed by a subtotal line.
 */
export function breakTableRows(rows) {
  const out = [];
  rows.forEach((row, index) => {
    const breaks = row.breaks || [];
    if (!breaks.length) {
      // The "-" placeholders come from the column schema itself (every break
      // column renders "-" when there is no break), so this line stays aligned
      // with the rest without hand-placed padding.
      out.push(lineFor("break", { row, index, item: null }));
      return;
    }
    for (const item of breaks) out.push(lineFor("break", { row, index, item }));
    out.push(lineFor("total", { row, index, item: null }));
  });
  return out;
}

const TITLE = "Break Logs";
const EMPTY_TEXT = "No breaks were recorded for this period.";

export function buildBreakCsv({ rows, label, timezone }) {
  const meta = [
    ["VideoraIQ Break Logs"],
    ["Report", TITLE],
    ["Period", label],
    ["Timezone", timezone],
    [],
    BREAK_HEADERS,
  ].map((line) => line.map(csvCell).join(","));
  const body = breakTableRows(rows).map(({ cells }) => cells.map(csvField).join(","));
  return Buffer.from(`﻿${[...meta, ...body].join("\r\n")}`, "utf8");
}

export async function buildBreakPdf({ report, rows, label, timezone }) {
  return buildPdf({
    report,
    rows,
    label,
    timezone,
    columns: BREAK_PDF_COLUMNS,
    lines: breakTableRows(rows),
    title: TITLE,
    emptyText: EMPTY_TEXT,
  });
}

const HEADER_FILL = "FF173B83";
const SUBTOTAL_FILL = "FFE6EDFA";
const BORDER = { style: "thin", color: { argb: "FFD8DFEC" } };

/** The break log as a real .xlsx workbook — one sheet, one row per break. */
export async function buildBreakWorkbook({ rows, label, timezone }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VideoRAIQ";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Break Logs");

  sheet.mergeCells(1, 1, 1, BREAK_HEADERS.length);
  const title = sheet.getCell(1, 1);
  title.value = `Break Logs — ${label}`;
  title.font = { bold: true, size: 13 };
  title.alignment = { horizontal: "center" };

  sheet.mergeCells(2, 1, 2, BREAK_HEADERS.length);
  const sub = sheet.getCell(2, 1);
  sub.value = `Timezone: ${timezone}`;
  sub.font = { size: 9, color: { argb: "FF61708F" } };
  sub.alignment = { horizontal: "center" };

  const headerRow = 4;
  BREAK_HEADERS.forEach((header, index) => {
    const cell = sheet.getCell(headerRow, index + 1);
    cell.value = header;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
    // PDF points are roughly half a spreadsheet character column.
    sheet.getColumn(index + 1).width = Math.max(9, Math.round(BREAK_COLUMNS[index].width / 5.5));
  });

  breakTableRows(rows).forEach((line, lineIndex) => {
    const rowNumber = headerRow + 1 + lineIndex;
    line.cells.forEach((value, columnIndex) => {
      const cell = sheet.getCell(rowNumber, columnIndex + 1);
      // An image cell arrives as { text, link } — write it as a real hyperlink
      // so the label shows rather than a raw path.
      if (value && typeof value === "object" && value.link) {
        cell.value = { text: value.text || "View Image", hyperlink: value.link };
        cell.font = { size: 9, color: { argb: "FF609FF7" }, underline: true };
      } else {
        cell.value = value === "" ? null : value;
        cell.font = { size: 9, bold: line.kind === "total" };
      }
      if (line.kind === "total") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
      }
      cell.alignment = { vertical: "middle", wrapText: Boolean(BREAK_COLUMNS[columnIndex].wrap) };
      cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
    });
  });

  if (!rows.length) {
    sheet.getCell(headerRow + 1, 1).value = EMPTY_TEXT;
  }

  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export const __test__ = { BREAK_COLUMNS };
