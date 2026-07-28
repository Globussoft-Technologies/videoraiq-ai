import mongoose from "mongoose";
import moment from "moment";
import momentTz from "moment-timezone";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import { Incident } from "../incidents/incidents.model.js";
import NVR from "../NVR/nvr.model.js";
import Channel from "../channels/channels.model.js";
import Attendance from "../attendance/attendance.model.js";
import AuthorizedUser from "../authorizedUsers/authorizedUsers.model.js";
import OptimizedAccessLogs from "../accesslogs/newAccessLogs.model.js";
import AnalyticsValidator from "./analytics.validate.js";

const DEFAULT_DAYS = 30;
const DEFAULT_TOP_CAMERAS_LIMIT = 5;
const UNKNOWN_ACCESS_NAMES = [
  "",
  "unknown",
  "unauthorized",
  "unauthorised",
  "unauthorized person",
  "unauthorised person",
];

// Every day-bucket in the attendance widget — attendance rows, access
// sessions, the after-hours window and the range itself — is resolved in this
// one zone. Mixing zones (attendance in UTC, access in IST) put the two series
// of the same chart on different calendars.
const REPORT_TZ = "Asia/Kolkata";
const AFTER_HOURS_START = 21; // exclusive upper bound: > 21:00 is after hours
const AFTER_HOURS_END = 7; //  exclusive lower bound: < 07:00 is after hours

function toObjectIds(value) {
  const ids = Array.isArray(value) ? value : String(value).split(",").map((v) => v.trim());
  return ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function splitValues(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : String(value).split(",");
  return values.map((v) => String(v).trim()).filter(Boolean);
}

// Resolved in REPORT_TZ rather than server-local time so the window matches the
// $dateToString buckets below — otherwise a server running in UTC slices days
// 5.5h away from where the Attendance/Access Logs pages slice them.
function getDateWindow(query, fallbackDays = 7) {
  const { startDate, endDate } = query;
  const start = startDate && endDate
    ? momentTz.tz(startDate, "YYYY-MM-DD", REPORT_TZ).startOf("day")
    : momentTz.tz(REPORT_TZ).subtract(fallbackDays - 1, "days").startOf("day");
  const end = startDate && endDate
    ? momentTz.tz(endDate, "YYYY-MM-DD", REPORT_TZ).endOf("day")
    : momentTz.tz(REPORT_TZ).endOf("day");
  const days = Math.max(end.clone().startOf("day").diff(start.clone().startOf("day"), "days") + 1, 1);

  return {
    start,
    end,
    startDate: start.format("YYYY-MM-DD"),
    endDate: end.format("YYYY-MM-DD"),
    days,
  };
}

function pct(count, total) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

// "×3.4" / "×1,079" — readable where a percentage would read as +107,933.6%.
function formatMultiple(ratio) {
  const value = Number(ratio) || 0;
  return `×${value >= 10 ? formatCount(Math.round(value)) : Math.round(value * 10) / 10}`;
}

// `multiple` is carried alongside `pct` so a change of several orders of
// magnitude can be rendered as "×1,079" rather than a meaningless percentage.
function trend(current, previous) {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    pct: previous > 0 ? Math.round((delta / previous) * 1000) / 10 : (current > 0 ? null : 0),
    multiple: previous > 0 ? Math.round((current / previous) * 100) / 100 : null,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
  };
}

function emptyAttendanceRollup() {
  return {
    daily: [],
    attended: 0,
    logs: 0,
    checkinLogs: 0,
    checkoutLogs: 0,
    checkinEvents: 0,
    checkoutEvents: 0,
    events: 0,
  };
}

function emptyAccessRollup() {
  return {
    daily: [],
    logs: 0,
    unauthorizedLogs: 0,
    sessions: 0,
    unauthorized: 0,
    afterHoursUnauthorized: 0,
  };
}

/**
 * One row per calendar day in the window, with zero-filled gaps.
 *
 * Attendance figures (present / checked out / absent / check-in + check-out
 * logs) come only from Attendance; `unauthorizedAccess` comes only from the
 * access logs. They share the day key but are deliberately kept as separate
 * fields — they're different units and the chart plots them on separate axes.
 */
// Most recent day in the rollup that has at least one attendance log — the
// reference point for any "as of now" figure.
function latestActiveDay(dailyRows = []) {
  for (let i = dailyRows.length - 1; i >= 0; i--) {
    if (dailyRows[i].attended > 0) return dailyRows[i];
  }
  return null;
}

function fillSeries(range, attendanceRows = [], accessRows = [], totalEmployees = 0) {
  const attendanceByDate = new Map(attendanceRows.map((row) => [row.date, row]));
  const accessByDate = new Map(accessRows.map((row) => [row.date, row.unauthorized]));
  const series = [];

  for (let i = 0; i < range.days; i++) {
    const date = range.start.clone().add(i, "days").format("YYYY-MM-DD");
    const attendance = attendanceByDate.get(date) || {};
    const attended = attendance.attended || 0;
    series.push({
      date,
      employees: totalEmployees,
      attended,
      present: attendance.present || 0,
      checkedOut: attendance.checkedOut || 0,
      absentees: Math.max(totalEmployees - attended, 0),
      checkins: attendance.checkinLogs || 0,
      checkouts: attendance.checkoutLogs || 0,
      unauthorizedAccess: accessByDate.get(date) || 0,
    });
  }

  return series;
}

