import mongoose from "mongoose";
import momentTz from "moment-timezone";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import Admin from "../admin/admin.model.js";
import EmailMessage from "./emailMessage.model.js";
import { trackSendGridEvents } from "./emailTracker.js";

const REPORT_TZ = "Asia/Kolkata";
const DEFAULT_RANGE = "today";
const STATUS_LABELS = {
  queued: "Queued",
  received: "Received",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  deferred: "Deferred",
  failed: "Failed",
  bounced: "Bounced",
  spam: "Spam",
};

function numberParam(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function trend(current, previous) {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    pct: previous > 0 ? Math.round((delta / previous) * 1000) / 10 : (current > 0 ? null : 0),
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
  };
}

function getRange(query = {}) {
  const preset = String(query.range || DEFAULT_RANGE).toLowerCase();
  const now = momentTz.tz(REPORT_TZ);

  if (query.startDate && query.endDate) {
    const start = momentTz.tz(query.startDate, "YYYY-MM-DD", REPORT_TZ).startOf("day");
    const end = momentTz.tz(query.endDate, "YYYY-MM-DD", REPORT_TZ).endOf("day");
    return describeRange(start, end, "custom");
  }

  if (preset === "yesterday") {
    return describeRange(now.clone().subtract(1, "day").startOf("day"), now.clone().subtract(1, "day").endOf("day"), preset);
  }
  if (preset === "last7" || preset === "last-7-days") {
    return describeRange(now.clone().subtract(6, "days").startOf("day"), now.clone().endOf("day"), "last7");
  }
  if (preset === "last30" || preset === "last-30-days") {
    return describeRange(now.clone().subtract(29, "days").startOf("day"), now.clone().endOf("day"), "last30");
  }
  if (preset === "month") {
    return describeRange(now.clone().startOf("month"), now.clone().endOf("day"), preset);
  }
  if (preset === "year") {
    return describeRange(now.clone().startOf("year"), now.clone().endOf("day"), preset);
  }

  return describeRange(now.clone().startOf("day"), now.clone().endOf("day"), "today");
}

function describeRange(start, end, preset) {
  const days = Math.max(end.clone().startOf("day").diff(start.clone().startOf("day"), "days") + 1, 1);
  return {
    preset,
    start,
    end,
    days,
    startDate: start.format("YYYY-MM-DD"),
    endDate: end.format("YYYY-MM-DD"),
  };
}

function previousRange(range) {
  const start = range.start.clone().subtract(range.days, "days");
  const end = range.start.clone().subtract(1, "millisecond");
  return describeRange(start, end, "previous");
}

function buildMatch(query = {}, range = getRange(query)) {
  const match = {
    timestamp: {
      $gte: range.start.toDate(),
      $lte: range.end.toDate(),
    },
  };

  const adminId = String(query.adminId || query.organizationId || "").trim();
  if (adminId && adminId !== "all") {
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      const error = new Error("adminId must be a valid Mongo ObjectId or 'all'");
      error.statusCode = 400;
      throw error;
    }
    match.adminId = new mongoose.Types.ObjectId(adminId);
  }

  return match;
}

function emptyHourly() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: hour === 0 ? "12A" : hour < 12 ? `${hour}A` : hour === 12 ? "12P" : `${hour - 12}P`,
    sent: 0,
    received: 0,
  }));
}

function emptyHeatmap() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = [8, 10, 12, 14, 16, 18];
  return days.map((day, dayIndex) => ({
    day,
    values: hours.map((hour) => ({ dayIndex, hour, label: `${String(hour).padStart(2, "0")}:00`, count: 0 })),
  }));
}

