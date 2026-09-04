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
import { buildMonthlyStatusWorkbook } from "./monthlyStatusSheet.js";

const LOGO_URL = "https://stagingv2.videoraiq.com/src/assets/videoraiq-logo-color.png";
const DEFAULT_TIMEZONE = "Asia/Kolkata";
// Fixed label shown in the email, subject and PDF — the report's own title
// (an internal name like "Email Test") is never surfaced to recipients.
const REPORT_DISPLAY_TITLE = "Attendance Report Email";
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

/**
 * Every duration in the report, as hours and minutes ("36:06").
 *
 * Hours accumulate rather than rolling into days: a 36-hour span reads "36:06",
 * not "1d 12h 6m". A duration column is read to compare and to add up, and a
 * mixed day/hour/minute label does neither — 36:06 sorts and sums against the
 * rows around it, which "1d 12h 6m" cannot.
 *
 * Seconds are dropped deliberately: attendance is reported to the minute
 * everywhere else (shift windows, break totals, the monthly-status sheet), so
 * carrying seconds here only invited rounding mismatches between columns.
 */
function formatPeriodDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "00:00";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
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

// Pair each check-in with the next check-out into a "work session". Mirrors
// pairBreaks' shape but for worked time: a check-in opens a session, the first
// check-out after it closes it. A trailing check-in with no matching check-out
// is still returned (checkout: null) so it shows as an open session.
function pairWorkSessions(events) {
  const sorted = [...(events || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const sessions = [];
  let openCheckin = null;
  for (const event of sorted) {
    if (event.cameraType === "checkin") {
      if (!openCheckin) openCheckin = event;
    } else if (event.cameraType === "checkout" && openCheckin) {
      sessions.push({ checkin: openCheckin, checkout: event });
      openCheckin = null;
    }
  }
  if (openCheckin) sessions.push({ checkin: openCheckin, checkout: null });
  return sessions;
}

// Worked minutes for one session (checkout − checkin), whole minutes, floored
// at 0. An open session (no checkout) contributes 0, matching how the day
// total is derived from first check-in → last check-out only.
function sessionMinutes(session) {
  if (!session.checkin || !session.checkout) return 0;
  const ms = new Date(session.checkout.timestamp) - new Date(session.checkin.timestamp);
  return ms > 0 ? Math.round(ms / 60000) : 0;
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

  //   - Total Break Hrs (Day)    = Σ (checkin − checkout) gaps  (pairBreaks +
  //     breakMinutesFromPairs), per-pair rounding. Shown alongside only — never
  //     added into any working figure.
  const breakPairs = pairBreaks(events);
  const breakMinutes = breakMinutesFromPairs(breakPairs);

  // Each break gap keyed by the check-in that ENDED it, so a session can look
  // up how long the employee was away immediately before it started. Keying by
  // the timestamp (rather than by position) keeps the two pairings — which
  // walk the same events but pair them differently — from drifting apart.
  const breakBeforeCheckin = new Map(
    breakPairs.map((pair) => {
      const ms = new Date(pair.checkin.timestamp) - new Date(pair.checkout.timestamp);
      return [String(pair.checkin.timestamp), ms > 0 ? Math.round(ms / 60000) : 0];
    }),
  );

  // Every check-in/check-out pairing for the day, each with its own worked
  // duration and snapshot links.
  const workSessions = pairWorkSessions(events);
  const sessionCells = workSessions.map((session) => ({
    checkIn: session.checkin ? formatClock(session.checkin.timestamp, timezone) : "-",
    checkOut: session.checkout ? formatClock(session.checkout.timestamp, timezone) : "-",
    // Hours and minutes ("02:30"), hours accumulating past 24.
    duration: formatPeriodDuration(sessionMinutes(session)),
    checkInCamera: eventCamera(session.checkin),
    checkOutCamera: eventCamera(session.checkout),
    checkInImage: session.checkin ? checkInImageUrl(session.checkin) : "-",
    checkOutImage: session.checkout ? checkInImageUrl(session.checkout) : "-",
    // How long the employee was away just before this session began. The very
    // first session of the day has nothing before it, so it reads "-" rather
    // than a misleading 00:00:00.
    breakBefore: breakBeforeCheckin.has(String(session.checkin?.timestamp))
      ? formatPeriodDuration(breakBeforeCheckin.get(String(session.checkin.timestamp)))
      : "-",
  }));

  // The first session's clock times / worked duration go on the day line
  // itself; the remaining sessions become the sub-rows. This avoids repeating
  // the first check-in/check-out (once on the day line as "first in / last out",
  // once as session 1).
  const firstSessionCells = sessionCells[0] || null;
  const sessions = sessionCells.slice(1);

  // Total Working Hrs (Day) = Σ of every work-session's worked minutes (actual
  // time on the clock between a check-in and its check-out). Breaks are NOT
  // included. This is exactly the sum of the Duration column for the day.
  const workingMinutesDay = workSessions.reduce((sum, session) => sum + sessionMinutes(session), 0);

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
    // Day line carries the FIRST work session's check-in / check-out / worked
    // duration. Remaining sessions are the sub-rows (`sessions` below).
    checkIn: firstSessionCells ? firstSessionCells.checkIn : (firstCheckIn ? formatClock(firstCheckIn.timestamp, timezone) : "-"),
    checkOut: firstSessionCells ? firstSessionCells.checkOut : (lastCheckOut ? formatClock(lastCheckOut.timestamp, timezone) : "-"),
    duration: firstSessionCells ? firstSessionCells.duration : "-",
    // Hours and minutes ("36:06") — see formatPeriodDuration.
    workingHoursDay: formatPeriodDuration(workingMinutesDay),
    // The day line shows the first work session, and nothing precedes it.
    breakBefore: firstSessionCells ? firstSessionCells.breakBefore : "-",
    breakHoursDay: formatPeriodDuration(breakMinutes),
    // Filled in by applyPeriodTotals once every day for this employee has been read.
    workingHoursPeriod: "00:00:00",
    // Per-employee period total sums this (the summed session working minutes).
    workingMinutesDay: workingMinutesDay,
    breakMinutesDay: breakMinutes,
    checkInCount: checkins.length,
    checkOutCount: checkouts.length,
    // Day line = first session, so its cameras / snapshot are the first
    // session's too (fall back to first-in / last-out when there are no paired
    // sessions at all).
    checkInCamera: firstSessionCells ? firstSessionCells.checkInCamera : eventCamera(firstCheckIn),
    checkOutCamera: firstSessionCells ? firstSessionCells.checkOutCamera : eventCamera(lastCheckOut),
    viewImage: firstSessionCells ? firstSessionCells.checkInImage : (firstCheckIn ? checkInImageUrl(firstCheckIn) : "-"),
    sessions,
    status: "",
    // Raw values the monthly-status sheet needs. The display columns above are
    // already formatted for the PDF/CSV grid; the sheet needs the underlying
    // date, clock times and shift to place each day in its own column.
    dateKey: moment(item.createdAt).tz(timezone).format("YYYY-MM-DD"),
    inTime: firstCheckIn ? moment(firstCheckIn.timestamp).tz(timezone).format("HH:mm") : "",
    outTime: lastCheckOut ? moment(lastCheckOut.timestamp).tz(timezone).format("HH:mm") : "",
    shift: employee.shiftId || null,
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
    .populate({
      path: "employee",
      populate: [
        { path: "departmentId", select: "departmentName" },
        // The monthly-status sheet grades every day of the month, including
        // the ones with no attendance record at all, against the employee's
        // shift — see monthlyStatusSheet.js.
        { path: "shiftId" },
      ],
    })
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
// Working Hrs (Day) — i.e. the summed work-session minutes — across every day
// in the report range. Fillable only once all rows are collected. Mutates rows
// in place.
export function applyPeriodTotals(rows) {
  const totals = new Map();
  for (const row of rows) {
    totals.set(row.employeeKey, (totals.get(row.employeeKey) || 0) + (row.workingMinutesDay || 0));
  }
  for (const row of rows) {
    const periodMinutes = totals.get(row.employeeKey) || 0;
    row.workingMinutesPeriod = periodMinutes;
    // Hours and minutes ("223:51"), hours accumulating rather than rolling
    // into days, so the column stays comparable and summable.
    row.workingHoursPeriod = formatPeriodDuration(periodMinutes);
  }
  return rows;
}

async function reportRows(report, reference) {
  const rows = [];
  const { timezone, label } = await streamReportRows(report, reference, (row) => rows.push(row));
  applyPeriodTotals(rows);
  // Drop the internal per-employee grouping key before the rows go out over the
  // preview API.
  const cleanRows = rows.map(({ employeeKey, ...rest }) => rest);
  // Same expanded day / session / (per-employee-day) total line list the PDF and
  // CSV render, so the preview modal shows the exact layout recipients receive
  // (multi-row check-in/check-out sessions + a per-day total row) instead of a
  // flattened one-row-per-day view. `headers` pairs with each line's `cells`.
  return {
    rows: cleanRows,
    headers: REPORT_HEADERS,
    tableRows: reportTableRows(rows),
    timezone,
    label,
  };
}

function imageCell(url, text = "View Image") {
  return url && url !== "-" ? { text, link: url } : "-";
}

// Single source of truth for the report grid. Each column declares its header
// and a value function per line kind:
//   day     — one per employee-day: identity + the FIRST work session's
//             check-in / check-out / worked duration.
//   session — one per remaining check-in/check-out pair (sessions 2..N): that
//             pair's clock times, its own worked duration, cameras, snapshot.
//   total   — one per employee-day: Σ session working hrs, the break total and
//             the period total.
/** A shift's display name, or "-" when the employee holds no shift. */
function shiftNameFor(shift) {
  return shift?.name || "-";
}

/**
 * A shift's window as "09:00 - 18:00". Night shifts are flagged, since the
 * end time being earlier than the start would otherwise read as a typo.
 */
function shiftTimingsFor(shift) {
  if (!shift?.startTime || !shift?.endTime) return "-";
  const window = `${shift.startTime} - ${shift.endTime}`;
  return shift.isNightShift ? `${window} (night)` : window;
}

// A column with no function for a kind renders blank there automatically — no
// hand-placed "" padding, and adding/reordering a column can't misalign rows.
const REPORT_COLUMNS = [
  { header: "ID", day: (ctx) => String(ctx.index + 1) },
  { header: "Emp. Code", day: (ctx) => ctx.row.employeeId },
  {
    header: "Name",
    day: (ctx) => ctx.row.employee,
  },
  { header: "Department", day: (ctx) => ctx.row.department },
  // The shift an employee holds is what their check-in/check-out is judged
  // against, so the report shows it beside the times rather than leaving the
  // reader to look it up. Unassigned employees render "-", never a default
  // shift they were never actually on.
  { header: "Shift", day: (ctx) => shiftNameFor(ctx.row.shift) },
  { header: "Shift Timings", day: (ctx) => shiftTimingsFor(ctx.row.shift) },
  { header: "Date", day: (ctx) => ctx.row.date },
  { header: "Location", day: (ctx) => ctx.row.location },
  {
    header: "Check in",
    day: (ctx) => ctx.row.checkIn,
    session: (ctx) => ctx.session.checkIn,
  },
  {
    header: "Check out",
    day: (ctx) => ctx.row.checkOut,
    session: (ctx) => ctx.session.checkOut,
  },
  {
    header: "Duration",
    day: (ctx) => ctx.row.duration,
    session: (ctx) => ctx.session.duration,
  },
  {
    header: "Total Working Hours for the Day",
    total: (ctx) => ctx.row.workingHoursDay,
  },
  {
    // Per-session break: the gap between the previous check-out and this
    // session's check-in. Blank on the total line, where the day's summed
    // break is reported by the column beside it instead.
    header: "Break Time",
    day: (ctx) => ctx.row.breakBefore,
    session: (ctx) => ctx.session.breakBefore,
  },
  {
    header: "Total Break Hours for the Day",
    total: (ctx) => ctx.row.breakHoursDay,
  },
  {
    header: "Total Working Hours for the period selected",
    total: (ctx) => ctx.row.workingHoursPeriod,
  },
  {
    header: "Checkin Camera",
    day: (ctx) => ctx.row.checkInCamera,
    session: (ctx) => ctx.session.checkInCamera,
  },
  {
    header: "Checkout Camera",
    day: (ctx) => ctx.row.checkOutCamera,
    session: (ctx) => ctx.session.checkOutCamera,
  },
  {
    header: "View Image",
    day: (ctx) => imageCell(ctx.row.viewImage),
    session: (ctx) => imageCell(ctx.session.checkInImage),
  },
];

// Exported so tests can locate a column by name rather than by a hard-coded
// index — adding or reordering a column then can't silently break them.
export const REPORT_HEADERS = REPORT_COLUMNS.map((column) => column.header);

// Build one line's cells straight from the column schema for the given kind and
// context. Columns that don't define the kind produce "".
function lineFor(kind, ctx) {
  return {
    kind,
    cells: REPORT_COLUMNS.map((column) => {
      const value = column[kind] ? column[kind](ctx) : "";
      return value == null ? "" : value;
    }),
  };
}

// `row.sessions` already excludes the first work session (it lives on the day
// line). An empty array means the day had one session or none — nothing extra
// to expand.
function sessionsFor(row) {
  return row.sessions || [];
}

// Expand every employee-day into: a day line (first work session), one session
// line per remaining check-in/check-out pair, then a day total line. Returns
// `{ kind, cells }` objects so the PDF/CSV can style each line kind.
export function reportTableRows(rows) {
  const out = [];
  rows.forEach((row, index) => {
    out.push(lineFor("day", { row, index }));
    for (const session of sessionsFor(row)) out.push(lineFor("session", { row, session }));
    out.push(lineFor("total", { row, index }));
  });
  return out;
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
    ["Report", REPORT_DISPLAY_TITLE],
    ["Period", label],
    ["Timezone", timezone],
    [],
    REPORT_HEADERS,
  ].map((line) => line.map(csvCell).join(","));
  const body = reportTableRows(rows).map(({ cells }) => cells.map(csvField).join(","));
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
    // Headings and order line up with REPORT_COLUMNS / reportTableRows.
    // `wrap: true` columns hold free text (name, department, camera, location)
    // and are rendered on multiple lines instead of being truncated — the
    // camera and department columns are given enough width to show the full
    // name rather than an ellipsis. The rest are fixed-format:
    //   - time columns fit "09:45:40 AM"
    //   - Date fits "01 Jun 2026"
    const columns = [
      { head: "ID", width: 24 },
      { head: "Emp. Code", width: 58 },
      { head: "Name", width: 82, wrap: true },
      { head: "Department", width: 78, wrap: true },
      { head: "Shift", width: 62, wrap: true },
      { head: "Shift Timings", width: 72 },
      { head: "Date", width: 60 },
      { head: "Location", width: 56, wrap: true },
      { head: "Check in", width: 66 },
      { head: "Check out", width: 66 },
      { head: "Duration", width: 50 },
      { head: "Total Working Hrs (Day)", width: 62 },
      { head: "Break Time", width: 58 },
      { head: "Total Break Hrs (Day)", width: 60 },
      { head: "Total Working Hrs (Period)", width: 68 },
      { head: "Checkin Camera", width: 76, wrap: true },
      { head: "Checkout Camera", width: 76, wrap: true },
      { head: "View Image", width: 52 },
    ];
    const drawHeader = () => {
      const titleBlockWidth = 300;
      const purpleX = document.page.width - titleBlockWidth;
      document.rect(0, 0, document.page.width, 102).fill(V2_BLUE);
      document.rect(purpleX, 0, titleBlockWidth, 102).fill(V2_PURPLE);
      if (logoImage) document.image(logoImage, 36, 25, { fit: [145, 48] });
      document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("Attendance Report", purpleX, 29, { width: titleBlockWidth - 32, align: "right" });
      document.font("Helvetica").fontSize(9).text(REPORT_DISPLAY_TITLE, purpleX, 57, { width: titleBlockWidth - 32, align: "right" });
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
    // Line kinds: "day" (identity + span, shaded, bold identity), "session"
    // (one check-in/out pair, plain), "total" (day working/break totals, shaded).
    const drawLine = (line, kind) => {
      const emphasise = kind === "day" || kind === "total";
      document.font(emphasise ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      const height = lineHeight(line);
      const rowFill = kind === "day" ? "#eef2fb" : kind === "total" ? "#e6edfa" : null;
      if (rowFill) document.fillColor(rowFill).rect(32, y, pageWidth, height).fill();
      let x = 32;
      line.forEach((value, columnIndex) => {
        const col = columns[columnIndex];
        const opts = { width: col.width - PAD_X * 2, lineBreak: Boolean(col.wrap) };
        if (!col.wrap) opts.ellipsis = true;
        if (value && typeof value === "object") {
          document.fillColor(V2_BLUE).text(value.text, x + PAD_X, y + V_PAD, { ...opts, link: value.link, underline: true });
        } else if (value !== "" && value != null) {
          document.fillColor(emphasise ? "#173b83" : "#2e3b55").text(String(value), x + PAD_X, y + V_PAD, opts);
        }
        x += col.width;
      });
      // A heavier rule under the total line closes each employee-day block.
      const heavyRule = kind === "total";
      document.strokeColor(heavyRule ? "#9db6e8" : "#e6ecf7").lineWidth(heavyRule ? 0.8 : 0.4)
        .moveTo(32, y + height).lineTo(32 + pageWidth, y + height).stroke();
      y += height;
    };

    drawHeader();
    let y = drawTableHeader(165);
    reportTableRows(rows).forEach(({ kind, cells }) => {
      const pageBottom = document.page.height - 40;
      if (y + lineHeight(cells) > pageBottom) {
        document.addPage({ size: "A3", layout: "landscape", margin: 32 });
        drawHeader();
        y = drawTableHeader(165);
      }
      drawLine(cells, kind);
    });
    if (!rows.length) document.font("Helvetica").fontSize(12).fillColor("#61708f").text("No attendance records were found for this period.", 32, y + 24);
    document.end();
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

// Email palette — deep navy header + clean white card, blue primary / green
// secondary actions.
const MAIL = {
  navy: "#123a8f",       // header + primary button
  navyDark: "#0f2f73",   // header gradient end / accent bar
  green: "#1e9e63",      // secondary (CSV) button
  greenDark: "#17864f",
  teal: "#0f766e",       // monthly-status workbook (XLSX) button
  tealDark: "#0c5d56",
  paper: "#eef2f9",      // page ground
  card: "#ffffff",
  panel: "#f4f6fb",      // stat card fill
  rule: "#e4e8f1",
  tx: "#1f2a44",         // headings
  tx2: "#5b6784",        // body text
  tx3: "#8a94ab",        // captions
};

const SANS = "font-family:'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;";

// Small inline SVG icons as data URIs (CSP-safe, render as <img> in email).
const ICON = {
  // white shield, for the header logo lockup
  shield: (color = "%23ffffff") =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${color.replace("%23", "#")}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="2.6"/></svg>`
    )}`,
  calendarWhite: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`
  )}`,
  calendarBlue: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#123a8f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`
  )}`,
  pin: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#123a8f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`
  )}`,
  users: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
  )}`,
  fileWhite: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`
  )}`,
  shieldBadge: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#123a8f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`
  )}`,
  // decorative "letter with checkmark" illustration for the header-right
  envelope: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="120" viewBox="0 0 150 120" fill="none">
      <rect x="30" y="18" width="70" height="52" rx="4" fill="#ffffff" stroke="#c9d6f2" stroke-width="2"/>
      <circle cx="46" cy="34" r="6" fill="#8fb0ee"/>
      <rect x="58" y="30" width="34" height="4" rx="2" fill="#cddaf5"/>
      <rect x="58" y="40" width="28" height="4" rx="2" fill="#dbe4f8"/>
      <rect x="58" y="50" width="32" height="4" rx="2" fill="#dbe4f8"/>
      <path d="M18 52h114l-12 46a6 6 0 0 1-5.8 4.4H35.8A6 6 0 0 1 30 98z" fill="#5b8def"/>
      <path d="M18 52l57 34 57-34" fill="#93b4f4"/>
      <path d="M18 52l57 34 57-34" stroke="#3f6fd6" stroke-width="2" fill="none"/>
      <circle cx="120" cy="86" r="15" fill="#1e9e63"/>
      <path d="M113 86l5 5 9-10" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  )}`,
};

