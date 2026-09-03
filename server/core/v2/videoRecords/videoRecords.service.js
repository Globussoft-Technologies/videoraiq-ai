import mongoose from "mongoose";
import momentTz from "moment-timezone";
import config from "config";
import videoRecordModel from "./videoRecords.model.js";
import pythonService from "../../../services/python.service.js";
import { DETECTION_TYPES, TYPE_MAP } from "../../../constants/detectionTypes.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import authService from "../Auth/auth.service.js";
import adminModel from "../admin/admin.model.js";
import { Incident } from "../incidents/incidents.model.js";
import OptimizedAccessLogs from "../accesslogs/newAccessLogs.model.js";
import { sendPayloadToUser } from "../../../socket.js";

const DETECTION_KEYS = Object.keys(DETECTION_TYPES);

/**
 * Face Recognition is the one detection whose demo events are not incidents —
 * they land in the access logs as attendance sessions. Every other setting type
 * resolves to an `incidentType` through TYPE_MAP and is counted off `incidents`.
 *
 * Resolved from the constants rather than hardcoded: this key has already been
 * renamed once (attendanceSettings -> faceAuthenticationSettings), and a stale
 * name here fails silently in the worst way — Face Recognition would be treated
 * as an incident type and report zero events forever, because there is no
 * matching incident discriminator to notice the mistake.
 */
const ATTENDANCE_SETTING_TYPE =
  ["faceAuthenticationSettings", "attendanceSettings"].find((key) =>
    DETECTION_KEYS.includes(key)
  ) || "faceAuthenticationSettings";

// Renamed keys a caller may still be sending. Accepted on input and resolved to
// the current key so an older client does not get "Unknown detection type".
const LEGACY_SETTING_ALIASES = { attendanceSettings: ATTENDANCE_SETTING_TYPE };

/**
 * TYPE_MAP entries that do not name a real incident discriminator.
 *
 * TYPE_MAP says tableOccupancyDetectionSettings -> "tableOccupancySettings",
 * but incidents.model.js registers the discriminator as
 * "tableOccupancyDetection". Matching on the TYPE_MAP value would quietly
 * return zero events for Table Occupancy forever. Corrected here rather than in
 * the constant because TYPE_MAP also feeds DetectionSetting.detectionType (a
 * persisted field) and the DS detector naming, so changing it would rewrite
 * meaning for existing rows — that is a separate migration, not this endpoint's
 * call to make.
 */
const INCIDENT_TYPE_OVERRIDES = {
  tableOccupancyDetectionSettings: "tableOccupancyDetection",
};

// settingType (what the Live Demo UI and the LiveDemo.detections map use)
// -> incidentType (what the incidents collection is keyed on). Attendance is
// excluded because it has no incident counterpart.
const INCIDENT_TYPE_BY_SETTING = Object.fromEntries(
  DETECTION_KEYS.filter((key) => key !== ATTENDANCE_SETTING_TYPE).map((key) => [
    key,
    INCIDENT_TYPE_OVERRIDES[key] || TYPE_MAP[key] || key,
  ])
);

const SETTING_BY_INCIDENT_TYPE = Object.fromEntries(
  Object.entries(INCIDENT_TYPE_BY_SETTING).map(([setting, incidentType]) => [incidentType, setting])
);

// Incidents store 0-100 (ConfidenceScoreInPercentage); access-log sessions store
// whatever DS sent, which is a 0-1 ratio for the face matcher. Both averages end
// up in the same tile, so normalize to a percentage inside the aggregation.
const confidencePercentExpr = (field) => ({
  $let: {
    vars: { c: { $ifNull: [field, 0] } },
    in: { $cond: [{ $lte: ["$$c", 1] }, { $multiply: ["$$c", 100] }, "$$c"] },
  },
});

const confidenceCountExpr = (field) => ({ $cond: [{ $gt: [{ $ifNull: [field, 0] }, 0] }, 1, 0] });

const DEFAULT_REPORT_TZ = "Asia/Kolkata";

