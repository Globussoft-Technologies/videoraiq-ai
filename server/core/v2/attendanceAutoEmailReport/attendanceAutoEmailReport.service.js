import axios from "axios";
import PDFDocument from "pdfkit";
import moment from "moment-timezone";
import mongoose from "mongoose";
import sendGridMail from "@sendgrid/mail";
import config from "config";
import Joi from "joi";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { putMedia } from "../../../utils/mediaStorage.js";
import Attendance from "../attendance/attendance.model.js";
import AttendanceSettings from "../attendance/attendanceSettings.model.js";
import AuthorizedUsers from "../authorizedUsers/authorizedUsers.model.js";
import Department from "../departments/departments.model.js";
import Admin from "../admin/admin.model.js";
import Report from "./attendanceAutoEmailReport.model.js";
import { createReportSchema, updateReportSchema } from "./attendanceAutoEmailReport.validation.js";
import { trackFailedEmail, trackOutboundEmail } from "../emailMonitoring/emailTracker.js";

const LOGO_URL = "https://stagingv2.videoraiq.com/src/assets/videoraiq-logo-color.png";
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const V2_BLUE = "#609ff7";
const V2_PURPLE = "#9274f5";
let runner = null;
let runnerBusy = false;

function adminIdFrom(req) {
  return req?.verified?.userData?.adminId;
}

function validTimezone(value) {
  try {
    // Intl resolves to its own canonical alias (e.g. Asia/Kolkata -> Asia/Calcutta),
    // which reads oddly to admins who picked the modern name. Keep the value they
    // selected as long as it's a recognised zone.
    Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
    return value;
  } catch {
    return null;
  }
}

function asObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(id);
}

function reportTimezone(report) {
  return validTimezone(report.timezone) || DEFAULT_TIMEZONE;
}

async function savedAdminTimezone(adminId) {
  const admin = await Admin.findById(adminId).select("timezone").lean();
  return validTimezone(admin?.timezone) || null;
}

