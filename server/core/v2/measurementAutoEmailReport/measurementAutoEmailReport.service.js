import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import moment from "moment-timezone";
import sendGridMail from "@sendgrid/mail";
import config from "config";
import Joi from "joi";
import path from "path";
import { fileURLToPath } from "url";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { putMedia } from "../../../utils/mediaStorage.js";
import Admin from "../admin/admin.model.js";
import Recipient from "../verifyRecipients/recipients.model.js";
import MeasurementIncident from "../measurementLogs/measurementLog.model.js";
import { toRow } from "../measurementLogs/measurementLog.service.js";
import Report from "./measurementAutoEmailReport.model.js";
import { createReportSchema, updateReportSchema } from "./measurementAutoEmailReport.validation.js";
import { trackFailedEmail, trackOutboundEmail } from "../emailMonitoring/emailTracker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same PNG used by the client's own "Download Report" PDF export
// (client_v2/src/assets/videoraiq-logo-white.png), kept as a server-side copy
// so pdfkit can embed it without reaching into the frontend package.
const LOGO_PATH = path.join(__dirname, "../../../assets/videoraiq-logo-white.png");

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const REPORT_DISPLAY_TITLE = "Mattress QC Report";
const V2_BLUE = "#609ff7";
const V2_PURPLE = "#9274f5";

// Column layout shared by the PDF table and the CSV / XLSX exports — mirrors the
// on-screen Measurement Records table and the client "Download Report" PDF.
const HEADERS = [
  "#", "Order", "Order Item", "Ref", "SKU", "Model",
  "Printed LxWxH (in)", "Measured LxWxH (in)", "Measured raw (DS)", "Unit",
  "Dev L (in)", "Dev W (in)", "Dev H (in)", "Confidence", "Match %",
  "Station", "When", "Result", "Snapshot", "Measurement Image",
];

// Relative column widths for the PDF table (must have one entry per HEADER).
const PDF_COL_WEIGHTS = [
  3, 12, 12, 8, 10, 8, 13, 13, 13, 4, 7, 7, 7, 7, 6, 7, 15, 8, 9, 9,
];

const SNAP_LINK_TEXT = "View image";

// Worst axis vs its tolerance → match score (100 = on the label, 0 = at/past tol).
const matchPctCell = (r) => {
  if (r.devPct === "QR unread") return "QR unread";
  if (!Number.isFinite(r.devFrac)) return "—";
  return `${Math.max(0, Math.round(100 - r.devFrac * 100))}%`;
};

const snapUrlOf = (r) => r.shotUrl || r.shot || r.qrImageUrl || r.measurementImageUrl || "";

// The DS measurement frame specifically — distinct from the QR-cam capture above.
const measurementImageUrlOf = (r) => r.measurementImageUrl || "";

let runner = null;
let runnerBusy = false;

/* ─────────────── helpers ─────────────── */

function adminIdFrom(req) {
  return req?.verified?.userData?.adminId;
}

function validTimezone(value) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
    return value;
  } catch {
    return null;
  }
}

function reportTimezone(report) {
  return validTimezone(report.timezone) || DEFAULT_TIMEZONE;
}

async function savedAdminTimezone(adminId) {
  const admin = await Admin.findById(adminId).select("timezone").lean();
  return validTimezone(admin?.timezone) || DEFAULT_TIMEZONE;
}

// Mirror measurementLog.service.js: a device MAC renders as QC-<last octet>.
function stationLabel(id) {
  if (!id) return "";
  const s = String(id);
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(s) ? `QC-${s.split(":").pop().toUpperCase()}` : s;
}

function normalizeSchedule(schedule) {
  if (schedule.frequency !== "custom") {
    return { ...schedule, startDate: null, endDate: null };
  }
  return schedule;
}

const RESULT_LABEL = { pass: "Pass", mismatch: "Mismatch", qrerr: "QR Error" };

/**
 * The measurement rows a scheduled run should attach — a window of
 * `measurement_incidents` docs for this admin, mapped through the same
 * `toRow` used by the Measurement Logs page so the report matches the UI.
 */
async function fetchMeasurementRows(report, timezone) {
  const now = moment().tz(timezone);
  let start;
  let end = now.clone();
  if (report.schedule.frequency === "daily") start = now.clone().subtract(1, "day");
  else if (report.schedule.frequency === "weekly") start = now.clone().subtract(7, "day");
  else if (report.schedule.frequency === "monthly") start = now.clone().subtract(1, "month");
  else {
    // custom: the explicit from–to range.
    start = moment(report.schedule.startDate).tz(timezone).startOf("day");
    end = moment(report.schedule.endDate).tz(timezone).endOf("day");
  }
  const label = `${start.format("DD MMM YYYY")} – ${end.format("DD MMM YYYY")}`;

  const match = {
    adminId: String(report.adminId),
    $or: [
      { dsProcessedAt: { $gte: start.toDate(), $lte: end.toDate() } },
      { createdAt: { $gte: start.toDate(), $lte: end.toDate() } },
    ],
  };

  // Station scope. stationId is a device MAC; the schedule stores the short
  // label (QC-EC / L1-QC-01), so match on the trailing octet when it looks
  // like one, else an exact match.
  if (report.target?.scope === "stations" && report.target.stations?.length) {
    match.stationId = {
      $in: report.target.stations.map((s) =>
        /^QC-[0-9A-F]{2}$/i.test(s)
          ? new RegExp(`${s.slice(3)}$`, "i")
          : s,
      ),
    };
  }

  const docs = await MeasurementIncident.find(match)
    .sort({ dsProcessedAt: -1, createdAt: -1 })
    .limit(5000)
    .lean();

  const rows = docs.map((d) => {
    const row = toRow(d, timezone);
    row.result = RESULT_LABEL[row.status] || row.status;
    return row;
  });

  return { rows, label, timezone };
}

