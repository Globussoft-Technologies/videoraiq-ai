import mongoose from "mongoose";
import momentTZ from "moment-timezone";
import Channel from "../channels/channels.model.js";
// Registered here because getSolderLine populates them.
import "../NVR/nvr.model.js";
import "../detectionSettings/detectionSettings.model.js";
import { DeskSolarShoulderDetectionIncident } from "./incidents.model.js";
import SolderPanel from "./solderPanel.model.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import AppError from "../../../utils/appError.js";
import { getRequestTimezone } from "../../../utils/timezone.js";
import { buildStreamingUrl } from "../../../utils/rtspStream.js";

const SETTING = "deskSolarShoulderDetectionSettings";
// ponytail: every operator zone owns 3 of the junction box's 6 solder points
// (OP-1 P1–P3, OP-2 P4–P6). Make it per-zone config if a line differs.
export const POINTS_PER_ZONE = 3;
// ponytail: hard cap per request; a month of a busy line fits, page it if a
// client ever outgrows it.
const MAX_EVENTS = 5000;

const toObjectIds = (ids) =>
  ids.map(String).filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * DS's per-panel "Solar panel processing" payload (incidents/create with
 * `zones: { <zone name>: { presence_time, shoulderings_done } }`): stores the
 * panel sample the charts aggregate, and reports how many joints were missed.
 * A retried post of the same panel is not counted twice.
 */
export async function recordSolderPanel({ userId, channelId, body }) {
  const zones = Object.entries(body.zones || {})
    .slice(0, 20)
    .map(([zone, value]) => ({
      zone: String(zone).slice(0, 100),
      presenceSec: count(value?.presence_time),
      done: Math.round(count(value?.shoulderings_done)),
    }));
  const time = body.timeOfIncident && !Number.isNaN(Date.parse(body.timeOfIncident)) ? new Date(body.timeOfIncident) : new Date();
  const panelId = String(body.panelId || `PNL-${time.getTime()}`).slice(0, 100);

  await SolderPanel.updateOne(
    { channelId, panelId, time },
    { $set: { userId: String(userId), zones } },
    { upsert: true, runValidators: true },
  );
  const missedJoints = zones.reduce((sum, z) => sum + Math.max(0, POINTS_PER_ZONE - z.done), 0);
  return { zones, panelId, time, missedJoints };
}

class SolderLineService {
  // Everything the Solder Line pages need for a date range: the cameras
  // running the detection, their absence alerts, panels with missed joints,
  // and panel throughput / solder time per camera, hour and zone (admin tz).
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

      const [events, throughput] = await Promise.all([
        DeskSolarShoulderDetectionIncident.find({
          userId,
          timeOfIncident: range,
          ...(scope && { channelId: scope }),
        })
          .select("eventType zone zones panelId timeOfIncident returnedAt durationSec Image description channelId personCount capacity thresholdSec")
          .sort({ timeOfIncident: 1 })
          .limit(MAX_EVENTS)
          .lean(),
        SolderPanel.aggregate([
          { $match: { userId, time: range, ...(scope && { channelId: scope }) } },
          { $set: { hour: { $dateToString: { format: "%Y-%m-%dT%H", date: "$time", timezone } } } },
          {
            $facet: {
              panels: [{ $group: { _id: { channelId: "$channelId", hour: "$hour" }, panels: { $sum: 1 } } }],
              zones: [
                { $unwind: "$zones" },
                {
                  $group: {
                    _id: { channelId: "$channelId", hour: "$hour", zone: "$zones.zone" },
                    joints: { $sum: "$zones.done" },
                    solderSec: { $sum: "$zones.presenceSec" },
                    missed: { $sum: { $max: [0, { $subtract: [POINTS_PER_ZONE, "$zones.done"] }] } },
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
      throughput[0].panels.forEach(({ _id, panels }) => { row(_id).panels = panels; });
      throughput[0].zones.forEach(({ _id, joints, solderSec, missed }) => {
        row(_id).zones.push({ zone: _id.zone || "", joints, solderSec, missed });
      });

      const absences = events.filter((e) => e.eventType !== "panel" && e.eventType !== "missedSolder");
      // One entry per zone that left joints undone on a panel; the page numbers
      // the missing points from the zone's position.
      const missed = events
        .filter((e) => e.eventType === "panel")
        .flatMap((e) => (e.zones || [])
          .filter((z) => z.done < POINTS_PER_ZONE)
          .map((z) => ({
            _id: `${e._id}:${z.zone}`,
            incidentId: e._id,
            channelId: e.channelId,
            panelId: e.panelId,
            timeOfIncident: e.timeOfIncident,
            Image: e.Image,
            zone: z.zone,
            done: z.done,
          })));

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
          pointsPerZone: POINTS_PER_ZONE,
          stations,
          absences,
          missed,
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
