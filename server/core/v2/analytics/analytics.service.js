import mongoose from "mongoose";
import moment from "moment";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import { Incident } from "../incidents/incidents.model.js";
import NVR from "../NVR/nvr.model.js";
import Channel from "../channels/channels.model.js";
import AnalyticsValidator from "./analytics.validate.js";

const DEFAULT_DAYS = 30;
const DEFAULT_TOP_CAMERAS_LIMIT = 5;

function toObjectIds(value) {
  const ids = Array.isArray(value) ? value : String(value).split(",").map((v) => v.trim());
  return ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
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
      const peakHour = byHour[0] ? { hour: byHour[0]._id, count: byHour[0].count } : null;
      const peakDay = byDay[0] ? { day: dayNames[byDay[0]._id - 1], count: byDay[0].count } : null;

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
