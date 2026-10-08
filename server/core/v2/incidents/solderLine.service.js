import Joi from "joi";
import mongoose from "mongoose";
import momentTZ from "moment-timezone";
import Channel from "../channels/channels.model.js";
// Registered here because getSolderLine populates them.
import "../NVR/nvr.model.js";
import "../detectionSettings/detectionSettings.model.js";
import adminModel from "../admin/admin.model.js";
import { DeskSolarShoulderDetectionIncident } from "./incidents.model.js";
import SolderPanel from "./solderPanel.model.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import AppError from "../../../utils/appError.js";
import { getRequestTimezone } from "../../../utils/timezone.js";
import { buildStreamingUrl } from "../../../utils/rtspStream.js";

const SETTING = "deskSolarShoulderDetectionSettings";
// ponytail: hard cap per request; a month of a busy line fits, page it if a
// client ever outgrows it.
const MAX_EVENTS = 5000;

const panelSchema = Joi.object({
  adminId: Joi.string().hex().length(24).required(),
  channelId: Joi.string().hex().length(24).required(),
  panelId: Joi.string().trim().max(100).required(),
  time: Joi.date().iso().required(),
  joints: Joi.array()
    .items(
      Joi.object({
        point: Joi.number().integer().min(1).max(50).required(),
        zone: Joi.string().allow("", null),
        solderSec: Joi.number().min(0).allow(null),
      }).unknown(true),
    )
    .max(50)
    .default([]),
}).unknown(true);

const toObjectIds = (ids) =>
  ids.map(String).filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));

class SolderLineService {
  // DS posts one of these per panel that leaves a solder-line camera.
  async recordPanel(req, res, next) {
    try {
      const { error, value } = panelSchema.validate(req.body || {});
      if (error) return res.status(400).send(Response.validationFailResp(error.message, "Validation Failed!"));

      const admin = await adminModel.findById(value.adminId).select("user_id").lean();
      if (!admin) return res.status(400).send(Response.validationFailResp("Admin not found!", "Validation Failed!"));
      const userId = admin.user_id.toString();
      if (!(await Channel.exists({ _id: value.channelId, userId }))) {
        return res.status(400).send(Response.validationFailResp("Invalid Channel ID", "Validation Failed!"));
      }

      await SolderPanel.updateOne(
        { channelId: value.channelId, panelId: value.panelId, time: value.time },
        {
          $set: {
            userId,
            joints: value.joints.map(({ point, zone, solderSec }) => ({ point, zone, solderSec })),
          },
        },
        { upsert: true, runValidators: true },
      );
      return res.status(200).send(Response.userSuccessResp("Panel recorded", { panelId: value.panelId }));
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to record solder panel", 500));
    }
  }

  // Everything the Solder Line pages need for a date range: the cameras
  // running the detection, their absence + missed-solder alerts, and panel
  // throughput / solder time per camera, hour and zone (admin timezone).
  async getSolderLine(req, res, next) {
    try {
      const userId = req?.verified?.userData?.user_id?.toString();
      if (!userId) return res.send(Response.userFailResp("User authentication failed.", "Unauthorized"));

      const timezone = getRequestTimezone(req);
      const today = momentTZ.tz(timezone).format("YYYY-MM-DD");
      const { startDate = today, endDate = startDate } = req.query || {};
      const range = {
        $gte: momentTZ.tz(startDate, timezone).startOf("day").toDate(),
        $lte: momentTZ.tz(endDate, timezone).endOf("day").toDate(),
      };
      const authorized = req?.verified?.authorizedChannel?.channels;
      const scope = Array.isArray(authorized) ? { $in: toObjectIds(authorized) } : null;

      const [events, [throughput]] = await Promise.all([
        DeskSolarShoulderDetectionIncident.find({
          userId,
          timeOfIncident: range,
          ...(scope && { channelId: scope }),
        })
          .select("eventType zone timeOfIncident returnedAt durationSec Image description point panelId channelId personCount capacity thresholdSec")
          .sort({ timeOfIncident: 1 })
          .limit(MAX_EVENTS)
          .lean(),
        SolderPanel.aggregate([
          { $match: { userId, time: range, ...(scope && { channelId: scope }) } },
          { $set: { hour: { $dateToString: { format: "%Y-%m-%dT%H", date: "$time", timezone } } } },
          {
            $facet: {
              panels: [{ $group: { _id: { channelId: "$channelId", hour: "$hour" }, panels: { $sum: 1 } } }],
              joints: [
                { $unwind: "$joints" },
                {
                  $group: {
                    _id: { channelId: "$channelId", hour: "$hour", zone: "$joints.zone" },
                    joints: { $sum: 1 },
                    solderSec: { $sum: { $ifNull: ["$joints.solderSec", 0] } },
                  },
                },
              ],
            },
          },
        ]),
      ]);

      const hourly = new Map();
      const row = ({ channelId, hour }) => {
        const key = `${channelId}|${hour}`;
        if (!hourly.has(key)) hourly.set(key, { channelId: String(channelId), hour, panels: 0, zones: [] });
        return hourly.get(key);
      };
      throughput.panels.forEach(({ _id, panels }) => { row(_id).panels = panels; });
      throughput.joints.forEach(({ _id, joints, solderSec }) => {
        row(_id).zones.push({ zone: _id.zone || "", joints, solderSec });
      });

      // Cameras with the detection on, plus any camera that has data in the
      // range even if the detection was switched off since.
      const dataChannelIds = [...new Set([
        ...events.map((e) => String(e.channelId)),
        ...[...hourly.values()].map((h) => h.channelId),
      ])];
      const channels = await Channel.find({
        userId,
        $or: [{ [`detections.${SETTING}.enabled`]: true }, { _id: { $in: toObjectIds(dataChannelIds) } }],
        ...(scope && { _id: scope }),
      })
        .populate("nvrId")
        .populate(`detections.${SETTING}.id`)
        .lean();

      const stations = await Promise.all(
        channels.map(async (channel) => {
          const settings = channel.detections?.[SETTING]?.id?.settings || {};
          let streamingUrl = "";
          try {
            streamingUrl = channel.nvrId ? await buildStreamingUrl(channel.nvrId, channel) : "";
          } catch (error) {
            logger.warn(`Solder line: no stream URL for camera ${channel._id}: ${error.message}`);
          }
          return {
            _id: String(channel._id),
            name: channel.customName || channel.name || "Camera",
            nvrId: String(channel.nvrId?._id || channel.nvrId || ""),
            nvrName: channel.nvrId?.nvrName || "",
            streamingUrl,
            enabled: Boolean(channel.detections?.[SETTING]?.enabled),
            zones: (settings.zone_configs || []).map((z) => ({
              name: z.name,
              capacity: z.capacity ?? null,
              thresholdSec: z.threshold_sec ?? null,
            })),
            zonePolygons: settings.referencePoints?.[String(channel._id)] || [],
            videoResolution: settings.videoResolution?.length === 2 ? settings.videoResolution : [1280, 720],
          };
        }),
      );
      stations.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      return res.status(200).send(
        Response.userSuccessResp("Solder line fetched successfully", {
          timezone,
          startDate,
          endDate,
          stations,
          absences: events.filter((e) => e.eventType !== "missedSolder"),
          missed: events.filter((e) => e.eventType === "missedSolder"),
          hourly: [...hourly.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
          truncated: events.length >= MAX_EVENTS,
        }),
      );
    } catch (error) {
      logger.error(error);
      next(new AppError("Failed to fetch solder line", 500));
    }
  }
}

export default new SolderLineService();
