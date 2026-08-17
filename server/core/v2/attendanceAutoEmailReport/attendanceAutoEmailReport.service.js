import axios from "axios";
import PDFDocument from "pdfkit";
import moment from "moment-timezone";
import mongoose from "mongoose";
import sendGridMail from "@sendgrid/mail";
import config from "config";
import Joi from "joi";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
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

function formatDuration(firstCheckIn, lastCheckOut) {
  if (!firstCheckIn || !lastCheckOut) return "-";
  const minutes = Math.floor((new Date(lastCheckOut) - new Date(firstCheckIn)) / 60000);
  if (minutes < 0) return "-";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatTime(value, timezone) {
  return value ? moment(value).tz(timezone).format("DD MMM YYYY, HH:mm") : "-";
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

async function reportRows(report, reference) {
  const { timezone, start, end, label } = rangeForReport(report, reference);
  const query = {
    user: asObjectId(report.adminId),
    createdAt: { $gte: start.toDate(), $lte: end.toDate() },
  };
  const target = report.target || {};

  if (target.scope === "employees") {
    query.employee = { $in: target.employeeIds.map(asObjectId) };
  } else if (target.scope === "departments") {
    const employees = await AuthorizedUsers.find({
      adminId: asObjectId(report.adminId),
      departmentId: { $in: target.departmentIds.map(asObjectId) },
    }).distinct("_id");
    query.employee = { $in: employees };
  }

  const [attendanceRaw, settings] = await Promise.all([
    Attendance.find(query)
      .populate({ path: "employee", populate: { path: "departmentId", select: "departmentName" } })
      .populate({ path: "events.channel", select: "name customName" })
      .sort({ createdAt: 1 })
      .lean(),
    AttendanceSettings.findOne({ adminId: report.adminId }).lean(),
  ]);

  // The Attendance Logs UI joins employee via an aggregation $lookup +
  // $unwind (no preserveNullAndEmptyArrays), which drops any record whose
  // employee reference doesn't resolve — e.g. a deleted employee, or an
  // unauthorized/unrecognised detection with no linked employee. .populate()
  // instead leaves `employee` null for those, so without this filter the
  // exported report includes "Unknown employee" rows the UI never shows.
  const attendance = attendanceRaw.filter((item) => item.employee);

  const rules = { fullDayHours: settings?.fullDayHours || 8, halfDayHours: settings?.halfDayHours || 4 };
  const rows = attendance.map((item) => {
    const events = [...(item.events || [])].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
    const checkins = events.filter((event) => event.cameraType === "checkin");
    const checkouts = events.filter((event) => event.cameraType === "checkout");
    const firstCheckIn = checkins[0] || null;
    const lastCheckOut = checkouts.at(-1) || null;
    const employee = item.employee || {};
    const row = {
      date: moment(item.createdAt).tz(timezone).format("DD MMM YYYY"),
      employeeId: employee.emp_id || "-",
      employee: `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || "Unknown employee",
      email: employee.email || "-",
      phone: employee.phoneNumber || "-",
      designation: employee.designation || "-",
      branch: employee.branch || "-",
      department: employee.departmentId?.departmentName || "-",
      location: employee.location || "-",
      checkIn: formatTime(firstCheckIn?.timestamp, timezone),
      checkOut: formatTime(lastCheckOut?.timestamp, timezone),
      duration: formatDuration(firstCheckIn?.timestamp, lastCheckOut?.timestamp),
      checkInCount: checkins.length,
      checkOutCount: checkouts.length,
      checkInCamera: firstCheckIn?.channel?.customName || firstCheckIn?.channel?.name || "-",
      checkOutCamera: lastCheckOut?.channel?.customName || lastCheckOut?.channel?.name || "-",
      status: "",
    };
    row.status = statusForRow({ firstCheckIn: firstCheckIn?.timestamp, lastCheckOut: lastCheckOut?.timestamp }, rules);
    return row;
  });

  return { rows, timezone, label, rules };
}

function buildCsv({ report, rows, label, timezone }) {
  const headers = ["Date", "Employee ID", "Employee", "Email", "Phone", "Designation", "Branch", "Department", "Location", "Check-in", "Check-out", "Duration", "Status", "Check-in Count", "Check-out Count", "Check-in Camera", "Check-out Camera"];
  const output = [
    ["VideoraIQ Attendance Report"],
    ["Report", report.title],
    ["Period", label],
    ["Timezone", timezone],
    [],
    headers,
    ...rows.map((row) => [row.date, row.employeeId, row.employee, row.email, row.phone, row.designation, row.branch, row.department, row.location, row.checkIn, row.checkOut, row.duration, row.status, row.checkInCount, row.checkOutCount, row.checkInCamera, row.checkOutCamera]),
  ];
  return Buffer.from(`\uFEFF${output.map((line) => line.map(csvCell).join(",")).join("\r\n")}`, "utf8");
}

async function buildPdf({ report, rows, label, timezone }) {
  const logo = await logoBuffer();
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A3", layout: "landscape", margin: 32 });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    const pageWidth = document.page.width - 64;
    const columns = [
      ["Date", 82], ["Employee", 144], ["Department", 104], ["Email", 170], ["Location", 80],
      ["Check-in", 122], ["Check-out", 122], ["Duration", 62], ["Status", 77], ["Cameras", 158],
    ];
    const drawHeader = () => {
      const titleBlockWidth = 300;
      const purpleX = document.page.width - titleBlockWidth;
      document.rect(0, 0, document.page.width, 102).fill(V2_BLUE);
      document.rect(purpleX, 0, titleBlockWidth, 102).fill(V2_PURPLE);
      if (logo) document.image(logo, 36, 25, { fit: [145, 48] });
      document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("Attendance Report", purpleX, 29, { width: titleBlockWidth - 32, align: "right" });
      document.font("Helvetica").fontSize(9).text(report.title, purpleX, 57, { width: titleBlockWidth - 32, align: "right" });
      document.fillColor("#273657").font("Helvetica-Bold").fontSize(13).text(label, 32, 122);
      document.font("Helvetica").fontSize(9).fillColor("#61708f").text(`Timezone: ${timezone}  •  ${rows.length} attendance record${rows.length === 1 ? "" : "s"}`, 32, 142);
    };
    const drawTableHeader = (y) => {
      let x = 32;
      document.fillColor("#eef5ff").rect(x, y, pageWidth, 30).fill();
      document.fillColor("#173b83").font("Helvetica-Bold").fontSize(10.5);
      for (const [heading, width] of columns) {
        document.text(heading, x + 6, y + 10, { width: width - 12, ellipsis: true });
        x += width;
      }
      return y + 30;
    };
    const rowValues = (row) => [row.date, `${row.employee}\n#${row.employeeId} • ${row.designation}`, row.department, `${row.email}\n${row.phone}`, row.location, row.checkIn, row.checkOut, row.duration, row.status, `${row.checkInCamera}\n${row.checkOutCamera}`];

    drawHeader();
    let y = drawTableHeader(165);
    for (const [index, row] of rows.entries()) {
      const height = 42;
      if (y + height > document.page.height - 40) {
        document.addPage({ size: "A3", layout: "landscape", margin: 32 });
        drawHeader();
        y = drawTableHeader(165);
      }
      if (index % 2 === 0) document.fillColor("#f9fbff").rect(32, y, pageWidth, height).fill();
      let x = 32;
      document.font("Helvetica").fontSize(10).fillColor("#2e3b55");
      rowValues(row).forEach((value, columnIndex) => {
        const width = columns[columnIndex][1];
        document.text(value, x + 6, y + 9, { width: width - 12, height: 26, ellipsis: true, lineBreak: true });
        x += width;
      });
      document.strokeColor("#e6ecf7").lineWidth(0.4).moveTo(32, y + height).lineTo(32 + pageWidth, y + height).stroke();
      y += height;
    }
    if (!rows.length) document.font("Helvetica").fontSize(12).fillColor("#61708f").text("No attendance records were found for this period.", 32, y + 24);
    document.end();
  });
}

function emailHtml(report, details) {
  return `<div style="font-family:Arial,sans-serif;background:#f5f8ff;padding:28px;color:#273657">
    <div style="max-width:700px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e3eafb">
      <div style="padding:22px 28px;background:linear-gradient(110deg,${V2_BLUE},${V2_PURPLE});color:#fff"><img src="${LOGO_URL}" alt="VideoraIQ" style="max-height:34px;max-width:140px;vertical-align:middle"><span style="float:right;font-size:18px;font-weight:700;margin-top:7px">Attendance Report</span></div>
      <div style="padding:28px"><h2 style="margin:0 0 10px;color:#173b83">${report.title}</h2><p style="margin:0 0 18px;color:#61708f">${details.label} · ${details.timezone}</p>
      <div style="padding:16px;border-radius:8px;background:#eef5ff;color:#173b83"><strong>${details.rows.length}</strong> employee attendance record${details.rows.length === 1 ? "" : "s"} included. The requested PDF/CSV report is attached.</div>
      <p style="margin:22px 0 0;color:#61708f;font-size:13px">Generated automatically by VideoraIQ.</p></div></div></div>`;
}

async function makeAttachments(report, details) {
  const attachments = [];
  const safeName = report.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "attendance-report";
  if (report.formats.includes("pdf")) {
    attachments.push({ content: (await buildPdf({ report, ...details })).toString("base64"), filename: `${safeName}.pdf`, type: "application/pdf", disposition: "attachment" });
  }
  if (report.formats.includes("csv")) {
    attachments.push({ content: buildCsv({ report, ...details }).toString("base64"), filename: `${safeName}.csv`, type: "text/csv", disposition: "attachment" });
  }
  return attachments;
}

async function deliver(report, options = {}) {
  const details = await reportRows(report, options.reference);
  const recipients = options.recipients?.length ? options.recipients : report.recipients;
  const email = {
    from: { name: config.get("sendgrid.name"), email: config.get("sendgrid.email") },
    to: recipients,
    subject: `[Attendance Report] ${report.title} | ${details.label}`,
    html: emailHtml(report, details),
    attachments: await makeAttachments(report, details),
  };
  sendGridMail.setApiKey(config.get("sendgrid.key"));
  try {
    const sendStatus = await sendGridMail.send(email);
    await trackOutboundEmail(email, sendStatus, { adminId: report.adminId, category: "Attendance report" });
    return details;
  } catch (error) {
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
      return res.json(Response.userSuccessResp("Attendance report sent", { recipients: recipients?.length ? recipients : report.recipients, recordCount: details.rows.length, period: details.label }));
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
          const update = { lastSentAt: new Date() };
          if (report.schedule.frequency === "custom") update.enabled = false;
          await Report.updateOne({ _id: report._id }, { $set: update });
        } catch (error) {
          await Report.updateOne({ _id: report._id }, { $set: { lastRunKey: null } });
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