const SNAP_HEADERS = ["Snapshot", "Measurement Image"];

// Column set depends on whether snapshots are attached to this schedule.
function headersFor(withSnaps) {
  return withSnaps ? HEADERS : HEADERS.filter((h) => !SNAP_HEADERS.includes(h));
}

function linkCell(url, snap) {
  if (!url) return "—";
  return snap === "hyperlink"
    ? `=HYPERLINK("${url.replace(/"/g, '""')}","${SNAP_LINK_TEXT}")`
    : SNAP_LINK_TEXT;
}

// `snap`:
//   "text"      → "View image" plain text (XLSX turns the cell into a link)
//   "hyperlink" → =HYPERLINK("url","View image")  (CSV — Excel/Sheets render a
//                 clickable "View image"; opens the snapshot on click)
//   PDF drops both image columns via `withSnaps: false`.
function toCells(r, i, { snap = "text", withSnaps = true } = {}) {
  const cells = [
    i + 1,
    r.orderId, r.orderItem || "—", r.refNo, r.sku, r.model,
    r.declared, r.measured, r.measuredRaw || "—", r.measuredUnit || "—",
    r.devL, r.devB, r.devH,
    r.confidence != null ? Number(r.confidence).toFixed(2) : "—",
    matchPctCell(r),
    r.station, r.dateTime || r.time, r.result,
  ];
  if (withSnaps) {
    cells.push(linkCell(snapUrlOf(r), snap));
    cells.push(linkCell(measurementImageUrlOf(r), snap));
  }
  return cells;
}

function buildCsv({ rows, label, withSnaps = true }) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ["VideoraIQ"],
    ["Mattress Measurement Logs"],
    [label],
    [`Generated on ${moment().format("DD/MM/YYYY hh:mm A")}`],
    [],
    headersFor(withSnaps),
    ...rows.map((r, i) => toCells(r, i, { snap: "hyperlink", withSnaps })),
  ].map((cols) => cols.map(esc).join(","));
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