class EmailMonitoringService {
  async sendGridWebhook(req, res) {
    try {
      const results = await trackSendGridEvents(req.body);
      return res.status(200).json({ ok: true, ...results });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ ok: false, message: "Failed to process email webhook" });
    }
  }

  async organizations(_req, res) {
    try {
      const admins = await Admin.find({})
        .select("_id user_id login name_f name_l email orgId")
        .sort({ name_f: 1, login: 1 })
        .lean();

      const organizations = admins.map((admin) => ({
        id: admin._id,
        adminId: admin._id,
        userId: admin.user_id,
        orgId: admin.orgId,
        name: [admin.name_f, admin.name_l].filter(Boolean).join(" ").trim() || admin.login || admin.email,
        email: admin.email,
      }));

      return res.status(200).json(Response.userSuccessResp("Email monitoring organizations fetched successfully", {
        organizations,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch email monitoring organizations.", error.message));
    }
  }

  async dashboard(req, res) {
    try {
      const range = getRange(req.query);
      const match = buildMatch(req.query, range);

      const [
        currentCounts,
        previousCounts,
        hourly,
        daily,
        statusDistribution,
        domainTraffic,
        heatmap,
        topSenders,
        activityRows,
        totalActivity,
      ] = await Promise.all([
        this._counts(match),
        this._counts(buildMatch(req.query, previousRange(range))),
        this._hourly(match),
        this._daily(match, range),
        this._statusDistribution(match),
        this._domainTraffic(match),
        this._heatmap(match),
        this._topSenders(match),
        this._activity(req, match),
        EmailMessage.countDocuments(this._activityMatch(req, match)),
      ]);

      const sent = currentCounts.sent;
      const received = currentCounts.received;
      const failed = currentCounts.failed;
      const pending = currentCounts.pending;
      const previousSent = previousCounts.sent;
      const previousReceived = previousCounts.received;
      const deliveryRate = sent > 0 ? Math.round(((sent - failed) / sent) * 1000) / 10 : 0;
      const previousDeliveryRate = previousCounts.sent > 0
        ? Math.round(((previousCounts.sent - previousCounts.failed) / previousCounts.sent) * 1000) / 10
        : 0;

      return res.status(200).json(Response.userSuccessResp("Email monitoring dashboard fetched successfully", {
        range: {
          preset: range.preset,
          startDate: range.startDate,
          endDate: range.endDate,
          days: range.days,
          timezone: REPORT_TZ,
        },
        kpis: {
          sent: { count: sent, trend: trend(sent, previousSent) },
          received: { count: received, trend: trend(received, previousReceived) },
          failed: { count: failed, trend: trend(failed, previousCounts.failed) },
          pending: { count: pending, trend: trend(pending, previousCounts.pending) },
          deliveryRate: {
            value: deliveryRate,
            trend: trend(deliveryRate, previousDeliveryRate),
          },
        },
        charts: {
          hourly,
          daily,
          statusDistribution,
          domainTraffic,
          heatmap,
        },
        alerts: this._alerts({ sent, failed, pending, statusDistribution }),
        topSenders,
        performanceKpis: this._performanceKpis(hourly, sent, failed),
        activity: {
          page: numberParam(req.query.page, 1, 10_000),
          limit: numberParam(req.query.limit, 25, 100),
          total: totalActivity,
          rows: activityRows,
        },
      }));
    } catch (error) {
      logger.error(error);
      const status = error.statusCode || 500;
      const body = status === 400
        ? Response.validationFailResp(error.message, "Validation Failed!")
        : Response.errorResp("Failed to fetch email monitoring dashboard.", error.message);
      return res.status(status).json(body);
    }
  }

  async activity(req, res) {
    try {
      const range = getRange(req.query);
      const match = buildMatch(req.query, range);
      const activityMatch = this._activityMatch(req, match);
      const [rows, total] = await Promise.all([
        this._activity(req, match),
        EmailMessage.countDocuments(activityMatch),
      ]);

      return res.status(200).json(Response.userSuccessResp("Email monitoring activity fetched successfully", {
        range: {
          preset: range.preset,
          startDate: range.startDate,
          endDate: range.endDate,
          days: range.days,
          timezone: REPORT_TZ,
        },
        page: numberParam(req.query.page, 1, 10_000),
        limit: numberParam(req.query.limit, 25, 100),
        total,
        rows,
      }));
    } catch (error) {
      logger.error(error);
      const status = error.statusCode || 500;
      const body = status === 400
        ? Response.validationFailResp(error.message, "Validation Failed!")
        : Response.errorResp("Failed to fetch email monitoring activity.", error.message);
      return res.status(status).json(body);
    }
  }

  async _counts(match) {
    const rows = await EmailMessage.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          sent: { $sum: { $cond: [{ $eq: ["$direction", "sent"] }, 1, 0] } },
          received: { $sum: { $cond: [{ $eq: ["$direction", "received"] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $in: ["$status", ["failed", "bounced", "spam"]] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ["$status", ["queued", "deferred"]] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
    ]);
    return rows[0] || { sent: 0, received: 0, failed: 0, pending: 0, total: 0 };
  }

  async _hourly(match) {
    const rows = await EmailMessage.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            hour: { $hour: { date: "$timestamp", timezone: REPORT_TZ } },
            direction: "$direction",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const hours = emptyHourly();
    rows.forEach((row) => {
      const hour = row._id.hour;
      const direction = row._id.direction === "received" ? "received" : "sent";
      hours[hour][direction] = row.count;
    });
    return hours;
  }

  async _daily(match, range) {
    const rows = await EmailMessage.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: REPORT_TZ } },
            direction: "$direction",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    const byDate = new Map();
    rows.forEach((row) => {
      const date = row._id.date;
      const entry = byDate.get(date) || { date, sent: 0, received: 0 };
      const direction = row._id.direction === "received" ? "received" : "sent";
      entry[direction] = row.count;
      byDate.set(date, entry);
    });

    return Array.from({ length: range.days }, (_, index) => {
      const date = range.start.clone().add(index, "days").format("YYYY-MM-DD");
      return byDate.get(date) || { date, sent: 0, received: 0 };
    });
  }

  async _statusDistribution(match) {
    const [eventRows, messageRows] = await Promise.all([
      EmailMessage.aggregate([
        { $match: match },
        { $unwind: "$events" },
        { $group: { _id: "$events.type", count: { $sum: 1 } } },
      ]),
      EmailMessage.aggregate([
        { $match: { ...match, events: { $size: 0 } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const totals = new Map();
    [...eventRows, ...messageRows].forEach((row) => {
      const key = normalizeStatus(row._id || "unknown");
      totals.set(key, (totals.get(key) || 0) + row.count);
    });
    const total = Array.from(totals.values()).reduce((sum, count) => sum + count, 0);

    return {
      total,
      statuses: Array.from(totals.entries())
        .map(([status, count]) => ({
          status,
          label: STATUS_LABELS[status] || status,
          count,
          pct: pct(count, total),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async _domainTraffic(match) {
    const rows = await EmailMessage.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$recipientDomain", ""] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const max = rows.reduce((value, row) => Math.max(value, row.count), 0);
    return rows.map((row) => ({
      domain: row._id || "unknown",
      count: row.count,
      pct: max > 0 ? Math.round((row.count / max) * 100) : 0,
    }));
  }

  async _heatmap(match) {
    const rows = await EmailMessage.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            day: { $isoDayOfWeek: { date: "$timestamp", timezone: REPORT_TZ } },
            hour: { $multiply: [{ $floor: { $divide: [{ $hour: { date: "$timestamp", timezone: REPORT_TZ } }, 2] } }, 2] },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const grid = emptyHeatmap();
    rows.forEach((row) => {
      const dayIndex = row._id.day - 1;
      const hour = row._id.hour;
      const day = grid[dayIndex];
      const cell = day?.values.find((value) => value.hour === hour);
      if (cell) cell.count = row.count;
    });
    const max = grid.flatMap((day) => day.values).reduce((value, cell) => Math.max(value, cell.count), 0);
    return { max, rows: grid };
  }

  async _topSenders(match) {
    const rows = await EmailMessage.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$category", ""] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    return rows.map((row) => ({
      sender: row._id || "Uncategorized",
      count: row.count,
    }));
  }

  _alerts({ sent, failed, pending, statusDistribution }) {
    const alerts = [];
    const bounce = statusDistribution.statuses.find((row) => row.status === "bounced")?.count || 0;
    const bounceRate = pct(bounce, sent);
    const failureRate = pct(failed, sent);

    if (bounceRate > 2) {
      alerts.push({
        severity: "warning",
        title: "Bounce rate above normal",
        message: `Current bounce rate is ${bounceRate}%.`,
      });
    }
    if (pending >= 10) {
      alerts.push({
        severity: "watch",
        title: "SMTP queue increasing",
        message: `${pending} messages are pending or deferred.`,
      });
    }
    if (failureRate > 1) {
      alerts.push({
        severity: "critical",
        title: "Rejected messages detected",
        message: `${failed} messages failed, bounced, or landed in spam.`,
      });
    }
    return alerts;
  }

  _performanceKpis(hourly, sent, failed) {
    const peak = hourly.reduce((best, hour) => {
      const total = hour.sent + hour.received;
      return total > best.count ? { hour: hour.hour, label: hour.label, count: total } : best;
    }, { hour: null, label: null, count: 0 });

    return {
      averageEmailsPerHour: Math.round((sent / 24) * 10) / 10,
      peakHour: peak,
      bounceRate: pct(failed, sent),
    };
  }

  _activityMatch(req, match) {
    const activityMatch = { ...match };
    const status = normalizeStatus(req.query.status);
    const search = String(req.query.search || "").trim();

    if (status && status !== "all") activityMatch.status = status;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      activityMatch.$or = [
        { sender: regex },
        { recipient: regex },
        { subject: regex },
        { category: regex },
      ];
    }

    return activityMatch;
  }

  async _activity(req, match) {
    const page = numberParam(req.query.page, 1, 10_000);
    const limit = numberParam(req.query.limit, 25, 100);
    const rows = await EmailMessage.find(this._activityMatch(req, match))
      .populate("adminId", "name_f name_l login email orgId")
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return rows.map((row) => ({
      id: row._id,
      time: momentTz(row.timestamp).tz(REPORT_TZ).format("HH:mm"),
      timestamp: row.timestamp,
      organization: row.adminId
        ? [row.adminId.name_f, row.adminId.name_l].filter(Boolean).join(" ").trim() || row.adminId.login || row.adminId.email
        : "System",
      adminId: row.adminId?._id || null,
      direction: row.direction,
      sender: row.sender,
      recipient: row.recipient,
      subject: row.subject,
      status: row.status,
      category: row.category,
      error: row.error,
    }));
  }
}

export default new EmailMonitoringService();