// Echoes back whichever range a widget actually queried — an explicit
// startDate/endDate when the caller passed one, otherwise the trailing
// `days` window — so responses never claim a `days` count that doesn't
// match a custom range the client selected.
function describeRange(req, fallbackDays) {
  const { startDate, endDate } = req.query;
  if (startDate && endDate) return { startDate, endDate };
  return { days: Number(req.query.days) || fallbackDays };
}

class AnalyticsService {
  /**
   * Builds the base { userId, timeOfIncident, nvrId?, channelId? } match for
   * every widget below. All Analytics data is scoped to the logged-in admin's
   * own incidents, same as every other dashboard-style aggregation.
   */
  async _buildBaseMatch(req, { days } = {}) {
    const data = req?.verified?.userData;
    const { startDate, endDate, nvrId, channelId, location } = req.query;

    const match = { userId: data.user_id.toString() };

    if (startDate && endDate) {
      match.timeOfIncident = {
        $gte: new Date(`${startDate}T00:00:00.000Z`),
        $lte: new Date(`${endDate}T23:59:59.999Z`),
      };
    } else {
      const rangeDays = Number(days) || DEFAULT_DAYS;
      match.timeOfIncident = {
        $gte: moment().subtract(rangeDays, "days").startOf("day").toDate(),
        $lte: moment().endOf("day").toDate(),
      };
    }

    if (nvrId) match.nvrId = { $in: toObjectIds(nvrId) };
    if (channelId) match.channelId = { $in: toObjectIds(channelId) };

    if (location) {
      const locations = Array.isArray(location) ? location : String(location).split(",").map((l) => l.trim());
      const nvrs = await NVR.find({ userId: data.user_id.toString(), location: { $in: locations } }).select("_id");
      const nvrIds = nvrs.map((n) => n._id);
      match.nvrId = match.nvrId ? { $in: match.nvrId.$in.filter((id) => nvrIds.some((n) => n.equals(id))) } : { $in: nvrIds };
    }

    return match;
  }

  async _buildAttendanceAnalyticsScope(req) {
    const data = req?.verified?.userData || {};
    const adminRawId = data.adminId || data.user_id;
    const adminId = new mongoose.Types.ObjectId(adminRawId);
    const userId = data.user_id?.toString();
    const { nvrId, channelId, location, department } = req.query;

    const locations = splitValues(location);
    const requestedNvrIds = toObjectIds(nvrId);
    const requestedChannelIds = toObjectIds(channelId);
    const departmentIds = toObjectIds(department);
    const hasNvrFilter = splitValues(nvrId).length > 0;
    const hasChannelFilter = splitValues(channelId).length > 0;
    const hasDepartmentFilter = splitValues(department).length > 0;

    let effectiveNvrIds = requestedNvrIds;
    let effectiveChannelIds = requestedChannelIds;
    let eventScopeEmpty = false;

    if ((hasNvrFilter && !requestedNvrIds.length) || (hasChannelFilter && !requestedChannelIds.length)) {
      eventScopeEmpty = true;
    }

    if (locations.length) {
      const nvrs = await NVR.find({
        userId,
        location: { $in: locations },
      }).select("_id").lean();
      const locationNvrIds = nvrs.map((nvr) => nvr._id);

      if (!locationNvrIds.length) {
        eventScopeEmpty = true;
      } else if (effectiveNvrIds.length) {
        effectiveNvrIds = effectiveNvrIds.filter((id) => locationNvrIds.some((nvrId) => nvrId.equals(id)));
        if (!effectiveNvrIds.length) eventScopeEmpty = true;
      } else {
        effectiveNvrIds = locationNvrIds;
      }
    }

    if (hasDepartmentFilter && !departmentIds.length) {
      eventScopeEmpty = true;
    } else if (departmentIds.length) {
      const departmentChannels = await Channel.find({
        userId,
        department: { $in: departmentIds },
      }).setOptions({ memberId: data.memberId }).select("_id").lean();
      const departmentChannelIds = departmentChannels.map((channel) => channel._id);

      if (!departmentChannelIds.length) {
        eventScopeEmpty = true;
      } else if (effectiveChannelIds.length) {
        effectiveChannelIds = effectiveChannelIds.filter((id) => departmentChannelIds.some((channelId) => channelId.equals(id)));
        if (!effectiveChannelIds.length) eventScopeEmpty = true;
      } else {
        effectiveChannelIds = departmentChannelIds;
      }
    }

    // The full roster is fetched once and the department filter applied in
    // memory, because the two sets are needed for different things:
    //   employeeIds — whose attendance is being reported on (department-scoped)
    //   rosterIds   — who counts as a *known* person on an access log. An
    //                 employee from another department is still authorized, so
    //                 classifying access against the department-scoped set
    //                 would brand them unauthorized.
    const roster = await AuthorizedUser.find({ adminId })
      .setOptions({ memberId: data.memberId })
      .select("_id departmentId")
      .lean();
    const rosterIds = roster.map((employee) => employee._id);
    const employeeIds = departmentIds.length
      ? roster
        .filter((employee) => employee.departmentId
          && departmentIds.some((id) => id.equals(employee.departmentId)))
        .map((employee) => employee._id)
      : rosterIds;

    return {
      adminId,
      employeeIds,
      rosterIds,
      totalEmployees: employeeIds.length,
      eventScopeEmpty,
      nvrIds: effectiveNvrIds,
      channelIds: effectiveChannelIds,
      filtersApplied: {
        location: locations,
        nvrId: requestedNvrIds.map((id) => id.toString()),
        channelId: requestedChannelIds.map((id) => id.toString()),
        department: departmentIds.map((id) => id.toString()),
      },
    };
  }