async function buildXlsx({ rows, label, withSnaps = true }) {
  const headers = headersFor(withSnaps);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Measurement Records");
  ws.addRow(["VideoraIQ"]);
  ws.addRow(["Mattress Measurement Logs"]);
  ws.addRow([label]);
  ws.addRow([`Generated on ${moment().format("DD/MM/YYYY hh:mm A")}`]);
  ws.addRow([]);
  ws.addRow(headers);
  const linkCols = withSnaps
    ? [
        { col: headers.indexOf("Snapshot") + 1, urlOf: snapUrlOf }, // ExcelJS 1-based
        { col: headers.indexOf("Measurement Image") + 1, urlOf: measurementImageUrlOf },
      ]
    : [];
  rows.forEach((r, i) => {
    const row = ws.addRow(toCells(r, i, { withSnaps }));
    linkCols.forEach(({ col, urlOf }) => {
      const url = urlOf(r);
      if (!url) return;
      const cell = row.getCell(col);
      cell.value = { text: SNAP_LINK_TEXT, hyperlink: url };
      cell.font = { color: { argb: "FF2563EB" }, underline: true };
    });
  });
  ws.columns.forEach((col, idx) => {
    col.width = Math.max(12, String(headers[idx] || "").length + 2);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const PDF_MARGIN = 24;
const HEADER_FILL = "#2f6fd0";
const ALT_ROW_FILL = "#f5f7fa";
const GRID_COLOR = "#dbe2ea";
const BAND_NAVY = "#26116C"; // rgb(38,17,105)
const BAND_TRIANGLE = "#1B125C"; // rgb(27,18,92)
const BAND_HEIGHT = 62;
const BAND_TOP = 20;

// Bordered, alternating-row table — matches the client "Download Report" PDF
// (branded header, real grid, "View image" hyperlinks in the Snapshot column).
function buildPdf({ rows, label, withSnaps = true }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: PDF_MARGIN });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const headers = withSnaps ? HEADERS : HEADERS.filter((h) => !SNAP_HEADERS.includes(h));
    const weights = withSnaps
      ? PDF_COL_WEIGHTS
      : PDF_COL_WEIGHTS.filter((_, i) => !SNAP_HEADERS.includes(HEADERS[i]));
    const snapIdx = headers.indexOf("Snapshot");
    const measImgIdx = headers.indexOf("Measurement Image");

    const pageLeft = PDF_MARGIN;
    const tableWidth = doc.page.width - PDF_MARGIN * 2;
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const colX = [];
    let x = pageLeft;
    weights.forEach((w) => {
      colX.push(x);
      x += (w / totalWeight) * tableWidth;
    });
    colX.push(pageLeft + tableWidth);
    const colW = (i) => colX[i + 1] - colX[i];

    // ── branded header band — navy card with a diagonal accent, the
    // VideoraIQ logo, a divider, and the title/summary line. Mirrors the
    // client's own "Download Report" PDF header exactly. ──
    const summary = summariseRows(rows);
    const bandTop = BAND_TOP;
    const bandBottom = bandTop + BAND_HEIGHT;

    doc.roundedRect(pageLeft, bandTop, tableWidth, BAND_HEIGHT, 4).fill(BAND_NAVY);

    // Diagonal accent, clipped to the band's rounded rect so it can't bleed
    // past the band's left edge / corners.
    doc.save();
    doc.roundedRect(pageLeft, bandTop, tableWidth, BAND_HEIGHT, 4).clip();
    doc.polygon(
      [pageLeft, bandTop],
      [pageLeft + 105, bandTop],
      [pageLeft, bandTop + BAND_HEIGHT],
    ).fill(BAND_TRIANGLE);
    doc.restore();

    // Logo — native 2560×723 (≈3.54:1); fit to a fixed height, vertically centered.
    const logoH = 26;
    const logoW = logoH * (2560 / 723);
    const logoX = pageLeft + 16;
    try {
      doc.image(LOGO_PATH, logoX, bandTop + (BAND_HEIGHT - logoH) / 2, { height: logoH });
    } catch {
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10)
        .text("VideoraIQ", logoX, bandTop + BAND_HEIGHT / 2 - 5);
    }

    // Divider, clear of the logo's rendered width.
    const dividerX = logoX + logoW + 14;
    doc.strokeColor("#465BB2").lineWidth(1)
      .moveTo(dividerX, bandTop + 10)
      .lineTo(dividerX, bandBottom - 10)
      .stroke();

    const textX = dividerX + 16;
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(15)
      .text("Mattress Measurement Logs", textX, bandTop + 13);
    doc.font("Helvetica").fontSize(8).fillColor("#dceafd").text(
      `${rows.length} record${rows.length === 1 ? "" : "s"}  |  ${summary.pass} pass  |  ${summary.mismatch} mismatch  |  ${summary.qrErr} QR error   ·   ${label}   ·   Generated ${moment().format("DD/MM/YYYY hh:mm A")}`,
      textX,
      bandTop + 34,
    );

    let y = bandBottom + 14;

    const rowHeight = (cells, font, size) => {
      doc.font(font).fontSize(size);
      let h = 12;
      cells.forEach((c, i) => {
        const hh = doc.heightOfString(String(c), { width: colW(i) - 8 }) + 6;
        if (hh > h) h = hh;
      });
      return h;
    };

    const drawRow = (cells, { header = false, zebra = false, rowIndex = 0 } = {}) => {
      const font = header ? "Helvetica-Bold" : "Helvetica";
      const size = header ? 6.4 : 6.2;
      const h = rowHeight(cells, font, size);

      // Page break: start a new page, repeat the header, then draw THIS row
      // fresh at the new `y` — never fall through with stale coordinates.
      if (!header && y + h > doc.page.height - PDF_MARGIN) {
        doc.addPage();
        y = PDF_MARGIN;
        drawRow(headers, { header: true });
        drawRow(cells, { header, zebra, rowIndex });
        return;
      }

      if (header) {
        doc.rect(pageLeft, y, tableWidth, h).fill(HEADER_FILL);
      } else if (zebra) {
        doc.rect(pageLeft, y, tableWidth, h).fill(ALT_ROW_FILL);
      }

      doc.font(font).fontSize(size)
        .fillColor(header ? "#ffffff" : "#111111");

      cells.forEach((cell, i) => {
        const cx = colX[i] + 4;
        const cw = colW(i) - 8;
        const text = String(cell);
        const isSnapLink = !header && (i === snapIdx || i === measImgIdx) && text === SNAP_LINK_TEXT;
        const isResult = !header && headers[i] === "Result";

        if (isSnapLink) {
          const url = i === snapIdx ? snapUrlOf(rows[rowIndex]) : measurementImageUrlOf(rows[rowIndex]);
          doc.fillColor("#2563eb").text(text, cx, y + 3, { width: cw, underline: true });
          if (url) {
            const tw = doc.widthOfString(text);
            doc.link(cx, y + 3, tw, size + 2, url);
          }
          doc.fillColor("#111111");
        } else if (isResult) {
          const c = text === "Pass" ? "#16a34a" : text === "Mismatch" ? "#dc2626" : "#d97706";
          doc.fillColor(c).text(text, cx, y + 3, { width: cw });
          doc.fillColor("#111111");
        } else {
          doc.text(text, cx, y + 3, { width: cw });
        }
      });

      // grid lines
      doc.strokeColor(GRID_COLOR).lineWidth(0.4);
      doc.moveTo(pageLeft, y + h).lineTo(pageLeft + tableWidth, y + h).stroke();
      for (let i = 1; i < colX.length - 1; i += 1) {
        doc.moveTo(colX[i], y).lineTo(colX[i], y + h).stroke();
      }
      doc.moveTo(pageLeft, y).lineTo(pageLeft + tableWidth, y).stroke();
      doc.moveTo(pageLeft, y).lineTo(pageLeft, y + h).stroke();
      doc.moveTo(pageLeft + tableWidth, y).lineTo(pageLeft + tableWidth, y + h).stroke();

      y += h;
    };

    if (!rows.length) {
      doc.font("Helvetica").fontSize(10).fillColor("#64748b")
        .text("No measurement records for this period.", pageLeft, y + 8);
      doc.end();
      return;
    }

    drawRow(headers, { header: true });
    rows.forEach((r, i) => {
      drawRow(toCells(r, i, { withSnaps }), { zebra: i % 2 === 1, rowIndex: i });
    });

    doc.end();
  });
}