function minutesToHms(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return "00:00:00";
  const total = Math.round(minutes * 60); // whole seconds
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function spanMinutes(firstCheckIn, lastCheckOut) {
  if (!firstCheckIn || !lastCheckOut) return null;
  const minutes = (new Date(lastCheckOut) - new Date(firstCheckIn)) / 60000;
  return minutes >= 0 ? minutes : null;
}

// "Total Working Hrs (Day)" as the Attendance Logs table computes it
// (`minutesSpent` in attendanceStatus.js): last check-out − first check-in,
// rounded to whole minutes, floored at 0. It is the elapsed span and does NOT
// subtract breaks — the Break column is shown alongside, not deducted. Missing
// either end → 0.
function workingMinutesForDay(firstCheckIn, lastCheckOut) {
  if (!firstCheckIn || !lastCheckOut) return 0;
  const minutes = (new Date(lastCheckOut) - new Date(firstCheckIn)) / 60000;
  return Math.max(0, Math.round(minutes));
}

// Human-readable duration for the "Total Working Hours for the period selected"
// column. Under 24h it stays HH:MM:SS (unchanged from before); at or above 24h
// it breaks into the largest non-zero units — months / days / hours / minutes —
// so a period total like 223h reads "9d 7h 40m" instead of "223:51:29".
// A "month" here is a flat 30 days purely for a compact label; the exact value
// is always still recoverable from the per-day rows.
function formatPeriodDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "00:00:00";
  if (minutes < 24 * 60) return minutesToHms(minutes);

  const totalMinutes = Math.round(minutes);
  const MIN_PER_HOUR = 60;
  const MIN_PER_DAY = 24 * MIN_PER_HOUR;
  const MIN_PER_MONTH = 30 * MIN_PER_DAY;
  const MIN_PER_YEAR = 365 * MIN_PER_DAY;

  const years = Math.floor(totalMinutes / MIN_PER_YEAR);
  let rest = totalMinutes - years * MIN_PER_YEAR;
  const months = Math.floor(rest / MIN_PER_MONTH);
  rest -= months * MIN_PER_MONTH;
  const days = Math.floor(rest / MIN_PER_DAY);
  rest -= days * MIN_PER_DAY;
  const hours = Math.floor(rest / MIN_PER_HOUR);
  const mins = rest - hours * MIN_PER_HOUR;

  const parts = [];
  if (years) parts.push(`${years}y`);
  if (months) parts.push(`${months}mo`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  // Show the three largest non-zero units — enough precision for a period
  // total without turning into a long string.
  return parts.slice(0, 3).join(" ") || "00:00:00";
}

function eventCamera(event) {
  return event?.channel?.customName || event?.channel?.name || "-";
}

// Pair sequential checkout→checkin events into breaks for one day's events.
// Byte-for-byte the same algorithm as pairBreaks in attendance.service.js so
// the break total here always matches the Attendance Logs table and the Break
// Logs dialog: a checkout only opens a break after the first check-in
// (`hasCheckedIn`), and the last check-out is a bookend, never a break.
function pairBreaks(events) {
  const sorted = [...(events || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const pairs = [];
  let currentCheckout = null;
  let hasCheckedIn = false;
  for (const event of sorted) {
    if (event.cameraType === "checkin") {
      if (currentCheckout) {
        pairs.push({ checkout: currentCheckout, checkin: event });
        currentCheckout = null;
      }
      hasCheckedIn = true;
    } else if (hasCheckedIn && !currentCheckout && event.cameraType === "checkout") {
      currentCheckout = event;
    }
  }
  return pairs;
}

// Total break minutes — each (checkin − checkout) gap rounded to whole minutes
// and floored at 0, exactly like breakMinutesFromPairs in attendance.service.js.
function breakMinutesFromPairs(pairs) {
  return pairs.reduce((sum, pair) => {
    const ms = new Date(pair.checkin.timestamp) - new Date(pair.checkout.timestamp);
    return sum + (ms > 0 ? Math.round(ms / 60000) : 0);
  }, 0);
}

function checkInImageUrl(event) {
  const images = event?.images;
  // Prefer the full camera frame (whole scene, highest resolution), then the
  // person bounding box, then the tight face crop as a last resort — the face
  // crop is tiny and low-res on its own.
  const mediaPath = images?.frame || images?.person || images?.face;
  if (!mediaPath) return "-";
  const base = config.get("ImageView");
  return `${base}${mediaPath.startsWith("/") ? "" : "/"}${mediaPath}`;
}

// Clock time only (e.g. "10:31:07 PM"), matching the per-session rows in the
// spreadsheet layout.
function formatClock(value, timezone) {
  return value ? moment(value).tz(timezone).format("hh:mm:ss A") : "-";
}

function cleanDate(value, timezone) {
  if (!value) return null;
  const dateText = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return moment.tz(dateText, "YYYY-MM-DD", true, timezone).startOf("day");
}

function normalizeSchedule(schedule, timezone) {
  if (schedule.frequency !== "custom") return schedule;
  return {
    ...schedule,
    startDate: cleanDate(schedule.startDate, timezone)?.toDate(),
    endDate: cleanDate(schedule.endDate, timezone)?.toDate(),
  };
}

function rangeForReport(report, reference = moment()) {
  const timezone = reportTimezone(report);
  const now = reference.clone().tz(timezone);
  const { frequency, startDate, endDate } = report.schedule;
  let start;
  let end;

  if (frequency === "daily") {
    end = now.clone().subtract(1, "day").endOf("day");
    start = end.clone().startOf("day");
  } else if (frequency === "weekly") {
    end = now.clone().subtract(1, "day").endOf("day");
    start = end.clone().subtract(6, "days").startOf("day");
  } else if (frequency === "monthly") {
    end = now.clone().subtract(1, "month").endOf("month");
    start = end.clone().startOf("month");
  } else {
    start = moment(startDate).tz(timezone).startOf("day");
    end = moment(endDate).tz(timezone).endOf("day");
  }

  return { timezone, start, end, label: `${start.format("DD MMM YYYY")} – ${end.format("DD MMM YYYY")}` };
}

function statusForRow(row, rules) {
  if (!row.firstCheckIn) return "Absent";
  if (!row.lastCheckOut) return "Checked In";
  const minutes = Math.max(0, (new Date(row.lastCheckOut) - new Date(row.firstCheckIn)) / 60000);
  if (minutes >= rules.fullDayHours * 60) return "Present";
  if (minutes >= rules.halfDayHours * 60) return "Half Day";
  return "Absent";
}

// Employee records can carry junk instead of a real value — the literal
// string "null" (from a bad import/migration) or a bare country code with no
// actual subscriber number (e.g. "91"). Both are truthy so `value || "-"`
// lets them through; treat them as missing too.
function cleanField(value, { minDigits = 0 } = {}) {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return "-";
  if (minDigits && /^\d+$/.test(text) && text.length < minDigits) return "-";
  return text;
}

function csvCell(value) {
  const string = String(value ?? "");
  return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

async function logoBuffer() {
  try {
    const response = await axios.get(LOGO_URL, { responseType: "arraybuffer", timeout: 7000 });
    return Buffer.from(response.data);
  } catch (error) {
    logger.warn(`[ATTENDANCE_AUTO_EMAIL_REPORT] Logo unavailable: ${error.message}`);
    return null;
  }
}

export function rowFromAttendance(item, timezone, rules) {
  const events = [...(item.events || [])].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  const checkins = events.filter((event) => event.cameraType === "checkin");
  const checkouts = events.filter((event) => event.cameraType === "checkout");
  const firstCheckIn = checkins[0] || null;
  const lastCheckOut = checkouts.at(-1) || null;
  const employee = item.employee || {};

  // Computed exactly as the Attendance Logs table does:
  //   - Total Working Hrs (Day)  = last check-out − first check-in  (elapsed
  //     span, whole minutes, floored at 0 — `minutesSpent` in
  //     attendanceStatus.js). Breaks are NOT subtracted; the Break column is
  //     shown alongside, not deducted.
  //   - Total Break Hrs (Day)    = Σ (checkin − checkout) gaps  (pairBreaks +
  //     breakMinutesFromPairs), per-pair rounding.
  //   - Duration is the same span to whole-second precision.
  // Matches how the Attendance Logs card shows one "TIME" figure plus a
  // separate "BREAK" figure.
  const breakMinutes = breakMinutesFromPairs(pairBreaks(events));
  const workingMinutesDay = workingMinutesForDay(firstCheckIn?.timestamp, lastCheckOut?.timestamp);
  const grossMinutes = spanMinutes(firstCheckIn?.timestamp, lastCheckOut?.timestamp);

  const row = {
    date: moment(item.createdAt).tz(timezone).format("DD MMM YYYY"),
    employeeKey: String(employee._id || employee.emp_id || ""),
    employeeId: cleanField(employee.emp_id),
    employee: `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || "Unknown employee",
    email: cleanField(employee.email),
    // A phone number under 8 digits is just a stray country code (e.g.
    // "91") left over with no actual subscriber number attached.
    phone: cleanField(employee.phoneNumber, { minDigits: 8 }),
    designation: cleanField(employee.designation),
    branch: cleanField(employee.branch),
    department: cleanField(employee.departmentId?.departmentName),
    location: cleanField(employee.location),
    // First check-in and last check-out for the day (matches the previous export).
    checkIn: firstCheckIn ? formatClock(firstCheckIn.timestamp, timezone) : "-",
    checkOut: lastCheckOut ? formatClock(lastCheckOut.timestamp, timezone) : "-",
    duration: grossMinutes === null ? "-" : minutesToHms(grossMinutes),
    workingHoursDay: minutesToHms(workingMinutesDay),
    breakHoursDay: minutesToHms(breakMinutes),
    // Filled in by applyPeriodTotals once every day for this employee has been read.
    workingHoursPeriod: "00:00:00",
    // Per-employee period total sums this (the elapsed-span working minutes),
    // matching the Attendance Logs definition.
    workingMinutesDay: workingMinutesDay,
    checkInCount: checkins.length,
    checkOutCount: checkouts.length,
    checkInCamera: eventCamera(firstCheckIn),
    checkOutCamera: eventCamera(lastCheckOut),
    viewImage: firstCheckIn ? checkInImageUrl(firstCheckIn) : "-",
    status: "",
  };
  row.status = statusForRow({ firstCheckIn: firstCheckIn?.timestamp, lastCheckOut: lastCheckOut?.timestamp }, rules);
  return row;
}

function attendanceQuery(report, start, end) {
  const query = {
    user: asObjectId(report.adminId),
    createdAt: { $gte: start.toDate(), $lte: end.toDate() },
  };
  return query;
}

async function applyTargetScope(query, target) {
  if (target.scope === "employees") {
    query.employee = { $in: target.employeeIds.map(asObjectId) };
  } else if (target.scope === "departments") {
    const employees = await AuthorizedUsers.find({
      adminId: query.user,
      departmentId: { $in: target.departmentIds.map(asObjectId) },
    }).distinct("_id");
    query.employee = { $in: employees };
  }
  return query;
}

// A year of attendance for a large org can be hundreds of thousands of
// documents. Loading them into one array with .find().lean() holds every
// document (plus its populated employee/channel subdocs) in memory at once,
// which is what made large custom-range reports slow/OOM-prone. A cursor
// processes one document at a time — memory stays flat regardless of range.
const CURSOR_BATCH_SIZE = 500;

/**
 * Streams attendance rows for a report, converting each raw document to a
 * report row via `onRow` as it's read rather than materializing the whole
 * result set. Returns summary info ({ timezone, start, end, label, rowCount }).
 */
async function streamReportRows(report, reference, onRow) {
  const { timezone, start, end, label } = rangeForReport(report, reference);
  const target = report.target || {};
  const query = await applyTargetScope(attendanceQuery(report, start, end), target);

  const settings = await AttendanceSettings.findOne({ adminId: report.adminId }).lean();
  const rules = { fullDayHours: settings?.fullDayHours || 8, halfDayHours: settings?.halfDayHours || 4 };

  const cursor = Attendance.find(query)
    .populate({ path: "employee", populate: { path: "departmentId", select: "departmentName" } })
    .populate({ path: "events.channel", select: "name customName" })
    .sort({ createdAt: 1 })
    .batchSize(CURSOR_BATCH_SIZE)
    .lean()
    .cursor();

  let rowCount = 0;
  for await (const item of cursor) {
    // The Attendance Logs UI joins employee via an aggregation $lookup +
    // $unwind (no preserveNullAndEmptyArrays), which drops any record whose
    // employee reference doesn't resolve — e.g. a deleted employee, or an
    // unauthorized/unrecognised detection with no linked employee. .populate()
    // instead leaves `employee` null for those, so without this filter the
    // exported report includes "Unknown employee" rows the UI never shows.
    if (!item.employee) continue;
    onRow(rowFromAttendance(item, timezone, rules));
    rowCount += 1;
  }

  return { timezone, start, end, label, rowCount, rules };
}

// "Total Working Hours for the period selected" = per-employee sum of Total
// Working Hrs (Day) — i.e. of the elapsed check-in→check-out spans, the same
// figure the Attendance Logs table sums — across every day in the report
// range. Fillable only once all rows are collected. Mutates rows in place.
export function applyPeriodTotals(rows) {
  const totals = new Map();
  for (const row of rows) {
    totals.set(row.employeeKey, (totals.get(row.employeeKey) || 0) + (row.workingMinutesDay || 0));
  }
  for (const row of rows) {
    const periodMinutes = totals.get(row.employeeKey) || 0;
    row.workingMinutesPeriod = periodMinutes;
    // HH:MM:SS under 24h, else a compact "9d 7h 40m" style breakdown.
    row.workingHoursPeriod = formatPeriodDuration(periodMinutes);
  }
  return rows;
}

async function reportRows(report, reference) {
  const rows = [];
  const { timezone, label } = await streamReportRows(report, reference, (row) => rows.push(row));
  applyPeriodTotals(rows);
  // Drop internal accumulation fields before the rows go out over the preview API.
  const cleanRows = rows.map(({ employeeKey, workingMinutesDay, workingMinutesPeriod, ...rest }) => rest);
  return { rows: cleanRows, timezone, label };
}

// One flat row per employee-day, in the exact order/labels the admins asked
// for. The image cell is `{ text, link }` when a snapshot link exists.
const REPORT_HEADERS = [
  "ID",
  "Name",
  "Department",
  "Date",
  "Location",
  "Check in",
  "Check out",
  "Duration",
  "Total Working Hours for the Day",
  "Total Break Hours for the Day",
  "Total Working Hours for the period selected",
  "Checkin Camera",
  "Checkout Camera",
  "View Image",
];

function imageCell(url) {
  return url && url !== "-" ? { text: "View Image", link: url } : "-";
}

// One flat table row per employee-day — first check-in, last check-out, and all
// the day/period totals on the same line. No per-session sub-rows.
// Column positions line up with REPORT_HEADERS.
function cellsForReportRow(row, displayIndex) {
  return [
    String(displayIndex),
    row.employee,
    row.department,
    row.date,
    row.location,
    row.checkIn,   // first check-in of the day
    row.checkOut,  // last check-out of the day
    row.duration,
    row.workingHoursDay,
    row.breakHoursDay,
    row.workingHoursPeriod,
    row.checkInCamera,
    row.checkOutCamera,
    imageCell(row.viewImage),
  ];
}

// One row per employee-day (values line up with REPORT_HEADERS).
export function reportTableRows(rows) {
  return rows.map((row, index) => cellsForReportRow(row, index + 1));
}

// Renders one CSV field. An image cell arrives as { text, link } and is written
// as an Excel/Sheets/LibreOffice HYPERLINK formula so the "View Image" label
// shows instead of the raw path and stays clickable. The formula itself
// contains a comma and quotes, so it must be CSV-quoted here (inner quotes
// doubled) \u2014 spreadsheets un-double and evaluate it on import. Because the
// quoting is done here, this field is returned already-escaped and buildCsv
// must NOT pass it through csvCell() a second time.
function csvField(value) {
  if (value && typeof value === "object") {
    if (value.link) {
      // Strip characters that would break out of the formula string.
      const url = String(value.link).replace(/["\r\n]/g, "");
      const text = String(value.text || "View Image").replace(/["\r\n]/g, "");
      const formula = `=HYPERLINK("${url}","${text}")`;
      return `"${formula.replaceAll('"', '""')}"`;
    }
    return csvCell(value.text || "");
  }
  return csvCell(value);
}

export function buildCsv({ report, rows, label, timezone }) {
  const meta = [
    ["VideoraIQ Attendance Report"],
    ["Report", report.title],
    ["Period", label],
    ["Timezone", timezone],
    [],
    REPORT_HEADERS,
  ].map((line) => line.map(csvCell).join(","));
  const body = reportTableRows(rows).map((line) => line.map(csvField).join(","));
  return Buffer.from(`\uFEFF${[...meta, ...body].join("\r\n")}`, "utf8");
}

export async function buildPdf({ report, rows, label, timezone }) {
  const logo = await logoBuffer();
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A3", layout: "landscape", margin: 32 });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    // document.image() only dedupes by its internal registry when given a
    // string path — a raw Buffer is re-decoded and re-embedded as a brand new
    // XObject on every call (PDFKit's images mixin only populates
    // _imageRegistry for string sources). drawHeader() below runs once per
    // page, so passing the raw `logo` buffer there embedded this ~230KB PNG
    // separately on every page — a 1716-row/86-page report reached ~19.7MB
    // from the logo alone. Opening it once via openImage() and reusing that
    // PDFImage object (which document.image() accepts as an already-embedded
    // image, skipping openImage entirely) embeds the logo exactly once.
    const logoImage = logo ? document.openImage(logo) : null;

    const pageWidth = document.page.width - 64;
    // Widths sum to ~1096pt, within the A3-landscape usable width (~1127pt).
    // Headings and order line up with REPORT_HEADERS / cellsForReportRow.
    // `wrap: true` columns hold free text (name, department, camera, location)
    // and are rendered on multiple lines instead of being truncated — the
    // camera and department columns are given enough width to show the full
    // name rather than an ellipsis. The rest are fixed-format:
    //   - time columns fit "09:45:40 AM"
    //   - Date fits "01 Jun 2026"
    const columns = [
      { head: "ID", width: 24 },
      { head: "Name", width: 104, wrap: true },
      { head: "Department", width: 118, wrap: true },
      { head: "Date", width: 60 },
      { head: "Location", width: 78, wrap: true },
      { head: "Check in", width: 66 },
      { head: "Check out", width: 66 },
      { head: "Duration", width: 50 },
      { head: "Total Working Hrs (Day)", width: 70 },
      { head: "Total Break Hrs (Day)", width: 68 },
      { head: "Total Working Hrs (Period)", width: 84 },
      { head: "Checkin Camera", width: 128, wrap: true },
      { head: "Checkout Camera", width: 128, wrap: true },
      { head: "View Image", width: 52 },
    ];
    const drawHeader = () => {
      const titleBlockWidth = 300;
      const purpleX = document.page.width - titleBlockWidth;
      document.rect(0, 0, document.page.width, 102).fill(V2_BLUE);
      document.rect(purpleX, 0, titleBlockWidth, 102).fill(V2_PURPLE);
      if (logoImage) document.image(logoImage, 36, 25, { fit: [145, 48] });
      document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("Attendance Report", purpleX, 29, { width: titleBlockWidth - 32, align: "right" });
      document.font("Helvetica").fontSize(9).text(report.title, purpleX, 57, { width: titleBlockWidth - 32, align: "right" });
      document.fillColor("#273657").font("Helvetica-Bold").fontSize(13).text(label, 32, 122);
      document.font("Helvetica").fontSize(9).fillColor("#61708f").text(`Timezone: ${timezone}  •  ${rows.length} attendance record${rows.length === 1 ? "" : "s"}`, 32, 142);
    };
    const drawTableHeader = (y) => {
      let x = 32;
      // Solid dark blue bar with white text — deliberately unlike any data row
      // (white / pale-blue zebra), so the header never blends into the first row.
      document.fillColor("#173b83").rect(x, y, pageWidth, 34).fill();
      document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
      for (const { head, width } of columns) {
        document.text(head, x + 4, y + 5, { width: width - 8, height: 26, lineBreak: true });
        x += width;
      }
      return y + 34;
    };

    const PAD_X = 4;
    const LINE_H = 9;
    const V_PAD = 6;

    const lineHeight = (line) => {
      let maxLines = 1;
      line.forEach((value, columnIndex) => {
        const col = columns[columnIndex];
        if (!col.wrap) return;
        const text = value && typeof value === "object" ? value.text : String(value ?? "");
        if (!text || text === "-") return;
        maxLines = Math.max(maxLines, document.heightOfString(text, { width: col.width - PAD_X * 2 }) / LINE_H);
      });
      return Math.ceil(maxLines) * LINE_H + V_PAD * 2;
    };
    const drawLine = (line, shade) => {
      document.font("Helvetica").fontSize(8);
      const height = lineHeight(line);
      if (shade) document.fillColor("#eef2fb").rect(32, y, pageWidth, height).fill();
      let x = 32;
      line.forEach((value, columnIndex) => {
        const col = columns[columnIndex];
        const opts = { width: col.width - PAD_X * 2, lineBreak: Boolean(col.wrap) };
        if (!col.wrap) opts.ellipsis = true;
        if (value && typeof value === "object") {
          document.fillColor(V2_BLUE).text(value.text, x + PAD_X, y + V_PAD, { ...opts, link: value.link, underline: true });
        } else if (value !== "" && value != null) {
          document.fillColor("#2e3b55").text(String(value), x + PAD_X, y + V_PAD, opts);
        }
        x += col.width;
      });
      document.strokeColor("#e6ecf7").lineWidth(0.4).moveTo(32, y + height).lineTo(32 + pageWidth, y + height).stroke();
      y += height;
    };

    drawHeader();
    let y = drawTableHeader(165);
    // One line per employee-day, zebra-striped.
    reportTableRows(rows).forEach((line, index) => {
      const pageBottom = document.page.height - 40;
      if (y + lineHeight(line) > pageBottom) {
        document.addPage({ size: "A3", layout: "landscape", margin: 32 });
        drawHeader();
        y = drawTableHeader(165);
      }
      drawLine(line, index % 2 === 1);
    });
    if (!rows.length) document.font("Helvetica").fontSize(12).fillColor("#61708f").text("No attendance records were found for this period.", 32, y + 24);
    document.end();
  });
}

function emailHtml(report, details) {
  const links = details.files
    .map((file) => `<a href="${file.url}" style="color:#173b83;font-weight:600" target="_blank" rel="noopener">Download ${file.format.toUpperCase()}</a>`)
    .join(" &nbsp;•&nbsp; ");
  return `<div style="font-family:Arial,sans-serif;background:#f5f8ff;padding:28px;color:#273657">
    <div style="max-width:700px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e3eafb">
      <div style="padding:22px 28px;background:linear-gradient(110deg,${V2_BLUE},${V2_PURPLE});color:#fff"><img src="${LOGO_URL}" alt="VideoraIQ" style="max-height:34px;max-width:140px;vertical-align:middle"><span style="float:right;font-size:18px;font-weight:700;margin-top:7px">Attendance Report</span></div>
      <div style="padding:28px"><h2 style="margin:0 0 10px;color:#173b83">${report.title}</h2><p style="margin:0 0 18px;color:#61708f">${details.label} · ${details.timezone}</p>
      <div style="padding:16px;border-radius:8px;background:#eef5ff;color:#173b83"><strong>${details.rowCount}</strong> employee attendance record${details.rowCount === 1 ? "" : "s"} included.</div>
      <div style="margin-top:18px;padding:16px;border-radius:8px;border:1px solid #e3eafb;text-align:center">${links}</div>
      <p style="margin:22px 0 0;color:#61708f;font-size:13px">Generated automatically by VideoraIQ.</p></div></div></div>`;
}

function safeReportName(report) {
  return report.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "attendance-report";
}

// Stored media paths are relative (see toRelativeMediaPath in mediaStorage.js)
// — every other stored file in this codebase is resolved to a full URL by
// prepending this same config key at link/display time, never baked in.
export function publicUrlFor(mediaPath) {
  return `${config.get("ImageView")}${mediaPath.startsWith("/") ? "" : "/"}${mediaPath}`;
}

/**
 * Uploads the report's generated files (PDF/CSV buffers) to whichever media
 * backend this deployment runs (NAS over SFTP, or Oracle Object Storage —
 * see mediaStorage.js; switched by a single config flag, transparent here),
 * and returns each file's relative storage path plus a public download URL.
 * One file per format, no size limit to juggle: the email links to the file
 * instead of attaching it, so SendGrid's ~30MB message cap never applies.
 */
export async function uploadReportFiles(report, csvBuffer, pdfBuffer) {
  const safeName = safeReportName(report);
  const files = [];
  if (pdfBuffer) {
    const path = await putMedia({ buffer: pdfBuffer, mediaType: "report", folderName: String(report.adminId), originalName: `${safeName}.pdf` });
    files.push({ format: "pdf", path, url: publicUrlFor(path) });
  }
  if (csvBuffer) {
    const path = await putMedia({ buffer: csvBuffer, mediaType: "report", folderName: String(report.adminId), originalName: `${safeName}.csv` });
    files.push({ format: "csv", path, url: publicUrlFor(path) });
  }
  return files;
}

// Delivery history is capped per report so the document doesn't grow
// unbounded across years of scheduled sends — recent history is what's
// actually useful; older entries are dropped oldest-first.
const HISTORY_LIMIT = 50;

async function recordDelivery(report, { period, rowCount, recipients, files }) {
  await Report.updateOne(
    { _id: report._id },
    {
      $push: {
        history: {
          $each: [{ sentAt: new Date(), period, rowCount, recipients, files: files.map(({ format, path }) => ({ format, path })) }],
          $position: 0,
          $slice: HISTORY_LIMIT,
        },
      },
    }
  );
}

async function deliver(report, options = {}) {
  // Collect one report row per employee-day, then fill each row's
  // "period" total (a per-employee sum that isn't knowable until every day
  // has been read). buildCsv/buildPdf expand these into the spreadsheet grid.
  const rows = [];
  const summary = await streamReportRows(report, options.reference, (row) => rows.push(row));
  applyPeriodTotals(rows);
  const wantsPdf = report.formats.includes("pdf");
  const wantsCsv = report.formats.includes("csv");

  const csvT0 = Date.now();
  const csvBuffer = wantsCsv ? buildCsv({ report, rows, label: summary.label, timezone: summary.timezone }) : null;
  const csvMs = Date.now() - csvT0;
  const pdfT0 = Date.now();
  const pdfBuffer = wantsPdf ? await buildPdf({ report, rows, label: summary.label, timezone: summary.timezone }) : null;
  const pdfMs = Date.now() - pdfT0;

  const uploadT0 = Date.now();
  const files = await uploadReportFiles(report, csvBuffer, pdfBuffer);
  const uploadMs = Date.now() - uploadT0;

  // Diagnostics: pins down exactly what a run looked like (row count,
  // per-format build time, upload time) instead of guessing from a generic
  // failure message if delivery ever fails downstream.
  logger.info(
    `[ATTENDANCE_AUTO_EMAIL_REPORT] deliver diagnostics: report=${report._id} rows=${summary.rowCount} ` +
    `csvRawKB=${csvBuffer ? (csvBuffer.length / 1024).toFixed(1) : "n/a"} csvBuildMs=${csvMs} ` +
    `pdfRawKB=${pdfBuffer ? (pdfBuffer.length / 1024).toFixed(1) : "n/a"} pdfBuildMs=${pdfMs} ` +
    `uploadMs=${uploadMs} files=${files.length}`
  );

  const details = { ...summary, files };
  const recipients = options.recipients?.length ? options.recipients : report.recipients;
  const email = {
    from: { name: config.get("sendgrid.name"), email: config.get("sendgrid.email") },
    to: recipients,
    subject: `[Attendance Report] ${report.title} | ${details.label}`,
    html: emailHtml(report, details),
  };
  sendGridMail.setApiKey(config.get("sendgrid.key"));
  try {
    const sendT0 = Date.now();
    const sendStatus = await sendGridMail.send(email);
    logger.info(`[ATTENDANCE_AUTO_EMAIL_REPORT] SendGrid accepted the send in ${Date.now() - sendT0}ms (report=${report._id})`);
    await trackOutboundEmail(email, sendStatus, { adminId: report.adminId, category: "Attendance report" });
    await recordDelivery(report, { period: details.label, rowCount: details.rowCount, recipients, files });
    return details;
  } catch (error) {
    // SendGrid's SDK error carries the actual reason (e.g. bad from-address,
    // unverified sender) in response.body.errors, not in error.message —
    // surface it so failures aren't reported to admins as a generic,
    // unactionable error.
    const sendGridDetail = error?.response?.body?.errors?.map((item) => item.message).filter(Boolean).join("; ");
    if (sendGridDetail) error.message = `${error.message}: ${sendGridDetail}`;
    logger.error(
      `[ATTENDANCE_AUTO_EMAIL_REPORT] SendGrid rejected the send (report=${report._id}): ` +
      `status=${error?.code || error?.response?.statusCode || "n/a"} body=${JSON.stringify(error?.response?.body || {})}`
    );
    await trackFailedEmail(email, error, { adminId: report.adminId, category: "Attendance report" });
    throw error;
  }
}

function dueKey(report, now = moment()) {
  const timezone = reportTimezone(report);
  const local = now.clone().tz(timezone);
  const [hour, minute] = (report.schedule.time || "00:00").split(":").map(Number);
  if (local.hour() < hour || (local.hour() === hour && local.minute() < minute)) return null;
  const dateKey = local.format("YYYY-MM-DD");
  if (report.schedule.frequency === "daily") return `daily:${dateKey}`;
  if (report.schedule.frequency === "weekly") return local.day() === report.schedule.weekday ? `weekly:${dateKey}` : null;
  if (report.schedule.frequency === "monthly") return local.date() === report.schedule.dayOfMonth ? `monthly:${dateKey}` : null;
  const sendDate = moment(report.schedule.endDate).tz(timezone).add(1, "day").format("YYYY-MM-DD");
  return dateKey >= sendDate ? `custom:${report._id}` : null;
}

class AttendanceAutoEmailReportService {
  async create(req, res) {
    try {
      const adminId = adminIdFrom(req);
      if (!adminId) return res.status(401).json(Response.userFailResp("Authentication context is missing"));
      const { value, error } = createReportSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
      if (error) return res.status(400).json(Response.validationFailResp("Validation failed", error.details.map((item) => item.message).join(", ")));
      const timezone = await savedAdminTimezone(adminId);
      if (!timezone) return res.status(400).json(Response.validationFailResp("Timezone setup required", "Select and save the organisation timezone through PUT /api/v2/admin/timezone before saving an attendance auto email report."));
      const { sendTestMail, ...data } = value;
      data.timezone = timezone;
      data.schedule = normalizeSchedule(data.schedule, timezone);
      const report = await Report.create({ ...data, adminId, createdBy: req.verified?.userData?.memberId || null });
      let testMailError = null;
      if (sendTestMail) {
        try {
          await deliver(report);
        } catch (deliverError) {
          logger.error(`[ATTENDANCE_AUTO_EMAIL_REPORT] Test mail failed after create: ${deliverError.message}`);
          testMailError = deliverError.message;
        }
      }
      const message = testMailError
        ? "Attendance auto email report created, but the test mail failed to send"
        : "Attendance auto email report created";
      return res.status(201).json(Response.userSuccessResp(message, { ...report.toObject(), testMailError }));
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json(Response.validationFailResp("A report with this title already exists"));
      logger.error(`[ATTENDANCE_AUTO_EMAIL_REPORT] Create failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to create attendance auto email report", error.message));
    }
  }

  async list(req, res) {
    try {
      const adminId = adminIdFrom(req);
      const page = Math.max(parseInt(req.query.page || "1", 10), 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 100);
      const search = String(req.query.search || "").trim();
      const query = { adminId };
      if (search) query.$or = [{ title: { $regex: search, $options: "i" } }, { recipients: { $regex: search, $options: "i" } }];
      const [reports, total] = await Promise.all([
        Report.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Report.countDocuments(query),
      ]);
      return res.json(Response.userSuccessResp("Attendance auto email reports fetched", { reports, total, page, limit }));
    } catch (error) {
      return res.status(500).json(Response.errorResp("Failed to fetch attendance auto email reports", error.message));
    }
  }

  async getById(req, res) {
    try {
      const report = await Report.findOne({ _id: req.params.id, adminId: adminIdFrom(req) }).lean();
      if (!report) return res.status(404).json(Response.notFoundResp("Attendance auto email report not found"));
      return res.json(Response.userSuccessResp("Attendance auto email report fetched", report));
    } catch (error) {
      return res.status(400).json(Response.validationFailResp("Invalid report id", error.message));
    }
  }

  async audienceOptions(req, res) {
    try {
      const adminId = adminIdFrom(req);
      const search = String(req.query.search || "").trim();
      const employeeQuery = { adminId };
      if (search) {
        employeeQuery.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }
      const [employees, departments] = await Promise.all([
        AuthorizedUsers.find(employeeQuery)
          .select("firstName lastName email emp_id departmentId designation location")
          .sort({ firstName: 1, lastName: 1 })
          .limit(100)
          .lean(),
        Department.find({ adminId }).select("departmentName").sort({ departmentName: 1 }).lean(),
      ]);
      return res.json(Response.userSuccessResp("Attendance report audience options fetched", { employees, departments }));
    } catch (error) {
      return res.status(500).json(Response.errorResp("Failed to fetch attendance report audience options", error.message));
    }
  }

  async update(req, res) {
    try {
      const { value, error } = updateReportSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
      if (error) return res.status(400).json(Response.validationFailResp("Validation failed", error.details.map((item) => item.message).join(", ")));
      const current = await Report.findOne({ _id: req.params.id, adminId: adminIdFrom(req) });
      if (!current) return res.status(404).json(Response.notFoundResp("Attendance auto email report not found"));
      const timezone = await savedAdminTimezone(adminIdFrom(req));
      if (!timezone) return res.status(400).json(Response.validationFailResp("Timezone setup required", "Select and save the organisation timezone through PUT /api/v2/admin/timezone before saving an attendance auto email report."));
      const { sendTestMail, ...data } = value;
      if (data.schedule) data.schedule = normalizeSchedule(data.schedule, timezone);
      Object.assign(current, data, { timezone, lastRunKey: null });
      await current.save();
      let testMailError = null;
      if (sendTestMail) {
        try {
          await deliver(current);
        } catch (deliverError) {
          logger.error(`[ATTENDANCE_AUTO_EMAIL_REPORT] Test mail failed after update: ${deliverError.message}`);
          testMailError = deliverError.message;
        }
      }
      const message = testMailError
        ? "Attendance auto email report updated, but the test mail failed to send"
        : "Attendance auto email report updated";
      return res.json(Response.userSuccessResp(message, { ...current.toObject(), testMailError }));
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json(Response.validationFailResp("A report with this title already exists"));
      return res.status(400).json(Response.validationFailResp("Failed to update attendance auto email report", error.message));
    }
  }

  async remove(req, res) {
    try {
      const report = await Report.findOneAndDelete({ _id: req.params.id, adminId: adminIdFrom(req) });
      if (!report) return res.status(404).json(Response.notFoundResp("Attendance auto email report not found"));
      return res.json(Response.userSuccessResp("Attendance auto email report deleted", report));
    } catch (error) {
      return res.status(400).json(Response.validationFailResp("Invalid report id", error.message));
    }
  }

  async preview(req, res) {
    try {
      const report = await Report.findOne({ _id: req.params.id, adminId: adminIdFrom(req) }).lean();
      if (!report) return res.status(404).json(Response.notFoundResp("Attendance auto email report not found"));
      const details = await reportRows(report);
      return res.json(Response.userSuccessResp("Attendance report preview", details));
    } catch (error) {
      return res.status(500).json(Response.errorResp("Failed to preview attendance report", error.message));
    }
  }

  async sendNow(req, res) {
    try {
      const report = await Report.findOne({ _id: req.params.id, adminId: adminIdFrom(req) });
      if (!report) return res.status(404).json(Response.notFoundResp("Attendance auto email report not found"));
      const recipients = req.body?.recipients;
      if (recipients) {
        const { error } = Joi.array().items(Joi.string().email()).min(1).validate(recipients);
        if (error) return res.status(400).json(Response.validationFailResp("Validation failed", error.message));
      }
      const details = await deliver(report, { recipients });
      return res.json(Response.userSuccessResp("Attendance report sent", { recipients: recipients?.length ? recipients : report.recipients, recordCount: details.rowCount, period: details.label, files: details.files?.map((file) => ({ format: file.format, url: file.url })) }));
    } catch (error) {
      logger.error(`[ATTENDANCE_AUTO_EMAIL_REPORT] Send failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to send attendance report", error.message));
    }
  }

  async runDueReports() {
    if (runnerBusy) return;
    runnerBusy = true;
    try {
      const reports = await Report.find({ enabled: true }).select("_id timezone schedule lastRunKey").lean();
      for (const candidate of reports) {
        const key = dueKey(candidate);
        if (!key || candidate.lastRunKey === key) continue;
        const report = await Report.findOneAndUpdate({ _id: candidate._id, enabled: true, lastRunKey: { $ne: key } }, { $set: { lastRunKey: key } }, { new: true });
        if (!report) continue;
        try {
          await deliver(report);
          const update = { lastSentAt: new Date(), lastError: null };
          if (report.schedule.frequency === "custom") update.enabled = false;
          await Report.updateOne({ _id: report._id }, { $set: update });
        } catch (error) {
          await Report.updateOne({ _id: report._id }, { $set: { lastRunKey: null, lastError: error.message } });
          logger.error(`[ATTENDANCE_AUTO_EMAIL_REPORT] Scheduled send failed for ${report._id}: ${error.message}`);
        }
      }
    } finally {
      runnerBusy = false;
    }
  }

  startRunner() {
    if (runner) return;
    const execute = () => this.runDueReports().catch((error) => logger.error(`[ATTENDANCE_AUTO_EMAIL_REPORT] Scheduler failed: ${error.message}`));
    execute();
    runner = setInterval(execute, 60 * 1000);
    runner.unref?.();
    logger.info("Attendance auto email report scheduler started");
  }
}

export default new AttendanceAutoEmailReportService();