  _eventCameraMatch(scope) {
    const match = {};
    if (scope.nvrIds.length) match["events.nvr"] = { $in: scope.nvrIds };
    if (scope.channelIds.length) match["events.channel"] = { $in: scope.channelIds };
    return match;
  }

  /**
   * Every attendance number on this widget comes from here, in one pass.
   *
   * The unit is an *attendance log* — one (employee, day) row matched on
   * `createdAt` and bucketed in REPORT_TZ, exactly how the Attendance Logs page
   * defines a row. Present, absentees, check-in/check-out counts and the daily
   * series are all derived from that same set, so the KPI tiles, the event
   * strip and the chart can no longer disagree the way they did when the KPIs
   * windowed on `events.timestamp` and the log counts windowed on `createdAt`.
   *
   * `present` means the day's last event was a check-in (still inside); its
   * complement among attendees is `checkedOut`.
   */
  async _attendanceRollup(scope, range) {
    if (scope.eventScopeEmpty || !scope.employeeIds.length) return emptyAttendanceRollup();

    const cameraMatch = this._eventCameraMatch(scope);
    const cameraStages = Object.keys(cameraMatch).length ? [{ $match: cameraMatch }] : [];

    const rows = await Attendance.aggregate([
      {
        $match: {
          user: scope.adminId,
          employee: { $in: scope.employeeIds },
          createdAt: {
            $gte: range.start.toDate(),
            $lte: range.end.toDate(),
          },
        },
      },
      { $unwind: "$events" },
      ...cameraStages,
      {
        // One document per attendance log row. The last event of the day is
        // derived from $max timestamps per camera type rather than a $sort +
        // $last, so this never hits the aggregation sort memory limit.
        $group: {
          _id: {
            employee: "$employee",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: REPORT_TZ } },
          },
          lastCheckin: {
            $max: { $cond: [{ $eq: ["$events.cameraType", "checkin"] }, "$events.timestamp", null] },
          },
          lastCheckout: {
            $max: { $cond: [{ $eq: ["$events.cameraType", "checkout"] }, "$events.timestamp", null] },
          },
          checkins: { $sum: { $cond: [{ $eq: ["$events.cameraType", "checkin"] }, 1, 0] } },
          checkouts: { $sum: { $cond: [{ $eq: ["$events.cameraType", "checkout"] }, 1, 0] } },
          events: { $sum: 1 },
        },
      },
      {
        $addFields: {
          // Checked in and not checked out since — i.e. still inside.
          stillIn: {
            $and: [
              { $ne: ["$lastCheckin", null] },
              {
                $or: [
                  { $eq: ["$lastCheckout", null] },
                  { $gt: ["$lastCheckin", "$lastCheckout"] },
                ],
              },
            ],
          },
        },
      },
      {
        $facet: {
          daily: [
            {
              $group: {
                _id: "$_id.date",
                attended: { $sum: 1 },
                present: { $sum: { $cond: ["$stillIn", 1, 0] } },
                checkedOut: { $sum: { $cond: ["$stillIn", 0, 1] } },
                checkinLogs: { $sum: { $cond: [{ $gt: ["$checkins", 0] }, 1, 0] } },
                checkoutLogs: { $sum: { $cond: [{ $gt: ["$checkouts", 0] }, 1, 0] } },
              },
            },
            { $sort: { _id: 1 } },
            {
              $project: {
                _id: 0,
                date: "$_id",
                attended: 1,
                present: 1,
                checkedOut: 1,
                checkinLogs: 1,
                checkoutLogs: 1,
              },
            },
          ],
          totals: [
            {
              $group: {
                _id: null,
                logs: { $sum: 1 },
                checkinLogs: { $sum: { $cond: [{ $gt: ["$checkins", 0] }, 1, 0] } },
                checkoutLogs: { $sum: { $cond: [{ $gt: ["$checkouts", 0] }, 1, 0] } },
                checkinEvents: { $sum: "$checkins" },
                checkoutEvents: { $sum: "$checkouts" },
                events: { $sum: "$events" },
              },
            },
          ],
          // Distinct employees with at least one log in the window. The roster
          // minus this is the absentee count.
          attendees: [
            { $group: { _id: "$_id.employee" } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const facet = rows[0] || {};
    const totals = facet.totals?.[0] || {};

    return {
      ...emptyAttendanceRollup(),
      daily: facet.daily || [],
      attended: facet.attendees?.[0]?.count || 0,
      logs: totals.logs || 0,
      checkinLogs: totals.checkinLogs || 0,
      checkoutLogs: totals.checkoutLogs || 0,
      checkinEvents: totals.checkinEvents || 0,
      checkoutEvents: totals.checkoutEvents || 0,
      events: totals.events || 0,
    };
  }

  /**
   * The access-log side of the widget — the source for unauthorized access and
   * the security insights only, never for attendance.
   *
   * Classification is per **session** (one detection) rather than per document.
   * That is what pinned the old tile at a permanent 100%: a recognised employee
   * gets one document per day holding many sessions, while every unknown
   * detection creates a document of its own (see accesslogs.service, "For
   * Unknown people create new document"), so counting documents put a
   * per-detection numerator over a per-person-day denominator. Sessions put both
   * sides in the same unit and the percentage becomes meaningful.
   *
   * A session is unauthorized when its log isn't linked to anyone on the roster,
   * or when the detected name is one of the known "unknown" placeholders. The
   * roster is matched against scope.rosterIds rather than via $lookup — on a
   * collection this size the lookup was the most expensive stage here, and the
   * roster has already been loaded.
   */
  async _accessRollup(scope, range) {
    if (scope.eventScopeEmpty) return emptyAccessRollup();

    const sessionConditions = [];
    if (scope.nvrIds.length) sessionConditions.push({ $in: ["$$session.nvr", scope.nvrIds] });
    if (scope.channelIds.length) sessionConditions.push({ $in: ["$$session.channel", scope.channelIds] });

    const unauthorizedSession = {
      $or: [
        { $not: ["$knownUser"] },
        { $in: [{ $toLower: { $ifNull: ["$sessions.personName", ""] } }, UNKNOWN_ACCESS_NAMES] },
      ],
    };
    const sessionHour = { $hour: { date: "$sessions.timestamp", timezone: REPORT_TZ } };
    const afterHours = {
      $or: [
        { $lt: [sessionHour, AFTER_HOURS_END] },
        { $gt: [sessionHour, AFTER_HOURS_START] },
      ],
    };

    const rows = await OptimizedAccessLogs.aggregate([
      {
        $match: {
          admin: scope.adminId,
          createdAt: {
            $gte: range.start.toDate(),
            $lte: range.end.toDate(),
          },
        },
      },
      ...(sessionConditions.length ? [{
        $addFields: {
          sessions: {
            $filter: {
              input: "$sessions",
              as: "session",
              cond: { $and: sessionConditions },
            },
          },
        },
      }] : []),
      { $match: { "sessions.0": { $exists: true } } },
      {
        $addFields: {
          knownUser: {
            $and: [
              { $ne: [{ $ifNull: ["$userId", null] }, null] },
              { $in: ["$userId", scope.rosterIds] },
            ],
          },
        },
      },
      {
        $facet: {
          // Document-level counts, kept so "Access logs" still reconciles with
          // the total on the Access Logs page, which paginates documents.
          documents: [
            {
              $group: {
                _id: null,
                logs: { $sum: 1 },
                unauthorizedLogs: { $sum: { $cond: [{ $not: ["$knownUser"] }, 1, 0] } },
              },
            },
          ],
          // Bucketed on each session's own timestamp rather than the parent
          // document's createdAt, so a detection lands on the day it happened.
          // Range totals are summed from these rows to avoid a second $unwind.
          daily: [
            { $unwind: "$sessions" },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$sessions.timestamp", timezone: REPORT_TZ },
                },
                sessions: { $sum: 1 },
                unauthorized: { $sum: { $cond: [unauthorizedSession, 1, 0] } },
                afterHoursUnauthorized: {
                  $sum: { $cond: [{ $and: [unauthorizedSession, afterHours] }, 1, 0] },
                },
              },
            },
            { $sort: { _id: 1 } },
            {
              $project: {
                _id: 0,
                date: "$_id",
                sessions: 1,
                unauthorized: 1,
                afterHoursUnauthorized: 1,
              },
            },
          ],
        },
      },
    ]);

    const facet = rows[0] || {};
    const documents = facet.documents?.[0] || {};
    const daily = facet.daily || [];

    return {
      ...emptyAccessRollup(),
      daily,
      logs: documents.logs || 0,
      unauthorizedLogs: documents.unauthorizedLogs || 0,
      sessions: daily.reduce((sum, row) => sum + row.sessions, 0),
      unauthorized: daily.reduce((sum, row) => sum + row.unauthorized, 0),
      afterHoursUnauthorized: daily.reduce((sum, row) => sum + row.afterHoursUnauthorized, 0),
    };
  }

  /**
   * Attendance insights are derived purely from the attendance rollup, security
   * insights purely from the access rollup — the `group` field says which, so
   * the UI can keep the two kinds of finding visually apart.
   */
  _attendanceAnomalies({ attendance, previousAttendance, access, previousAccess, totalEmployees }) {
    const attendedPct = pct(attendance.attended, totalEmployees);
    const absentPct = pct(Math.max(totalEmployees - attendance.attended, 0), totalEmployees);
    const unauthorizedRate = pct(access.unauthorized, access.sessions);
    const anomalies = [];

    if (totalEmployees > 0 && attendance.logs === 0) {
      anomalies.push({
        type: "no_attendance_activity",
        group: "attendance",
        severity: "high",
        title: "No attendance activity",
        message: "No check-in or check-out was recorded in any attendance log for the selected range.",
      });
    }

    if (totalEmployees > 0 && absentPct >= 25) {
      anomalies.push({
        type: "high_absence",
        group: "attendance",
        severity: absentPct >= 50 ? "critical" : "medium",
        title: "High absentee rate",
        message: `${absentPct}% of employees (${formatCount(Math.max(totalEmployees - attendance.attended, 0))} of ${formatCount(totalEmployees)}) have no attendance log in the selected range.`,
      });
    }

    if (attendance.logs > 0 && attendance.checkoutLogs < attendance.checkinLogs / 2) {
      anomalies.push({
        type: "missing_checkouts",
        group: "attendance",
        severity: "medium",
        title: "Check-outs not being recorded",
        message: `${formatCount(attendance.checkinLogs)} attendance logs have a check-in but only ${formatCount(attendance.checkoutLogs)} have a check-out.`,
      });
    }

    if (previousAttendance.logs > 0 && attendance.logs > previousAttendance.logs * 2) {
      anomalies.push({
        type: "attendance_volume_spike",
        group: "attendance",
        severity: "medium",
        title: "Attendance volume spike",
        message: `Attendance logs rose from ${formatCount(previousAttendance.logs)} to ${formatCount(attendance.logs)} versus the previous period.`,
      });
    }

    if (access.unauthorized > 0 && unauthorizedRate >= 10) {
      anomalies.push({
        type: "high_unauthorized_rate",
        group: "security",
        severity: unauthorizedRate >= 25 ? "critical" : "high",
        title: "High unauthorized access rate",
        message: `${unauthorizedRate}% of access events (${formatCount(access.unauthorized)} of ${formatCount(access.sessions)}) are from unknown or unauthorized people.`,
      });
    }

    if (
      access.unauthorized >= 3 &&
      previousAccess.unauthorized > 0 &&
      access.unauthorized >= previousAccess.unauthorized * 1.5
    ) {
      anomalies.push({
        type: "unauthorized_spike",
        group: "security",
        severity: "high",
        title: "Unauthorized access spike",
        message: `Unauthorized access events rose ${formatMultiple(access.unauthorized / previousAccess.unauthorized)} versus the previous period — ${formatCount(previousAccess.unauthorized)} to ${formatCount(access.unauthorized)}.`,
      });
    }

    if (access.afterHoursUnauthorized > 0) {
      anomalies.push({
        type: "after_hours_unauthorized",
        group: "security",
        severity: "high",
        title: "After-hours unauthorized access",
        message: `${formatCount(access.afterHoursUnauthorized)} unauthorized access event${access.afterHoursUnauthorized === 1 ? "" : "s"} occurred outside ${String(AFTER_HOURS_END).padStart(2, "0")}:00-${AFTER_HOURS_START}:00.`,
      });
    }

    if (totalEmployees > 0 && attendedPct >= 95 && access.unauthorized === 0) {
      anomalies.push({
        type: "healthy_attendance",
        group: "attendance",
        severity: "info",
        title: "Attendance activity normal",
        message: "Attendance coverage is high and no unauthorized access events were detected.",
      });
    }

    return anomalies;
  }

  async attendanceSummary(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.attendanceSummary(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const range = getDateWindow(req.query, 7);
      const previousRange = {
        start: range.start.clone().subtract(range.days, "days"),
        end: range.start.clone().subtract(1, "millisecond"),
        days: range.days,
      };
      previousRange.startDate = previousRange.start.format("YYYY-MM-DD");
      previousRange.endDate = previousRange.end.format("YYYY-MM-DD");

      const scope = await this._buildAttendanceAnalyticsScope(req);
      const [attendance, previousAttendance, access, previousAccess] = await Promise.all([
        this._attendanceRollup(scope, range),
        this._attendanceRollup(scope, previousRange),
        this._accessRollup(scope, range),
        this._accessRollup(scope, previousRange),
      ]);

      const totalEmployees = scope.totalEmployees;
      const absentCount = Math.max(totalEmployees - attendance.attended, 0);
      const previousAbsentCount = Math.max(totalEmployees - previousAttendance.attended, 0);

      // "Currently present" is a point-in-time figure, so it is read off the
      // most recent day that actually has attendance logs rather than off the
      // whole window — over a 30-day range the old whole-window reading meant
      // "last seen checking in at some point this month", which is not the same
      // thing and is what made this tile read 4 out of 91.
      const latestDay = latestActiveDay(attendance.daily);
      const previousLatestDay = latestActiveDay(previousAttendance.daily);
      const presentCount = latestDay?.present || 0;

      const series = fillSeries(range, attendance.daily, access.daily, totalEmployees);
      const anomalies = this._attendanceAnomalies({
        attendance,
        previousAttendance,
        access,
        previousAccess,
        totalEmployees,
      });

      return res.status(200).json(Response.userSuccessResp("Attendance analytics fetched successfully", {
        range: {
          startDate: range.startDate,
          endDate: range.endDate,
          days: range.days,
        },
        comparison: {
          available: previousAttendance.logs > 0 || previousAccess.sessions > 0,
          previousRange: {
            startDate: previousRange.startDate,
            endDate: previousRange.endDate,
            days: previousRange.days,
          },
        },
        filtersApplied: scope.filtersApplied,
        // Attendance-sourced totals first, then the single access-sourced one.
        totals: {
          employees: {
            count: totalEmployees,
            pct: totalEmployees > 0 ? 100 : 0,
            trend: trend(totalEmployees, totalEmployees),
          },
          attended: {
            count: attendance.attended,
            pct: pct(attendance.attended, totalEmployees),
            trend: trend(attendance.attended, previousAttendance.attended),
          },
          present: {
            count: presentCount,
            pct: pct(presentCount, totalEmployees),
            asOf: latestDay?.date || null,
            trend: trend(presentCount, previousLatestDay?.present || 0),
          },
          checkedOut: {
            count: latestDay?.checkedOut || 0,
            pct: pct(latestDay?.checkedOut || 0, totalEmployees),
            asOf: latestDay?.date || null,
            trend: trend(latestDay?.checkedOut || 0, previousLatestDay?.checkedOut || 0),
          },
          absentees: {
            count: absentCount,
            pct: pct(absentCount, totalEmployees),
            trend: trend(absentCount, previousAbsentCount),
          },
          unauthorizedAccess: {
            count: access.unauthorized,
            pct: pct(access.unauthorized, access.sessions),
            trend: trend(access.unauthorized, previousAccess.unauthorized),
          },
          accessEvents: {
            count: access.sessions,
            pct: access.sessions > 0 ? 100 : 0,
            trend: trend(access.sessions, previousAccess.sessions),
          },
          accessLogs: {
            count: access.logs,
            pct: access.logs > 0 ? 100 : 0,
            trend: trend(access.logs, previousAccess.logs),
          },
        },
        eventCounts: {
          // From Attendance only.
          attendanceLogs: attendance.logs,
          checkinLogs: attendance.checkinLogs,
          checkoutLogs: attendance.checkoutLogs,
          checkinEvents: attendance.checkinEvents,
          checkoutEvents: attendance.checkoutEvents,
          attendanceEvents: attendance.events,
          // From the access logs only. `accessLogs` counts documents (what the
          // Access Logs page paginates); `accessEvents` counts sessions, the
          // unit the unauthorized figures are measured in.
          accessLogs: access.logs,
          accessEvents: access.sessions,
          unauthorizedAccessLogs: access.unauthorized,
          afterHoursUnknownLogs: access.afterHoursUnauthorized,
          afterHoursUnauthorized: access.afterHoursUnauthorized,
          rawAccessSessions: access.sessions,
        },
        series,
        anomalies,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch attendance analytics.", error.message));
    }
  }

  // Detection Volume · N days (or an explicit startDate/endDate) — total incident count per calendar day.
  async detectionVolume(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.detectionVolume(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const { startDate, endDate } = req.query;
      const days = Number(req.query.days) || DEFAULT_DAYS;
      const match = await this._buildBaseMatch(req, { days });

      const rows = await Incident.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timeOfIncident" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

      const byDate = new Map(rows.map((r) => [r._id, r.count]));
      // Series window mirrors whatever _buildBaseMatch actually filtered on —
      // an explicit range when given, otherwise the trailing `days` window.
      const rangeStart = startDate && endDate ? moment(startDate).startOf("day") : moment().subtract(days - 1, "days").startOf("day");
      const rangeEnd = startDate && endDate ? moment(endDate).startOf("day") : moment().startOf("day");
      const spanDays = rangeEnd.diff(rangeStart, "days") + 1;

      const series = [];
      for (let i = 0; i < spanDays; i++) {
        const date = rangeStart.clone().add(i, "days").format("YYYY-MM-DD");
        series.push({ date, count: byDate.get(date) || 0 });
      }

      return res.status(200).json(Response.userSuccessResp("Detection volume fetched successfully", {
        days: startDate && endDate ? spanDays : days,
        total: series.reduce((sum, d) => sum + d.count, 0),
        series,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch detection volume.", error.message));
    }
  }

  // Share by Engine — incident counts grouped by incidentType, with percentages.
  async engineShare(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.engineShare(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const days = Number(req.query.days) || DEFAULT_DAYS;
      const match = await this._buildBaseMatch(req, { days });

      const rows = await Incident.aggregate([
        { $match: match },
        { $group: { _id: "$incidentType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);

      const total = rows.reduce((sum, r) => sum + r.count, 0);
      const engines = rows.map((r) => ({
        engine: r._id,
        count: r.count,
        pct: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      }));

      return res.status(200).json(Response.userSuccessResp("Engine share fetched successfully", {
        ...describeRange(req, DEFAULT_DAYS),
        total,
        engines,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch engine share.", error.message));
    }
  }

  // Top Cameras by Events — incident counts grouped by channel, ranked.
  async topCameras(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.topCameras(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const days = Number(req.query.days) || DEFAULT_DAYS;
      const limit = Number(req.query.limit) || DEFAULT_TOP_CAMERAS_LIMIT;
      const match = await this._buildBaseMatch(req, { days });

      const rows = await Incident.aggregate([
        { $match: match },
        { $group: { _id: "$channelId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: "channels",
            localField: "_id",
            foreignField: "_id",
            as: "channel",
          },
        },
        { $unwind: { path: "$channel", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            channelId: "$_id",
            name: { $ifNull: ["$channel.name", "Unknown Camera"] },
            count: 1,
          },
        },
      ]);

      const maxCount = rows.reduce((max, r) => Math.max(max, r.count), 0);
      const cameras = rows.map((r) => ({ ...r, pct: maxCount > 0 ? Math.round((r.count / maxCount) * 100) : 0 }));

      return res.status(200).json(Response.userSuccessResp("Top cameras fetched successfully", {
        ...describeRange(req, DEFAULT_DAYS),
        cameras,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch top cameras.", error.message));
    }
  }

  // Activity Heatmap — incident counts grouped by ISO day-of-week x hour-of-day (UTC).
  async activityHeatmap(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.activityHeatmap(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const days = Number(req.query.days) || 7;
      const match = await this._buildBaseMatch(req, { days });

      const rows = await Incident.aggregate([
        { $match: match },
        {
          $group: {
            _id: { day: { $isoDayOfWeek: "$timeOfIncident" }, hour: { $hour: "$timeOfIncident" } },
            count: { $sum: 1 },
          },
        },
      ]);

      const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
      let max = 0;
      rows.forEach((r) => {
        const dayIdx = r._id.day - 1; // isoDayOfWeek: 1=Mon..7=Sun
        const hourIdx = r._id.hour;
        grid[dayIdx][hourIdx] = r.count;
        max = Math.max(max, r.count);
      });

      return res.status(200).json(Response.userSuccessResp("Activity heatmap fetched successfully", {
        ...describeRange(req, 7),
        dayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        max,
        grid,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch activity heatmap.", error.message));
    }
  }

  // Detections by Hour — today's (or a given date's) incident counts bucketed by hour (UTC).
  async detectionsByHour(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.detectionsByHour(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const data = req?.verified?.userData;
      const date = req.query.date || moment().format("YYYY-MM-DD");
      const match = {
        userId: data.user_id.toString(),
        timeOfIncident: {
          $gte: new Date(`${date}T00:00:00.000Z`),
          $lte: new Date(`${date}T23:59:59.999Z`),
        },
      };
      if (req.query.nvrId) match.nvrId = { $in: toObjectIds(req.query.nvrId) };
      if (req.query.channelId) match.channelId = { $in: toObjectIds(req.query.channelId) };

      const rows = await Incident.aggregate([
        { $match: match },
        { $group: { _id: { $hour: "$timeOfIncident" }, count: { $sum: 1 } } },
      ]);

      const hours = Array.from({ length: 24 }, () => 0);
      rows.forEach((r) => { hours[r._id] = r.count; });

      return res.status(200).json(Response.userSuccessResp("Detections by hour fetched successfully", {
        date,
        total: hours.reduce((sum, c) => sum + c, 0),
        hours,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch detections by hour.", error.message));
    }
  }

  // Site Performance — incident counts grouped by NVR location.
  async sitePerformance(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.sitePerformance(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const data = req?.verified?.userData;
      const days = Number(req.query.days) || DEFAULT_DAYS;
      const match = await this._buildBaseMatch(req, { days });

      const rows = await Incident.aggregate([
        { $match: match },
        { $group: { _id: "$nvrId", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "nvrs",
            localField: "_id",
            foreignField: "_id",
            as: "nvr",
          },
        },
        { $unwind: { path: "$nvr", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ["$nvr.location", "Unknown"] },
            events: { $sum: "$count" },
          },
        },
        { $sort: { events: -1 } },
      ]);

      const sites = rows.map((r) => ({ site: r._id, events: r.events }));

      return res.status(200).json(Response.userSuccessResp("Site performance fetched successfully", {
        ...describeRange(req, DEFAULT_DAYS),
        sites,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch site performance.", error.message));
    }
  }

  // Response Funnel — Detected -> Reported -> Resolved, using the incident fields that actually exist.
  async responseFunnel(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.responseFunnel(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const days = Number(req.query.days) || DEFAULT_DAYS;
      const match = await this._buildBaseMatch(req, { days });

      const [detected, reported, resolved] = await Promise.all([
        Incident.countDocuments(match),
        Incident.countDocuments({ ...match, "report.status": true }),
        Incident.countDocuments({ ...match, resolved: true }),
      ]);

      const pct = (n) => (detected > 0 ? Math.round((n / detected) * 100) : 0);

      return res.status(200).json(Response.userSuccessResp("Response funnel fetched successfully", {
        ...describeRange(req, DEFAULT_DAYS),
        stages: [
          { label: "Detected", count: detected, pct: 100 },
          { label: "Reported", count: reported, pct: pct(reported) },
          { label: "Resolved", count: resolved, pct: pct(resolved) },
        ],
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch response funnel.", error.message));
    }
  }

  // Overview KPIs — total detections, resolved rate, active cameras, busiest site.
  // Replaces the KPI row's previously-mocked False Positive Rate / Mean Response
  // Time / Platform Uptime tiles, none of which have any backing data source.
  async overview(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.overview(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const data = req?.verified?.userData;
      const days = Number(req.query.days) || DEFAULT_DAYS;
      const match = await this._buildBaseMatch(req, { days });

      const [totalDetections, resolvedCount, activeCameras, siteRows] = await Promise.all([
        Incident.countDocuments(match),
        Incident.countDocuments({ ...match, resolved: true }),
        Channel.countDocuments({ userId: data.user_id.toString(), control: 1 }),
        Incident.aggregate([
          { $match: match },
          { $group: { _id: "$nvrId", count: { $sum: 1 } } },
          {
            $lookup: {
              from: "nvrs",
              localField: "_id",
              foreignField: "_id",
              as: "nvr",
            },
          },
          { $unwind: { path: "$nvr", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { $ifNull: ["$nvr.location", "Unknown"] },
              events: { $sum: "$count" },
            },
          },
          { $sort: { events: -1 } },
          { $limit: 1 },
        ]),
      ]);

      const resolvedRate = totalDetections > 0 ? Math.round((resolvedCount / totalDetections) * 1000) / 10 : 0;
      const busiestSite = siteRows[0] || null;

      return res.status(200).json(Response.userSuccessResp("Analytics overview fetched successfully", {
        ...describeRange(req, DEFAULT_DAYS),
        totalDetections,
        resolvedRate,
        activeCameras,
        busiestSite: busiestSite ? { site: busiestSite._id, events: busiestSite.events } : null,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch analytics overview.", error.message));
    }
  }

  // Peak Activity — busiest hour and busiest day-of-week over the window, from the
  // same day x hour aggregation used by the heatmap. Replaces the Model Performance
  // card (precision/recall/F1/mAP), which has no backing data source at all.
  async peakActivity(req, res, _next) {
    try {
      const { error } = AnalyticsValidator.peakActivity(req.query);
      if (error) return res.send(Response.validationFailResp(error.message, "Validation Failed!"));

      const days = Number(req.query.days) || DEFAULT_DAYS;
      const match = await this._buildBaseMatch(req, { days });

      const [byHour, byDay] = await Promise.all([
        Incident.aggregate([
          { $match: match },
          { $group: { _id: { $hour: "$timeOfIncident" }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ]),
        Incident.aggregate([
          { $match: match },
          { $group: { _id: { $isoDayOfWeek: "$timeOfIncident" }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ]),
      ]);

      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const peakHourNumber = byHour[0]?._id;
      const peakDayNumber = byDay[0]?._id;

      const [peakHourDates, peakDayDates] = await Promise.all([
        peakHourNumber == null ? [] : Incident.aggregate([
          { $match: { ...match, $expr: { $eq: [{ $hour: "$timeOfIncident" }, peakHourNumber] } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timeOfIncident" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: "$_id", count: 1 } },
        ]),
        peakDayNumber == null ? [] : Incident.aggregate([
          { $match: { ...match, $expr: { $eq: [{ $isoDayOfWeek: "$timeOfIncident" }, peakDayNumber] } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timeOfIncident" } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: "$_id", count: 1 } },
        ]),
      ]);

      const peakHour = byHour[0] ? { hour: peakHourNumber, count: byHour[0].count, dates: peakHourDates } : null;
      const peakDay = byDay[0] ? { day: dayNames[peakDayNumber - 1], count: byDay[0].count, dates: peakDayDates } : null;

      return res.status(200).json(Response.userSuccessResp("Peak activity fetched successfully", {
        ...describeRange(req, DEFAULT_DAYS),
        peakHour,
        peakDay,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch peak activity.", error.message));
    }
  }
}

export default new AnalyticsService();