function summariseRows(rows) {
  return {
    pass: rows.filter((r) => r.result === "Pass").length,
    mismatch: rows.filter((r) => r.result === "Mismatch").length,
    qrErr: rows.filter((r) => r.result === "QR Error").length,
  };
}

async function uploadFiles(report, buffers) {
  const stamp = moment().format("YYYY-MM-DD");
  const base = `qc-measurement-${stamp}`;
  const folderName = String(report.adminId);
  const files = [];
  for (const [format, buffer] of Object.entries(buffers)) {
    if (!buffer) continue;
    const path = await putMedia({
      buffer,
      mediaType: "report",
      folderName,
      originalName: `${base}.${format}`,
    });
    files.push({ format, path });
  }
  return files;
}

// Absolute URL for a stored report file. `downloadAs` forces the browser to
// save it with a clean name (`qc-measurement-2026-09-10.pdf`) instead of the
// storage leaf (`<epoch>-<uuid>-qc-measurement-2026-09-10.pdf`). The media
// route (GET /api/v1/uploads/:mediaPath) honours `?download=`.
function publicUrl(path, downloadAs) {
  if (!path) return "";
  const base = /^https?:\/\//i.test(path)
    ? path
    : `${config.get("ImageView")}${path.startsWith("/") ? "" : "/"}${path}`;
  return downloadAs
    ? `${base}${base.includes("?") ? "&" : "?"}download=${encodeURIComponent(downloadAs)}`
    : base;
}

// Clean, human filename for a report file of a given format.
function reportFileName(format) {
  return `qc-measurement-${moment().format("YYYY-MM-DD")}.${format}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

// Email palette — mirrors the attendance report email (deep-navy accents, clean
// white card on a soft-blue ground) but keeps this report's own violet/blue
// brand for the header gradient, the stat badge and the primary PDF button.
const MAIL = {
  navy: "#123a8f",
  navyDark: "#0f2f73",
  violet: V2_PURPLE,       // #9274f5
  violetDark: "#6f4fe0",
  blue: V2_BLUE,           // #609ff7
  blueDark: "#3f7fe0",
  green: "#1e9e63",        // CSV
  greenDark: "#17864f",
  teal: "#0f766e",         // XLSX
  tealDark: "#0c5d56",
  paper: "#eef2f9",
  card: "#ffffff",
  panel: "#f4f6fb",
  rule: "#e4e8f1",
  tx: "#1f2a44",
  tx2: "#5b6784",
  tx3: "#8a94ab",
};

const SANS = "font-family:'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;";

// Inline SVG icons as data URIs (CSP-safe, render as <img> in every client).
const MAIL_ICON = {
  shieldWhite: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="2.6"/></svg>`
  )}`,
  rulerWhite: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="M14.5 12.5 12 15M11 9l-2.5 2.5M8 6 5.5 8.5M17 15l-2 2"/></svg>`
  )}`,
  calendarViolet: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${V2_PURPLE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`
  )}`,
  pinViolet: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${V2_PURPLE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`
  )}`,
  boxWhite: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>`
  )}`,
  fileWhite: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`
  )}`,
  shieldBadge: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#123a8f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`
  )}`,
  // "letter + checkmark" illustration, tinted to the report's violet/blue.
  envelope: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="120" viewBox="0 0 150 120" fill="none">
      <rect x="30" y="18" width="70" height="52" rx="4" fill="#ffffff" stroke="#d8ccff" stroke-width="2"/>
      <circle cx="46" cy="34" r="6" fill="#b7a4f4"/>
      <rect x="58" y="30" width="34" height="4" rx="2" fill="#e4dcfb"/>
      <rect x="58" y="40" width="28" height="4" rx="2" fill="#ece6fc"/>
      <rect x="58" y="50" width="32" height="4" rx="2" fill="#ece6fc"/>
      <path d="M18 52h114l-12 46a6 6 0 0 1-5.8 4.4H35.8A6 6 0 0 1 30 98z" fill="#7e73ef"/>
      <path d="M18 52l57 34 57-34" fill="#a99df3"/>
      <path d="M18 52l57 34 57-34" stroke="#5a44d4" stroke-width="2" fill="none"/>
      <circle cx="120" cy="86" r="15" fill="${V2_BLUE}"/>
      <path d="M113 86l5 5 9-10" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  )}`,
};