// A pill download button — solid fill, file glyph, bulletproof for Outlook.
function downloadButton(file) {
  const format = String(file.format).toLowerCase();
  // The workbook is a different report, not another rendering of the same
  // table, so it says so rather than just naming its file extension.
  const label = format === "xlsx" ? "Download Monthly Status" : `Download ${file.format.toUpperCase()}`;
  const url = escapeHtml(file.url);
  const palette = format === "pdf"
    ? [MAIL.navy, MAIL.navyDark]
    : format === "xlsx"
    ? [MAIL.teal, MAIL.tealDark]
    : [MAIL.green, MAIL.greenDark];
  const [fill, stroke] = palette;
  return `
    <td align="center" style="padding:0 8px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px;v-text-anchor:middle;width:230px;" arcsize="14%" strokecolor="${stroke}" fillcolor="${fill}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${url}" target="_blank" rel="noopener"
         style="display:block;width:230px;padding:15px 0;border-radius:10px;
                background:${fill};border:1px solid ${stroke};
                color:#ffffff;${SANS}font-size:15px;font-weight:700;
                text-decoration:none;text-align:center;">
        <img src="${ICON.fileWhite}" width="16" height="16" alt="" style="vertical-align:-3px;margin-right:8px;border:0;"> ${label}
      </a>
      <!--<![endif]-->
    </td>`;
}

