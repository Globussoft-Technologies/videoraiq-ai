import mongoose from "mongoose";
import config from "config";
import videoRecordModel from "./videoRecords.model.js";
import pythonService from "../../../services/python.service.js";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import authService from "../Auth/auth.service.js";
import { sendPayloadToUser } from "../../../socket.js";

const DETECTION_KEYS = Object.keys(DETECTION_TYPES);

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
    config.has("MediaBaseUrl")
      ? config.get("MediaBaseUrl")
      : `https://${config.get("backendDomain")}`
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
        videos: entries.map((v) => ({ videoUrl: v.videoUrl, dsVideoUrl: v.dsVideoUrl ?? null })),
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
        detectors: names.map((name) => ({ name })),
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
}

export default new VideoRecordsService();