// A pill download button — solid fill, bulletproof for Outlook via VML.
function mailDownloadButton(file) {
  const format = String(file.format).toLowerCase();
  const label = `Download ${format.toUpperCase()}`;
  const url = escapeHtml(publicUrl(file.path, reportFileName(format)));
  const PALETTES = {
    pdf: [MAIL.violet, MAIL.violetDark],
    xlsx: [MAIL.teal, MAIL.tealDark],
    csv: [MAIL.green, MAIL.greenDark],
  };
  const [fill, stroke] = PALETTES[format] || [MAIL.blue, MAIL.blueDark];
  return `
    <td align="center" style="padding:0 8px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px;v-text-anchor:middle;width:200px;" arcsize="14%" strokecolor="${stroke}" fillcolor="${fill}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${url}" target="_blank" rel="noopener"
         style="display:block;width:200px;padding:15px 0;border-radius:10px;
                background:${fill};border:1px solid ${stroke};
                color:#ffffff;${SANS}font-size:15px;font-weight:700;
                text-decoration:none;text-align:center;">
        <img src="${MAIL_ICON.fileWhite}" width="15" height="15" alt="" style="vertical-align:-3px;margin-right:8px;border:0;"> ${label}
      </a>
      <!--<![endif]-->
    </td>`;
}