function emailHtml(report, details) {
  const count = details.rowCount || 0;
  const preheader = `${REPORT_DISPLAY_TITLE} — ${count} attendance record${count === 1 ? "" : "s"} · ${details.label}`;
  const buttonRow = details.files.map(downloadButton).join("");
  const tz = details.timezone || DEFAULT_TIMEZONE;
  const nowTz = moment().tz(tz);
  const startStr = details.start ? moment(details.start).tz(tz).format("DD MMM YYYY") : "";
  const endStr = details.end ? moment(details.end).tz(tz).format("DD MMM YYYY") : "";
  const rangeLine = startStr && endStr && endStr !== startStr
    ? `${startStr} – ${endStr}`
    : (startStr || details.label);

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
            <td bgcolor="${MAIL.navy}" style="background:${MAIL.navy};background:linear-gradient(120deg,${MAIL.navy},${MAIL.navyDark});padding:26px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle">
                  <img src="${ICON.shield()}" width="24" height="24" alt="" style="vertical-align:-5px;border:0;">
                  <span style="${SANS}font-size:21px;font-weight:800;color:#ffffff;letter-spacing:.2px;margin-left:8px;">Videora<span style="font-weight:800;">IQ</span></span>
                </td>
                <td valign="middle" align="right">
                  <span style="${SANS}font-size:19px;font-weight:800;color:#ffffff;letter-spacing:.2px;">Attendance Report</span>
                  &nbsp;&nbsp;
                  <span style="display:inline-block;width:42px;height:42px;background:rgba(255,255,255,.16);border-radius:11px;vertical-align:middle;text-align:center;line-height:42px;">
                    <img src="${ICON.calendarWhite}" width="19" height="19" alt="" style="vertical-align:-4px;border:0;">
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
                        <img src="${ICON.calendarBlue}" width="15" height="15" alt="" style="vertical-align:-2px;margin-right:6px;border:0;">${escapeHtml(rangeLine)}
                      </td>
                      <td valign="middle" style="padding:0 14px;color:${MAIL.rule};">|</td>
                      <td valign="middle" style="${SANS}font-size:14px;color:${MAIL.tx2};">
                        <img src="${ICON.pin}" width="15" height="15" alt="" style="vertical-align:-2px;margin-right:6px;border:0;">${escapeHtml(tz)}
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
                            <span style="display:inline-block;width:46px;height:46px;background:${MAIL.navy};border-radius:12px;text-align:center;line-height:46px;">
                              <img src="${ICON.users}" width="22" height="22" alt="" style="vertical-align:-5px;border:0;">
                            </span>
                          </td>
                          <td valign="middle" style="padding-left:16px;">
                            <span style="${SANS}font-size:24px;font-weight:800;color:${MAIL.navy};">${escapeHtml(String(count))}</span>
                            <span style="${SANS}font-size:15px;color:${MAIL.tx2};">&nbsp; employee attendance record${count === 1 ? "" : "s"} included.</span>
                          </td>
                        </tr></table>
                      </td>
                    </tr>
                  </table>

                </td>
                <td valign="top" width="150" align="right" style="padding-left:14px;" class="mail-illus">
                  <img src="${ICON.envelope}" width="150" height="120" alt="" style="border:0;display:block;max-width:150px;">
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
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px;">
                <tr>${buttonRow}</tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="${MAIL.panel}" style="background:${MAIL.panel};padding:20px 30px;border-top:1px solid ${MAIL.rule};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="top" width="46">
                  <span style="display:inline-block;width:36px;height:36px;background:#ffffff;border:1px solid ${MAIL.rule};border-radius:50%;text-align:center;line-height:36px;">
                    <img src="${ICON.shieldBadge}" width="18" height="18" alt="" style="vertical-align:-4px;border:0;">
                  </span>
                </td>
                <td valign="middle" style="padding-left:12px;${SANS}font-size:12.5px;line-height:1.6;color:${MAIL.tx3};">
                  This is an automated email. Please do not reply to this email.<br>
                  Generated automatically by <span style="color:${MAIL.navy};font-weight:700;">VideoraIQ</span> &#183; ${escapeHtml(nowTz.format("YYYY"))}.
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- accent bar -->
          <tr><td style="height:4px;font-size:0;line-height:0;background:${MAIL.navy};background:linear-gradient(90deg,${MAIL.navy},${MAIL.green});">&nbsp;</td></tr>

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

// Downloaded files are always named "attendance-report" (the media backend
// prepends its own timestamp + id), so the report title never leaks into the
// filename.
function safeReportName() {
  return "attendance-report";
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
export async function uploadReportFiles(report, csvBuffer, pdfBuffer, xlsxBuffer) {
  const safeName = safeReportName();
  const files = [];
  if (pdfBuffer) {
    const path = await putMedia({ buffer: pdfBuffer, mediaType: "report", folderName: String(report.adminId), originalName: `${safeName}.pdf` });
    files.push({ format: "pdf", path, url: publicUrlFor(path) });
  }
  if (csvBuffer) {
    const path = await putMedia({ buffer: csvBuffer, mediaType: "report", folderName: String(report.adminId), originalName: `${safeName}.csv` });
    files.push({ format: "csv", path, url: publicUrlFor(path) });
  }
  if (xlsxBuffer) {
    const path = await putMedia({ buffer: xlsxBuffer, mediaType: "report", folderName: String(report.adminId), originalName: `${safeName}.xlsx` });
    files.push({ format: "xlsx", path, url: publicUrlFor(path) });
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
  const wantsXlsx = report.formats.includes("xlsx");

  const csvT0 = Date.now();
  const csvBuffer = wantsCsv ? buildCsv({ report, rows, label: summary.label, timezone: summary.timezone }) : null;
  const csvMs = Date.now() - csvT0;
  const pdfT0 = Date.now();
  const pdfBuffer = wantsPdf ? await buildPdf({ report, rows, label: summary.label, timezone: summary.timezone }) : null;
  const pdfMs = Date.now() - pdfT0;

  // The monthly-status workbook is a matrix (days as columns, one sheet per
  // employee) built from the same rows — see monthlyStatusSheet.js.
  const xlsxT0 = Date.now();
  const xlsxBuffer = wantsXlsx
    ? await buildMonthlyStatusWorkbook({ rows, label: summary.label, timezone: summary.timezone, start: summary.start, end: summary.end })
    : null;
  const xlsxMs = Date.now() - xlsxT0;

  const uploadT0 = Date.now();
  const files = await uploadReportFiles(report, csvBuffer, pdfBuffer, xlsxBuffer);
  const uploadMs = Date.now() - uploadT0;

  // Diagnostics: pins down exactly what a run looked like (row count,
  // per-format build time, upload time) instead of guessing from a generic
  // failure message if delivery ever fails downstream.
  logger.info(
    `[ATTENDANCE_AUTO_EMAIL_REPORT] deliver diagnostics: report=${report._id} rows=${summary.rowCount} ` +
    `csvRawKB=${csvBuffer ? (csvBuffer.length / 1024).toFixed(1) : "n/a"} csvBuildMs=${csvMs} ` +
    `pdfRawKB=${pdfBuffer ? (pdfBuffer.length / 1024).toFixed(1) : "n/a"} pdfBuildMs=${pdfMs} ` +
    `xlsxRawKB=${xlsxBuffer ? (xlsxBuffer.length / 1024).toFixed(1) : "n/a"} xlsxBuildMs=${xlsxMs} ` +
    `uploadMs=${uploadMs} files=${files.length}`
  );

  const details = { ...summary, files };
  const recipients = options.recipients?.length ? options.recipients : report.recipients;
  const email = {
    from: { name: config.get("sendgrid.name"), email: config.get("sendgrid.email") },
    to: recipients,
    subject: `[Attendance Report] ${REPORT_DISPLAY_TITLE} | ${details.label}`,
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
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        employeeQuery.$or = [
          { firstName: { $regex: escaped, $options: "i" } },
          { lastName: { $regex: escaped, $options: "i" } },
          { email: { $regex: escaped, $options: "i" } },
          { emp_id: { $regex: escaped, $options: "i" } },
        ];
      }
      const [employees, departments] = await Promise.all([
        // Whole roster — the picker loads once and filters client-side, so a
        // low cap here silently hid most employees on any org over ~100. The
        // 5000 cap is a sanity ceiling far above any real employee count.
        AuthorizedUsers.find(employeeQuery)
          .select("firstName lastName email emp_id departmentId designation location")
          .sort({ firstName: 1, lastName: 1 })
          .limit(5000)
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
