import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import moment from "moment-timezone";
import sendGridMail from "@sendgrid/mail";
import config from "config";
import Joi from "joi";
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

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const REPORT_DISPLAY_TITLE = "Mattress QC Report";
const V2_BLUE = "#609ff7";
const V2_PURPLE = "#9274f5";

// Column layout shared by the PDF table and the CSV / XLSX exports. Mirrors the
// on-screen Measurement Records table (match %, confidence, snapshot link).
const HEADERS = [
  "#", "Order", "Ref", "SKU", "Model",
  "Printed LxWxH (in)", "Measured LxWxH (in)",
  "Dev L", "Dev W", "Dev H", "Confidence", "Match %",
  "Station", "Time", "Result", "Snapshot",
];

const SNAP_LINK_TEXT = "View image";

// Worst axis vs its tolerance → match score (100 = on the label, 0 = at/past tol).
const matchPctCell = (r) => {
  if (r.devPct === "QR unread") return "QR unread";
  if (!Number.isFinite(r.devFrac)) return "—";
  return `${Math.max(0, Math.round(100 - r.devFrac * 100))}%`;
};

const snapUrlOf = (r) => r.shotUrl || r.shot || r.qrImageUrl || r.measurementImageUrl || "";

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

// Column set depends on whether snapshots are attached to this schedule.
function headersFor(withSnaps) {
  return withSnaps ? HEADERS : HEADERS.filter((h) => h !== "Snapshot");
}

// `snap`: "text" → "View image" placeholder (XLSX turns it into a link cell,
//         PDF drops the column); "url" → the raw URL (CSV).
// `withSnaps` false drops the Snapshot column entirely.
function toCells(r, i, { snap = "text", withSnaps = true } = {}) {
  const cells = [
    i + 1, r.orderId, r.refNo, r.sku, r.model,
    r.declared, r.measured,
    r.devL, r.devB, r.devH,
    r.confidence != null ? Number(r.confidence).toFixed(2) : "—",
    matchPctCell(r),
    r.station, r.time, r.result,
  ];
  if (withSnaps) {
    const url = snapUrlOf(r);
    cells.push(!url ? "—" : snap === "url" ? url : SNAP_LINK_TEXT);
  }
  return cells;
}

function buildCsv({ rows, label, withSnaps = true }) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = headersFor(withSnaps).map((h) => (h === "Snapshot" ? "Snapshot URL" : h));
  const lines = [
    ["VideoraIQ"],
    ["Mattress Measurement Logs"],
    [label],
    [`Generated on ${moment().format("DD/MM/YYYY hh:mm A")}`],
    [],
    headers,
    ...rows.map((r, i) => toCells(r, i, { snap: "url", withSnaps })),
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
  const snapCol = withSnaps ? headers.indexOf("Snapshot") + 1 : 0; // ExcelJS 1-based
  rows.forEach((r, i) => {
    const row = ws.addRow(toCells(r, i, { withSnaps }));
    if (snapCol) {
      const url = snapUrlOf(r);
      if (url) {
        const cell = row.getCell(snapCol);
        cell.value = { text: SNAP_LINK_TEXT, hyperlink: url };
        cell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
    }
  });
  ws.columns.forEach((col, idx) => {
    col.width = Math.max(12, String(headers[idx] || "").length + 2);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function buildPdf({ rows, label }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 56;
    doc.rect(28, 24, pageWidth, 34).fill(V2_PURPLE);
    doc.fillColor("#ffffff").fontSize(15).font("Helvetica-Bold").text("Mattress Measurement Logs", 40, 34);
    doc.fontSize(8).font("Helvetica").fillColor("#dbe6ff")
      .text(`${label}  |  ${rows.length} record${rows.length === 1 ? "" : "s"}  |  Generated ${moment().format("DD/MM/YYYY hh:mm A")}`, 40, 52);

    doc.moveDown(3);
    doc.fillColor("#111111").fontSize(9);
    if (!rows.length) {
      doc.font("Helvetica").fillColor("#64748b")
        .text("No measurement records for this period.", 40, 90);
    } else {
      // The one-line PDF layout can't fit a snapshot link — it's omitted here
      // regardless; the CSV / XLSX carry it.
      const pdfHeaders = headersFor(false);
      let y = 78;
      doc.font("Helvetica-Bold").fillColor(V2_BLUE).text(pdfHeaders.join("  |  "), 40, y);
      y += 16;
      doc.font("Helvetica").fillColor("#111111");
      rows.forEach((r, i) => {
        doc.text(toCells(r, i, { withSnaps: false }).join("  |  "), 40, y);
        y += 14;
        if (y > doc.page.height - 40) {
          doc.addPage();
          y = 40;
        }
      });
    }
    doc.end();
  });
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

function publicUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${config.get("ImageView")}${path.startsWith("/") ? "" : "/"}${path}`;
}

function emailHtml(report, details) {
  const rows = details.files
    .map((f) => `<li><a href="${publicUrl(f.path)}">${f.format.toUpperCase()}</a></li>`)
    .join("");
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
      <div style="background:linear-gradient(135deg,${V2_BLUE},${V2_PURPLE});padding:20px 24px;border-radius:10px 10px 0 0;">
        <div style="color:#fff;font-size:18px;font-weight:700;">${REPORT_DISPLAY_TITLE}</div>
        <div style="color:#e0e7ff;font-size:12px;margin-top:2px;">${details.label}</div>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:20px 24px;border-radius:0 0 10px 10px;">
        <p style="font-size:13px;">Attached is the scheduled <strong>${report.title}</strong> report
        (${details.rowCount} record${details.rowCount === 1 ? "" : "s"}).</p>
        <ul style="font-size:13px;">${rows}</ul>
        <p style="font-size:11px;color:#64748b;">Generated automatically by VideoraIQ · ${moment().format("DD/MM/YYYY hh:mm A")}</p>
      </div>
    </div>`;
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

// Each report type shapes the attached rows. `mismatchOnly` is an extra filter
// on top (kept for back-compat / the modal toggle).
const REPORT_TYPE_FILTER = {
  pass: (r) => r.result === "Pass",
  mismatch: (r) => r.result === "Mismatch",
  qrerror: (r) => r.result === "QR Error",
  // full → every record
};

async function deliver(report, options = {}) {
  const timezone = reportTimezone(report);
  const { rows, label } = await fetchMeasurementRows(report, timezone);

  const typeFilter = REPORT_TYPE_FILTER[report.reportType];
  let effectiveRows = typeFilter ? rows.filter(typeFilter) : rows;
  if (report.mismatchOnly) effectiveRows = effectiveRows.filter((r) => r.result === "Mismatch");

  const withSnaps = report.includeSnapshots !== false;
  const buffers = {};
  if (report.formats.includes("pdf")) buffers.pdf = await buildPdf({ rows: effectiveRows, label });
  if (report.formats.includes("xlsx")) buffers.xlsx = await buildXlsx({ rows: effectiveRows, label, withSnaps });
  if (report.formats.includes("csv")) buffers.csv = buildCsv({ rows: effectiveRows, label, withSnaps });

  const files = await uploadFiles(report, buffers);
  const details = { label, rowCount: effectiveRows.length, files };

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
          files: details.files.map((f) => ({ format: f.format, url: publicUrl(f.path) })),
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