function emailHtml(report, details) {
  const count = details.rowCount || 0;
  const s = details.summary || { pass: 0, mismatch: 0, qrErr: 0 };
  const tz = details.timezone || DEFAULT_TIMEZONE;
  const nowTz = moment().tz(tz);
  const preheader = `${REPORT_DISPLAY_TITLE} — ${count} record${count === 1 ? "" : "s"} · ${s.pass} pass · ${s.mismatch} mismatch · ${details.label}`;
  const buttonRow = details.files.map(mailDownloadButton).join("");

  const chip = (color, text) =>
    `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${color}1a;border:1px solid ${color}40;${SANS}font-size:12px;font-weight:700;color:${color};">${escapeHtml(text)}</span>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(REPORT_DISPLAY_TITLE)}</title>
  <!--[if mso]><style>table,td,div,p,a{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${MAIL.paper};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MAIL.paper};">
    <tr>
      <td align="center" style="padding:28px 14px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px;max-width:100%;background:${MAIL.card};border-radius:16px;overflow:hidden;
                      border:1px solid ${MAIL.rule};box-shadow:0 10px 30px rgba(18,58,143,.10);">

          <!-- Header -->
          <tr>
            <td bgcolor="${MAIL.violet}" style="background:${MAIL.violet};background:linear-gradient(120deg,${MAIL.blue},${MAIL.violet});padding:26px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle">
                  <img src="${MAIL_ICON.shieldWhite}" width="24" height="24" alt="" style="vertical-align:-5px;border:0;">
                  <span style="${SANS}font-size:21px;font-weight:800;color:#ffffff;letter-spacing:.2px;margin-left:8px;">Videora<span style="font-weight:800;">IQ</span></span>
                </td>
                <td valign="middle" align="right">
                  <span style="${SANS}font-size:19px;font-weight:800;color:#ffffff;letter-spacing:.2px;">${escapeHtml(REPORT_DISPLAY_TITLE)}</span>
                  &nbsp;&nbsp;
                  <span style="display:inline-block;width:42px;height:42px;background:rgba(255,255,255,.16);border-radius:11px;vertical-align:middle;text-align:center;line-height:42px;">
                    <img src="${MAIL_ICON.rulerWhite}" width="19" height="19" alt="" style="vertical-align:-4px;border:0;">
                  </span>
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:30px 30px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="top">

                  <div style="${SANS}font-size:28px;font-weight:800;color:${MAIL.tx};line-height:1.15;">
                    ${escapeHtml(REPORT_DISPLAY_TITLE)}
                  </div>

                  <!-- meta line -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
                    <tr>
                      <td valign="middle" style="${SANS}font-size:14px;color:${MAIL.tx2};">
                        <img src="${MAIL_ICON.calendarViolet}" width="15" height="15" alt="" style="vertical-align:-2px;margin-right:6px;border:0;">${escapeHtml(details.label)}
                      </td>
                      <td valign="middle" style="padding:0 14px;color:${MAIL.rule};">|</td>
                      <td valign="middle" style="${SANS}font-size:14px;color:${MAIL.tx2};">
                        <img src="${MAIL_ICON.pinViolet}" width="15" height="15" alt="" style="vertical-align:-2px;margin-right:6px;border:0;">${escapeHtml(tz)}
                      </td>
                    </tr>
                  </table>

                  <!-- stat card -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL.panel}"
                         style="background:${MAIL.panel};border:1px solid ${MAIL.rule};border-radius:14px;margin-top:22px;">
                    <tr>
                      <td style="padding:20px 22px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                          <td valign="middle" width="52">
                            <span style="display:inline-block;width:46px;height:46px;background:linear-gradient(135deg,${MAIL.blue},${MAIL.violet});border-radius:12px;text-align:center;line-height:46px;">
                              <img src="${MAIL_ICON.boxWhite}" width="22" height="22" alt="" style="vertical-align:-5px;border:0;">
                            </span>
                          </td>
                          <td valign="middle" style="padding-left:16px;">
                            <span style="${SANS}font-size:24px;font-weight:800;color:${MAIL.tx};">${escapeHtml(String(count))}</span>
                            <span style="${SANS}font-size:15px;color:${MAIL.tx2};">&nbsp; measurement record${count === 1 ? "" : "s"} included.</span>
                          </td>
                        </tr></table>
                        <div style="margin-top:14px;">
                          ${chip(MAIL.green, `${s.pass} pass`)}
                          &nbsp;${chip("#e0564e", `${s.mismatch} mismatch`)}
                          &nbsp;${chip("#c98a1e", `${s.qrErr} QR error`)}
                        </div>
                      </td>
                    </tr>
                  </table>

                </td>
                <td valign="top" width="150" align="right" style="padding-left:14px;">
                  <img src="${MAIL_ICON.envelope}" width="150" height="120" alt="" style="border:0;display:block;max-width:150px;">
                </td>
              </tr></table>

              <!-- divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 20px;">
                <tr>
                  <td style="border-top:1px dashed ${MAIL.rule};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="150" align="center" style="${SANS}font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MAIL.tx3};white-space:nowrap;">Download Report</td>
                  <td style="border-top:1px dashed ${MAIL.rule};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- buttons -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 4px;">
                <tr>${buttonRow}</tr>
              </table>
              <div style="${SANS}font-size:11.5px;color:${MAIL.tx3};text-align:center;margin-top:8px;">
                The files are also attached to this email.
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="${MAIL.panel}" style="background:${MAIL.panel};padding:20px 30px;border-top:1px solid ${MAIL.rule};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="top" width="46">
                  <span style="display:inline-block;width:36px;height:36px;background:#ffffff;border:1px solid ${MAIL.rule};border-radius:50%;text-align:center;line-height:36px;">
                    <img src="${MAIL_ICON.shieldBadge}" width="18" height="18" alt="" style="vertical-align:-4px;border:0;">
                  </span>
                </td>
                <td valign="middle" style="padding-left:12px;${SANS}font-size:12.5px;line-height:1.6;color:${MAIL.tx3};">
                  This is an automated email. Please do not reply to this email.<br>
                  Generated automatically by <span style="color:${MAIL.navy};font-weight:700;">VideoraIQ</span> &#183; ${escapeHtml(nowTz.format("DD/MM/YYYY hh:mm A"))}.
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- accent bar -->
          <tr><td style="height:4px;font-size:0;line-height:0;background:${MAIL.violet};background:linear-gradient(90deg,${MAIL.blue},${MAIL.violet});">&nbsp;</td></tr>

        </table>

        <div style="${SANS}font-size:11px;color:${MAIL.tx3};margin-top:14px;">
          VideoraIQ &#183; Smart Surveillance Powered by AI
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const HISTORY_LIMIT = 50;

async function recordDelivery(report, { period, rowCount, recipients, files }) {
  await Report.updateOne(
    { _id: report._id },
    {
      $push: {
        history: {
          $each: [{ sentAt: new Date(), period, rowCount, recipients, files }],
          $position: 0,
          $slice: HISTORY_LIMIT,
        },
      },
    },
  );
}

// The `reportType` preset is the single content selector:
//   full → every record · pass / mismatch / qrerror → only that result.
const REPORT_TYPE_FILTER = {
  pass: (r) => r.result === "Pass",
  mismatch: (r) => r.result === "Mismatch",
  qrerror: (r) => r.result === "QR Error",
};

async function deliver(report, options = {}) {
  const timezone = reportTimezone(report);
  const { rows, label } = await fetchMeasurementRows(report, timezone);

  const typeFilter = REPORT_TYPE_FILTER[report.reportType];
  const effectiveRows = typeFilter ? rows.filter(typeFilter) : rows;

  const withSnaps = report.includeSnapshots !== false;
  const buffers = {};
  if (report.formats.includes("pdf")) buffers.pdf = await buildPdf({ rows: effectiveRows, label, withSnaps });
  if (report.formats.includes("xlsx")) buffers.xlsx = await buildXlsx({ rows: effectiveRows, label, withSnaps });
  if (report.formats.includes("csv")) buffers.csv = buildCsv({ rows: effectiveRows, label, withSnaps });

  const files = await uploadFiles(report, buffers);
  const details = {
    label,
    rowCount: effectiveRows.length,
    files,
    timezone,
    summary: summariseRows(effectiveRows),
  };

  const recipients = options.recipients?.length ? options.recipients : report.recipients;
  // Subject is built entirely here — no user template. A daily report is dated
  // with the single day it covers (today); every other frequency shows the
  // from–to window it spans.
  const subject =
    report.schedule.frequency === "daily"
      ? `Mattress QC Report — ${moment().tz(timezone).format("DD MMM YYYY")}`
      : `Mattress QC Report — ${label}`;

  const email = {
    from: { name: config.get("sendgrid.name"), email: config.get("sendgrid.email") },
    to: recipients,
    subject: `[QC Report] ${subject}`,
    html: emailHtml(report, details),
    attachments: files
      .map((f) => buffers[f.format] && {
        content: buffers[f.format].toString("base64"),
        filename: `qc-measurement-${moment().format("YYYY-MM-DD")}.${f.format}`,
        type:
          f.format === "pdf"
            ? "application/pdf"
            : f.format === "csv"
              ? "text/csv"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: "attachment",
      })
      .filter(Boolean),
  };

  sendGridMail.setApiKey(config.get("sendgrid.key"));
  try {
    const sendStatus = await sendGridMail.send(email);
    await trackOutboundEmail(email, sendStatus, { adminId: report.adminId, category: "Measurement report" });
    await recordDelivery(report, { period: label, rowCount: details.rowCount, recipients, files });
    return details;
  } catch (error) {
    const detail = error?.response?.body?.errors?.map((i) => i.message).filter(Boolean).join("; ");
    if (detail) error.message = `${error.message}: ${detail}`;
    logger.error(`[MEASUREMENT_AUTO_EMAIL_REPORT] SendGrid rejected send (report=${report._id}): ${error.message}`);
    await trackFailedEmail(email, error, { adminId: report.adminId, category: "Measurement report" });
    throw error;
  }
}

function dueKey(report, now = moment()) {
  const timezone = reportTimezone(report);
  const local = now.clone().tz(timezone);
  const [hour, minute] = (report.schedule.time || "07:00").split(":").map(Number);
  if (local.hour() < hour || (local.hour() === hour && local.minute() < minute)) return null;
  const dateKey = local.format("YYYY-MM-DD");
  if (report.schedule.frequency === "daily") return `daily:${dateKey}`;
  if (report.schedule.frequency === "weekly") return local.day() === report.schedule.weekday ? `weekly:${dateKey}` : null;
  if (report.schedule.frequency === "monthly") return local.date() === report.schedule.dayOfMonth ? `monthly:${dateKey}` : null;
  const sendDate = moment(report.schedule.endDate).tz(timezone).add(1, "day").format("YYYY-MM-DD");
  return dateKey >= sendDate ? `custom:${report._id}` : null;
}

/* ─────────────── controller surface ─────────────── */

class MeasurementAutoEmailReportService {
  async create(req, res) {
    try {
      const adminId = adminIdFrom(req);
      if (!adminId) return res.status(401).json(Response.userFailResp("Authentication context is missing"));
      const { value, error } = createReportSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
      if (error) {
        return res.status(400).json(
          Response.validationFailResp("Validation failed", error.details.map((d) => d.message).join(", ")),
        );
      }
      const timezone = await savedAdminTimezone(adminId);
      const { sendTestMail, ...data } = value;
      data.timezone = timezone;
      data.schedule = normalizeSchedule(data.schedule);
      const report = await Report.create({
        ...data,
        adminId,
        createdBy: req.verified?.userData?.memberId || null,
      });

      let testMailError = null;
      if (sendTestMail) {
        try {
          await deliver(report);
        } catch (e) {
          testMailError = e.message;
        }
      }
      return res.status(201).json(
        Response.userSuccessResp(
          testMailError ? "Schedule created, but the test mail failed" : "Schedule created",
          { ...report.toObject(), testMailError },
        ),
      );
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json(Response.validationFailResp("A schedule with this title already exists"));
      }
      logger.error(`[MEASUREMENT_AUTO_EMAIL_REPORT] Create failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to create schedule", error.message));
    }
  }

  async list(req, res) {
    try {
      const adminId = adminIdFrom(req);
      const page = Math.max(parseInt(req.query.page || "1", 10), 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 100);
      const search = String(req.query.search || "").trim();
      const query = { adminId };

      // Search by schedule title OR a recipient email (case-insensitive).
      if (search) {
        const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        query.$or = [{ title: rx }, { recipients: rx }];
      }
      // status filter: active | paused
      if (req.query.status === "active") query.enabled = true;
      else if (req.query.status === "paused") query.enabled = false;
      // frequency filter: daily | weekly | monthly | custom
      if (["daily", "weekly", "monthly", "custom"].includes(req.query.frequency)) {
        query["schedule.frequency"] = req.query.frequency;
      }
      // reportType filter: full | summary | mismatch | qrerror
      if (["full", "pass", "mismatch", "qrerror"].includes(req.query.reportType)) {
        query.reportType = req.query.reportType;
      }

      const [reports, total] = await Promise.all([
        Report.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Report.countDocuments(query),
      ]);
      return res.json(Response.userSuccessResp("Schedules fetched", { reports, total, page, limit }));
    } catch (error) {
      return res.status(500).json(Response.errorResp("Failed to fetch schedules", error.message));
    }
  }

  async formOptions(req, res) {
    try {
      const adminId = adminIdFrom(req);
      const [recipients, stationIds] = await Promise.all([
        Recipient.find({ adminId, type: "email", verified: true })
          .select("value fullName")
          .sort({ value: 1 })
          .lean(),
        MeasurementIncident.distinct("stationId", { adminId: String(adminId) }),
      ]);
      const stations = [
        ...new Set(stationIds.filter(Boolean).map(stationLabel)),
      ].sort();
      return res.json(
        Response.userSuccessResp("Schedule form options fetched", {
          recipients: recipients.map((r) => ({ email: r.value, name: r.fullName || null })),
          stations: stations.length ? stations : ["L1-QC-01", "L2-QC-01", "L3-QC-01"],
        }),
      );
    } catch (error) {
      return res.status(500).json(Response.errorResp("Failed to fetch form options", error.message));
    }
  }

  async getById(req, res) {
    try {
      const report = await Report.findOne({ _id: req.params.id, adminId: adminIdFrom(req) }).lean();
      if (!report) return res.status(404).json(Response.notFoundResp("Schedule not found"));
      return res.json(Response.userSuccessResp("Schedule fetched", report));
    } catch (error) {
      return res.status(400).json(Response.validationFailResp("Invalid schedule id", error.message));
    }
  }

  async update(req, res) {
    try {
      const { value, error } = updateReportSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
      if (error) {
        return res.status(400).json(
          Response.validationFailResp("Validation failed", error.details.map((d) => d.message).join(", ")),
        );
      }
      const current = await Report.findOne({ _id: req.params.id, adminId: adminIdFrom(req) });
      if (!current) return res.status(404).json(Response.notFoundResp("Schedule not found"));
      const { sendTestMail, ...data } = value;
      if (data.schedule) data.schedule = normalizeSchedule(data.schedule);
      Object.assign(current, data, { lastRunKey: null });
      await current.save();

      let testMailError = null;
      if (sendTestMail) {
        try {
          await deliver(current);
        } catch (e) {
          testMailError = e.message;
        }
      }
      return res.json(
        Response.userSuccessResp(
          testMailError ? "Schedule updated, but the test mail failed" : "Schedule updated",
          { ...current.toObject(), testMailError },
        ),
      );
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json(Response.validationFailResp("A schedule with this title already exists"));
      }
      return res.status(400).json(Response.validationFailResp("Failed to update schedule", error.message));
    }
  }

  async remove(req, res) {
    try {
      const report = await Report.findOneAndDelete({ _id: req.params.id, adminId: adminIdFrom(req) });
      if (!report) return res.status(404).json(Response.notFoundResp("Schedule not found"));
      return res.json(Response.userSuccessResp("Schedule deleted", report));
    } catch (error) {
      return res.status(400).json(Response.validationFailResp("Invalid schedule id", error.message));
    }
  }

  async sendNow(req, res) {
    try {
      const report = await Report.findOne({ _id: req.params.id, adminId: adminIdFrom(req) });
      if (!report) return res.status(404).json(Response.notFoundResp("Schedule not found"));
      const recipients = req.body?.recipients;
      if (recipients) {
        const { error } = Joi.array().items(Joi.string().email()).min(1).validate(recipients);
        if (error) return res.status(400).json(Response.validationFailResp("Validation failed", error.message));
      }
      const details = await deliver(report, { recipients });
      return res.json(
        Response.userSuccessResp("Report sent", {
          recipients: recipients?.length ? recipients : report.recipients,
          recordCount: details.rowCount,
          period: details.label,
          files: details.files.map((f) => ({
            format: f.format,
            url: publicUrl(f.path, reportFileName(f.format)),
          })),
        }),
      );
    } catch (error) {
      logger.error(`[MEASUREMENT_AUTO_EMAIL_REPORT] Send failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to send report", error.message));
    }
  }

  async runDueReports() {
    if (runnerBusy) return;
    runnerBusy = true;
    try {
      const reports = await Report.find({ enabled: true })
        .select("_id timezone schedule lastRunKey")
        .lean();
      for (const candidate of reports) {
        const key = dueKey(candidate);
        if (!key || candidate.lastRunKey === key) continue;
        const report = await Report.findOneAndUpdate(
          { _id: candidate._id, enabled: true, lastRunKey: { $ne: key } },
          { $set: { lastRunKey: key } },
          { new: true },
        );
        if (!report) continue;
        try {
          await deliver(report);
          const update = { lastSentAt: new Date(), lastError: null };
          if (report.schedule.frequency === "custom") update.enabled = false;
          await Report.updateOne({ _id: report._id }, { $set: update });
        } catch (error) {
          await Report.updateOne({ _id: report._id }, { $set: { lastRunKey: null, lastError: error.message } });
          logger.error(`[MEASUREMENT_AUTO_EMAIL_REPORT] Scheduled send failed for ${report._id}: ${error.message}`);
        }
      }
    } finally {
      runnerBusy = false;
    }
  }

  startRunner() {
    if (runner) return;
    const execute = () =>
      this.runDueReports().catch((error) =>
        logger.error(`[MEASUREMENT_AUTO_EMAIL_REPORT] Scheduler failed: ${error.message}`),
      );
    execute();
    runner = setInterval(execute, 60 * 1000);
    runner.unref?.();
    logger.info("Measurement auto email report scheduler started");
  }
}

export default new MeasurementAutoEmailReportService();
export { deliver, dueKey, buildCsv, normalizeSchedule };