const splitCsv = (value) =>
  (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((v) => String(v).trim())
    .filter(Boolean);

const round1 = (num) => Math.round(num * 10) / 10;

// Keep only known detection keys with boolean values; drop everything else.
const sanitizeDetections = (detections = {}) => {
  const clean = {};
  for (const key of DETECTION_KEYS) {
    if (typeof detections[key] === "boolean") clean[key] = detections[key];
  }
  return clean;
};

// Keep only known detection keys with numeric { runs, events }; drop everything else.
const sanitizeByDetection = (byDetection = {}) => {
  const clean = {};
  for (const key of DETECTION_KEYS) {
    const entry = byDetection[key];
    if (!entry) continue;
    const stats = {};
    if (typeof entry.runs === "number") stats.runs = entry.runs;
    if (typeof entry.events === "number") stats.events = entry.events;
    if (Object.keys(stats).length) clean[key] = stats;
  }
  return clean;
};

// The video-process service fetches source_url directly, so a stored relative
// path ("uploads/videos/x.mp4") must be prefixed with the public media domain.
// Override with config key MediaBaseUrl; defaults to the backend domain.
const mediaBaseUrl = () =>
  String(
    config.has("ImageView")
      ? config.get("ImageView")
      : `${config.get("ImageView")}`
  ).replace(/\/+$/, "");

const toAbsoluteMediaUrl = (p) =>
  /^https?:\/\//i.test(String(p || ""))
    ? String(p)
    : `${mediaBaseUrl()}/${String(p || "").replace(/^\/+/, "")}`;

class VideoRecordsService {
  async getVideoRecords(req, res, _next) {
    try {
      const { id, skip = 0, limit = 20 } = req.query;
      const { adminId } = req?.verified?.userData || {};
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId in session"));
      }
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(Response.userFailResp("Invalid id"));
      }

      // Scoped to the session admin — same ownership rule as updateVideoRecord.
      const filter = { adminId };
      if (id) filter._id = id;

      const [records, total] = await Promise.all([
        videoRecordModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(Math.min(Number(limit) || 20, 100)),
        videoRecordModel.countDocuments(filter),
      ]);

      return res
        .status(200)
        .json(Response.userSuccessResp("Video records fetched", { records, total }));
    } catch (error) {
      logger.error("Error fetching video records:", error);
      return res.status(500).json(Response.errorResp("Internal server error"));
    }
  }

  async getSessionAnalytics(req, res, _next) {
    try {
      const { id } = req.params;
      const { adminId } = req?.verified?.userData || {};
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId in session"));
      }
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(Response.userFailResp("Invalid id"));
      }

      const record = await videoRecordModel
        .findOne({ _id: id, adminId })
        .select("sessionAnalytics");
      if (!record) {
        return res.status(404).json(Response.notFoundResp("Video record not found"));
      }

      // The model defaults every detection type to { runs: 0, events: 0 };
      // the panel only shows tested ones, so drop the all-zero entries.
      const analytics = record.sessionAnalytics?.toObject?.() || record.sessionAnalytics || {};
      const byDetection = {};
      for (const [key, stats] of Object.entries(analytics.byDetection || {})) {
        if (stats?.runs || stats?.events) byDetection[key] = stats;
      }

      return res.status(200).json(
        Response.userSuccessResp("Session analytics fetched", {
          ...analytics,
          byDetection,
        })
      );
    } catch (error) {
      logger.error("Error fetching session analytics:", error);
      return res.status(500).json(Response.errorResp("Internal server error"));
    }
  }

  /**
   * Live Demo analytics for one admin, optionally narrowed to a detection type.
   *
   * This is the admin-wide counterpart to getSessionAnalytics above, which only
   * reports one LiveDemo record and only reports what DS has pushed into
   * `sessionAnalytics`. Those stored counters are written by the DS team through
   * the update API and are still zero while a clip is being processed, so the
   * numbers here are DERIVED from the events themselves and the stored counters
   * are only reported alongside, for comparison.
   *
   * Where the data lives — all in the one `videora` database, so this is three
   * aggregations that could be joined but are deliberately not (each has its own
   * index-friendly match, and $lookup across them would scan far more):
   *
   *   runs    LiveDemo   { adminId, detections.<settingType>: true }
   *   events  incidents  { userId: admin.user_id, liveDemoData: true, incidentType }
   *   events  optimizedaccesslogs { admin: adminId, liveDemoData: true }  <- Face
   *           Recognition only; attendance demo hits are access-log sessions,
   *           not incidents, which is why they need their own pass.
   *
   * `liveDemoData: true` is the flag that separates demo data from real tenant
   * data on both event collections; it is never inferred, always matched.
   *
   * POST rather than GET because the detection filter is a list, matching the
   * other list-with-filters reads in this codebase (POST /incidents,
   * POST /accessLogs/get) — all of them read-only, all behind viewAccessCheck.
   */
  async getLiveDemoAnalytics(req, res, _next) {
    try {
      const {
        // The detections to report on. Send one, send several, or omit the
        // field entirely to get every detection the admin has demoed.
        detectionTypes,
        settingType,
        search,
        startDate,
        endDate,
      } = req.body || {};
      const { adminId } = req?.verified?.userData || {};

      if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
        return res.status(400).json(Response.userFailResp("Missing or invalid adminId in session"));
      }

      // Accepts an array (the documented shape) or a comma-separated string, and
      // `settingType` as an alias, so a caller sending either spelling works.
      // Renamed keys are mapped forward before validation.
      const requestedTypes = [
        ...new Set(
          [...splitCsv(detectionTypes), ...splitCsv(settingType)].map(
            (type) => LEGACY_SETTING_ALIASES[type] || type
          )
        ),
      ];
      const unknown = requestedTypes.filter((type) => !DETECTION_KEYS.includes(type));
      if (unknown.length) {
        return res
          .status(400)
          .json(Response.userFailResp(`Unknown detection type: ${unknown.join(", ")}`));
      }

      // Free-text narrowing over the detection's display name and its key, so
      // "face" finds attendanceSettings and "vehicle" finds all three vehicle
      // engines. It resolves to a set of types and then narrows exactly like an
      // explicit detectionTypes list, which keeps the tiles consistent with the
      // rows underneath them — a search that filtered only the breakdown would
      // leave the totals describing detections the caller cannot see.
      const searchTerm = typeof search === "string" ? search.trim().toLowerCase() : "";
      let effectiveTypes = requestedTypes;
      let searchMatchedNothing = false;
      if (searchTerm) {
        const matches = DETECTION_KEYS.filter(
          (key) =>
            key.toLowerCase().includes(searchTerm) ||
            String(DETECTION_TYPES[key] || "").toLowerCase().includes(searchTerm)
        );
        effectiveTypes = requestedTypes.length
          ? requestedTypes.filter((type) => matches.includes(type))
          : matches;
        // An empty intersection means "nothing matched", never "everything".
        searchMatchedNothing = effectiveTypes.length === 0;
      }

      // Step 1 — resolve the admin. user_id is what the incidents collection is
      // scoped by (it carries no adminId of its own), so this lookup is load
      // bearing, not just a validation.
      const admin = await adminModel.findById(adminId).select("user_id timezone").lean();
      if (!admin) {
        return res.status(404).json(Response.notFoundResp("Admin not found"));
      }
      const adminObjectId = new mongoose.Types.ObjectId(adminId);
      const ownerUserId = admin.user_id?.toString();
      const tz = admin.timezone || DEFAULT_REPORT_TZ;

      // Optional YYYY-MM-DD window, bounded in the admin's own timezone the way
      // every other report in this codebase does it.
      let from = null;
      let to = null;
      if (startDate && endDate) {
        from = momentTz.tz(startDate, "YYYY-MM-DD", tz).startOf("day").toDate();
        to = momentTz.tz(endDate, "YYYY-MM-DD", tz).endOf("day").toDate();
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          return res
            .status(400)
            .json(Response.userFailResp("startDate and endDate must be YYYY-MM-DD"));
        }
      }
      const dateWindow = (field) => (from && to ? { [field]: { $gte: from, $lte: to } } : {});

      // A search that matched no detection is an empty result, not an unfiltered
      // one. Answered here rather than by running three aggregations whose
      // filters would collapse back to "everything".
      if (searchMatchedNothing) {
        return res.status(200).json(
          Response.userSuccessResp("Live demo analytics fetched", {
            scope: { adminId: adminObjectId, settingTypes: [], search, timezone: tz, from, to },
            demosRun: 0,
            eventsDetected: 0,
            avgConfidence: 0,
            detectionsTested: 0,
            byDetection: [],
            firstRunAt: null,
            lastRunAt: null,
            reportedByDs: { demosRun: 0, eventsDetected: 0 },
          })
        );
      }

      // Step 2/3 — the admin's demo records, narrowed to the requested detection.
      // A record counts as a "run" of a detection when that detection was enabled
      // on it, which is exactly what the process call sends to DS.
      const recordMatch = { adminId: adminObjectId, ...dateWindow("createdAt") };
      if (effectiveTypes.length === 1) {
        recordMatch[`detections.${effectiveTypes[0]}`] = true;
      } else if (effectiveTypes.length > 1) {
        recordMatch.$or = effectiveTypes.map((type) => ({ [`detections.${type}`]: true }));
      }

      // Events. Attendance is only queried when it is in scope, and the incident
      // pass is skipped entirely when the only requested type is attendance —
      // or when the admin has no user_id, since matching incidents on an
      // undefined userId would silently select every ownerless row.
      const incidentTypes = !ownerUserId
        ? []
        : (effectiveTypes.length ? effectiveTypes : DETECTION_KEYS)
            .filter((type) => INCIDENT_TYPE_BY_SETTING[type])
            .map((type) => INCIDENT_TYPE_BY_SETTING[type]);
      const wantsAttendance =
        !effectiveTypes.length || effectiveTypes.includes(ATTENDANCE_SETTING_TYPE);

      const incidentMatch = {
        userId: ownerUserId,
        liveDemoData: true,
        incidentType: { $in: incidentTypes },
        ...dateWindow("timeOfIncident"),
      };

      /**
       * Access-log events are windowed on the session's OWN timestamp — the
       * instant DS says the face was seen — not on the row's `createdAt`. That
       * makes the date range mean the same thing on both event sources:
       * `timeOfIncident` for incidents, `sessions[].timestamp` here. Windowing
       * on createdAt instead would drop a backfilled demo entirely, because the
       * row is written now while its sessions are timestamped in the past.
       *
       * Note this differs from the Attendance Logs page and the analytics
       * module, which deliberately window access logs on `createdAt` (a row
       * there means "one employee, one day"). That rule is not changed — it
       * just isn't the right one for a demo event count, and this filter is
       * local to this endpoint.
       */
      const accessMatch = {
        admin: adminObjectId,
        liveDemoData: true,
        ...dateWindow("sessions.timestamp"),
      };

      /**
       * The same window, re-applied after $unwind — and it has to be both.
       *
       * Pre-unwind it prunes whole documents off the sessions.timestamp index.
       * But a document qualifies when ANY one of its sessions is in range, and
       * $unwind then emits every session that row holds. Without this second
       * pass, one in-window session would drag the row's whole history into the
       * count.
       */
      const accessSessionWindow =
        from && to ? [{ $match: { "sessions.timestamp": { $gte: from, $lte: to } } }] : [];

      const [recordFacet, incidentRows, accessRows] = await Promise.all([
        videoRecordModel.aggregate([
          { $match: recordMatch },
          {
            $facet: {
              totals: [
                {
                  $group: {
                    _id: null,
                    demoRecords: { $sum: 1 },
                    storedDemosRun: { $sum: { $ifNull: ["$sessionAnalytics.demosRun", 0] } },
                    storedEventsDetected: {
                      $sum: { $ifNull: ["$sessionAnalytics.eventsDetected", 0] },
                    },
                    firstRunAt: { $min: "$createdAt" },
                    lastRunAt: { $max: "$createdAt" },
                  },
                },
              ],
              // One row per detection that was enabled on at least one record.
              byDetection: [
                {
                  $project: {
                    createdAt: 1,
                    detections: { $objectToArray: { $ifNull: ["$detections", {}] } },
                  },
                },
                { $unwind: "$detections" },
                { $match: { "detections.v": true } },
                {
                  $group: {
                    _id: "$detections.k",
                    runs: { $sum: 1 },
                    lastRunAt: { $max: "$createdAt" },
                  },
                },
              ],
            },
          },
        ]),

        incidentTypes.length
          ? Incident.aggregate([
              { $match: incidentMatch },
              {
                $group: {
                  _id: "$incidentType",
                  events: { $sum: 1 },
                  confidenceSum: {
                    $sum: confidencePercentExpr("$ConfidenceScoreInPercentage"),
                  },
                  confidenceCount: {
                    $sum: confidenceCountExpr("$ConfidenceScoreInPercentage"),
                  },
                  cameras: { $addToSet: "$channelId" },
                  lastEventAt: { $max: "$timeOfIncident" },
                },
              },
            ])
          : Promise.resolve([]),

        wantsAttendance
          ? OptimizedAccessLogs.aggregate([
              { $match: accessMatch },
              { $unwind: "$sessions" },
              ...accessSessionWindow,
              {
                $group: {
                  _id: null,
                  events: { $sum: 1 },
                  confidenceSum: {
                    $sum: confidencePercentExpr("$sessions.confidenceScore"),
                  },
                  confidenceCount: {
                    $sum: confidenceCountExpr("$sessions.confidenceScore"),
                  },
                  cameras: { $addToSet: "$sessions.channel" },
                  people: { $addToSet: "$sessions.personName" },
                  lastEventAt: { $max: "$sessions.timestamp" },
                },
              },
            ])
          : Promise.resolve([]),
      ]);

      const totals = recordFacet?.[0]?.totals?.[0] || {};
      const runsByType = new Map(
        (recordFacet?.[0]?.byDetection || [])
          .filter((row) => DETECTION_KEYS.includes(row._id))
          .map((row) => [row._id, row])
      );

      // Fold both event sources into one settingType-keyed shape.
      const eventsByType = new Map();
      for (const row of incidentRows) {
        const key = SETTING_BY_INCIDENT_TYPE[row._id];
        if (key) eventsByType.set(key, row);
      }
      const accessRow = accessRows?.[0];
      if (accessRow) eventsByType.set(ATTENDANCE_SETTING_TYPE, accessRow);

      // Report every detection the admin either ran or produced events for, then
      // narrow to what was asked for. Ordered by events so the busiest engine
      // leads the breakdown, the way the panel renders it.
      const keys = effectiveTypes.length
        ? effectiveTypes
        : [...new Set([...runsByType.keys(), ...eventsByType.keys()])];

      const byDetection = keys
        .map((key) => {
          const runRow = runsByType.get(key);
          const eventRow = eventsByType.get(key);
          const confidenceCount = eventRow?.confidenceCount || 0;
          return {
            settingType: key,
            name: DETECTION_TYPES[key] || key,
            incidentType: INCIDENT_TYPE_BY_SETTING[key] || null,
            source: key === ATTENDANCE_SETTING_TYPE ? "accessLogs" : "incidents",
            runs: runRow?.runs || 0,
            events: eventRow?.events || 0,
            avgConfidence: confidenceCount
              ? round1(eventRow.confidenceSum / confidenceCount)
              : null,
            camerasUsed: (eventRow?.cameras || []).filter(Boolean).length,
            // Face Recognition only — distinct people the demo matched. Every
            // other engine has no person identity on its events.
            peopleRecognized: eventRow?.people
              ? eventRow.people.filter(Boolean).length
              : null,
            lastRunAt: runRow?.lastRunAt || null,
            lastEventAt: eventRow?.lastEventAt || null,
          };
        })
        .sort((a, b) => b.events - a.events || b.runs - a.runs);

      const eventsDetected = byDetection.reduce((sum, row) => sum + row.events, 0);
      const confidenceSum = byDetection.reduce((sum, row) => {
        const eventRow = eventsByType.get(row.settingType);
        return sum + (eventRow?.confidenceSum || 0);
      }, 0);
      const confidenceCount = byDetection.reduce((sum, row) => {
        const eventRow = eventsByType.get(row.settingType);
        return sum + (eventRow?.confidenceCount || 0);
      }, 0);

      return res.status(200).json(
        Response.userSuccessResp("Live demo analytics fetched", {
          scope: {
            adminId: adminObjectId,
            // What was actually reported on, after search narrowing. Empty means
            // "every detection this admin has demoed".
            settingTypes: effectiveTypes,
            search: searchTerm || null,
            timezone: tz,
            from,
            to,
          },
          // The four tiles of the Session analytics panel.
          demosRun: totals.demoRecords || 0,
          eventsDetected,
          avgConfidence: confidenceCount ? round1(confidenceSum / confidenceCount) : 0,
          detectionsTested: byDetection.filter((row) => row.runs > 0 || row.events > 0).length,
          byDetection,
          firstRunAt: totals.firstRunAt || null,
          lastRunAt: totals.lastRunAt || null,
          // What DS pushed into sessionAnalytics for the same records. Kept
          // separate rather than merged: a mismatch here means DS is behind on
          // its update calls, and silently preferring one over the other would
          // hide that.
          reportedByDs: {
            demosRun: totals.storedDemosRun || 0,
            eventsDetected: totals.storedEventsDetected || 0,
          },
        })
      );
    } catch (error) {
      logger.error("Error fetching live demo analytics:", error);
      return res.status(500).json(Response.errorResp("Internal server error"));
    }
  }

  async createVideoRecord(req, res, _next) {
    try {
      const { videos, detections } = req.body;
      const { adminId, memberId, userSubscriptionType } = req?.verified?.userData || {};
      // Acting user: the logged-in member, or the admin itself when the
      // admin is logged in directly (no member in session).
      const userId = memberId || adminId;

      const entries = (Array.isArray(videos) ? videos : []).filter((v) => v?.videoUrl);
      if (!entries.length || !adminId || !userId) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "videos (non-empty array of { videoUrl }) is required, and a valid session is required"
            )
          );
      }

      // Plan snapshot comes from the session's aMember subscriptions (same
      // helper checkActivePlan/generateAdminToken use), not the body.
      const latestPlan = authService._resolveLatestSubscription(userSubscriptionType);
      if (!latestPlan) {
        return res
          .status(400)
          .json(Response.userFailResp("No active plan found in session"));
      }

      const record = await videoRecordModel.create({
        videos: entries.map((v) => ({
          videoUrl: v.videoUrl,
          dsVideoUrl: v.dsVideoUrl ?? null,
          zones: Array.isArray(v.zones) ? v.zones : [],
          zone_configs: Array.isArray(v.zone_configs) ? v.zone_configs : [],
        })),
        adminId,
        userId,
        plan: { name: latestPlan.plan, expiryDate: latestPlan.expiry },
        detections: sanitizeDetections(detections),
      });

      return res
        .status(200)
        .json(Response.userSuccessResp("Video record created", record));
    } catch (error) {
      logger.error("Error creating video record:", error);
      return res.status(500).json(Response.errorResp("Internal server error"));
    }
  }

  async getVideos(req, res, _next) {
    try {
      const { id } = req.params;
      const { adminId } = req?.verified?.userData || {};
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId in session"));
      }
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(Response.userFailResp("Invalid id"));
      }

      const record = await videoRecordModel
        .findOne({ _id: id, adminId })
        .select("videos detections");
      if (!record) {
        return res.status(404).json(Response.notFoundResp("Video record not found"));
      }

      // Both urls per clip; dsVideoUrl stays null until the DS team attaches it.
      return res.status(200).json(
        Response.userSuccessResp("Videos fetched", {
          videos: record.videos,
          detections: record.detections,
        })
      );
    } catch (error) {
      logger.error("Error fetching videos:", error);
      return res.status(500).json(Response.errorResp("Internal server error"));
    }
  }

  async processVideo(req, res, _next) {
    try {
      const { id } = req.params;
      const { videoId, detectors } = req.body || {};
      const { adminId } = req?.verified?.userData || {};
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId in session"));
      }
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json(Response.userFailResp("Invalid id"));
      }

      const record = await videoRecordModel.findOne({ _id: id, adminId });
      if (!record) {
        return res.status(404).json(Response.notFoundResp("Video record not found"));
      }

      const video = videoId ? record.videos.id(videoId) : record.videos[0];
      if (!video) {
        return res.status(404).json(Response.notFoundResp("Video not found on this record"));
      }

      // Detectors: explicit list (strings or { name }) wins; otherwise the
      // record's enabled detections.
      const names = (Array.isArray(detectors) && detectors.length
        ? detectors.map((d) => (typeof d === "string" ? d : d?.name))
        : Object.entries(record.detections?.toObject?.() || {})
            .filter(([, enabled]) => enabled)
            .map(([key]) => key)
      ).filter(Boolean);

      // Vehicle manufacturer for car model detection. Mapping detectors -> names
      // above drops every field but the name, so keep it keyed by detector here.
      // Accepts either spelling from the frontend and always emits DS's
      // `car_company` on the wire.
      const carCompanyByName = new Map(
        (Array.isArray(detectors) ? detectors : [])
          .filter((d) => d && typeof d === "object" && d.name)
          .map((d) => [d.name, String(d.car_company ?? d.company ?? "").trim()])
          .filter(([, value]) => value)
      );

      const unknown = names.filter((n) => !DETECTION_KEYS.includes(n));
      if (unknown.length) {
        return res
          .status(400)
          .json(Response.userFailResp(`Unknown detectors: ${unknown.join(", ")}`));
      }
      if (!names.length) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "No detectors selected — pass detectors in the body or enable a detection on the record"
            )
          );
      }

      const payload = {
        admin_id: adminId.toString(),
        video_id: video._id.toString(),
        source_url: toAbsoluteMediaUrl(video.videoUrl),
        detectors: names.map((name) => {
          const detector = { name };
          const carCompany = carCompanyByName.get(name);
          if (carCompany) detector.car_company = carCompany;
          if (video.zones && video.zones.length) detector.zones = video.zones;
          if (video.zone_configs && video.zone_configs.length) detector.zone_configs = video.zone_configs;
          return detector;
        }),
      };

      const job = await pythonService.processVideoJob(payload);

      return res
        .status(200)
        .json(Response.userSuccessResp("Video processing job submitted", { job, submitted: payload }));
    } catch (error) {
      logger.error("Error submitting video for processing:", error);
      return res
        .status(502)
        .json(
          Response.errorResp(
            "Video processing service error",
            error?.response?.data || error.message
          )
        );
    }
  }

  async updateVideoRecord(req, res, _next) {
    try {
      const { id } = req.params;
      // videoId + videoUrl/dsVideoUrl target one entry in the videos array
      // (this is how the DS team attaches its processed dsVideoUrl).
      // addVideos appends new { videoUrl, dsVideoUrl } entries.
      const {
        plan,
        detections,
        sessionAnalytics,
        videoId,
        videoUrl,
        dsVideoUrl,
        zones,
        zone_configs,
        addVideos,
      } = req.body;
      const { adminId, system: isSystem } = req?.verified?.userData || {};

      const set = {};
      if (plan?.name !== undefined) set["plan.name"] = plan.name;
      if (plan?.expiryDate !== undefined) set["plan.expiryDate"] = plan.expiryDate;
      if (detections !== undefined) {
        for (const [key, value] of Object.entries(sanitizeDetections(detections))) {
          set[`detections.${key}`] = value;
        }
      }
      if (sessionAnalytics !== undefined) {
        for (const field of ["demosRun", "eventsDetected", "avgConfidence", "detectionsTested"]) {
          if (typeof sessionAnalytics[field] === "number") {
            set[`sessionAnalytics.${field}`] = sessionAnalytics[field];
          }
        }
        if (sessionAnalytics.byDetection !== undefined) {
          for (const [key, stats] of Object.entries(
            sanitizeByDetection(sessionAnalytics.byDetection)
          )) {
            for (const [statKey, value] of Object.entries(stats)) {
              set[`sessionAnalytics.byDetection.${key}.${statKey}`] = value;
            }
          }
        }
      }

      // Scope to the caller's own record — except the DS team's service
      // token, which has no adminId and targets by record id alone.
      const filter = { _id: id };
      if (!isSystem) {
        if (!adminId) {
          return res.status(400).json(Response.userFailResp("Missing adminId in session"));
        }
        filter.adminId = adminId;
      }
      if (videoId) {
        filter["videos._id"] = videoId;
        if (videoUrl !== undefined) set["videos.$.videoUrl"] = videoUrl;
        if (dsVideoUrl !== undefined) set["videos.$.dsVideoUrl"] = dsVideoUrl;
        if (zones !== undefined) set["videos.$.zones"] = Array.isArray(zones) ? zones : [];
        if (zone_configs !== undefined) set["videos.$.zone_configs"] = Array.isArray(zone_configs) ? zone_configs : [];
      }

      const update = {};
      if (Object.keys(set).length) update.$set = set;

      const newEntries = (Array.isArray(addVideos) ? addVideos : [])
        .filter((v) => v?.videoUrl)
        .map((v) => ({ videoUrl: v.videoUrl, dsVideoUrl: v.dsVideoUrl ?? null }));
      if (newEntries.length) update.$push = { videos: { $each: newEntries } };

      if (Object.keys(update).length === 0) {
        return res.status(400).json(Response.userFailResp("Nothing to update"));
      }

      const record = await videoRecordModel.findOneAndUpdate(filter, update, { new: true });
      if (!record) {
        return res.status(404).json(Response.notFoundResp("Video record not found"));
      }

      if (videoId && dsVideoUrl !== undefined) {
        const triggerUserId = record.userId;
        if (triggerUserId) {
          await sendPayloadToUser(
            triggerUserId,
            `videoRecord_updated_${record._id}`,
            { recordId: record._id, videos: record.videos }
          ).catch((err) => logger.warn(`Socket trigger failed for ${triggerUserId}: ${err.message}`));
        }
      }

      return res
        .status(200)
        .json(Response.userSuccessResp("Video record updated", record));
    } catch (error) {
      logger.error("Error updating video record:", error);
      return res.status(500).json(Response.errorResp("Internal server error"));
    }
  }

  async updateVideoByVideoId(req, res, _next) {
    try {
      const { videoId } = req.params;
      const { dsVideoUrl } = req.body || {};

      if (!videoId || !mongoose.Types.ObjectId.isValid(videoId)) {
        return res.status(400).json(Response.userFailResp("Invalid videoId"));
      }
      if (dsVideoUrl === undefined || typeof dsVideoUrl !== "string") {
        return res.status(400).json(Response.userFailResp("dsVideoUrl is required and must be a string"));
      }

      const record = await videoRecordModel.findOneAndUpdate(
        { "videos._id": videoId },
        { $set: { "videos.$.dsVideoUrl": dsVideoUrl } },
        { new: true }
      );

      if (!record) {
        return res.status(404).json(Response.notFoundResp("Video not found"));
      }

      const triggerUserId = record.userId;
      if (triggerUserId) {
        await sendPayloadToUser(
          triggerUserId,
          `videoRecord_updated_${record._id}`,
          { recordId: record._id, videos: record.videos }
        ).catch((err) => logger.warn(`Socket trigger failed for ${triggerUserId}: ${err.message}`));
      }

      return res
        .status(200)
        .json(Response.userSuccessResp("Video updated", { videoId, record }));
    } catch (error) {
      logger.error("Error updating video by videoId:", error);
      return res.status(500).json(Response.errorResp("Internal server error"));
    }
  }
}

export default new VideoRecordsService();
