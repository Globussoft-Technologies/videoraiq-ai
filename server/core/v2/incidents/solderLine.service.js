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
import { DEFAULT_REQUIRED_JOINTS, solderPanelCounts } from "../../../utils/solderPanelCounts.js";

const SETTING = "deskSolarShoulderDetectionSettings";
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
  const source = Array.isArray(body.zones) ? body.zones.map(value => [value.zone, value]) : Object.entries(body.zones || {});
  const zones = source.map(([zone, value]) => ({
      zone: String(zone || 'Unassigned').slice(0, 100),
      presenceSec: count(value?.presence_time ?? value?.presenceSec),
      done: count(value?.shoulderings_done ?? value?.done),
    }));
  const totals = solderPanelCounts({ zones, requiredJoints: body.requiredJoints });
  const time = body.timeOfIncident && !Number.isNaN(Date.parse(body.timeOfIncident)) ? new Date(body.timeOfIncident) : new Date();
  const panelId = String(body.panelId || `PNL-${time.getTime()}`).slice(0, 100);

  await SolderPanel.updateOne(
    { channelId, panelId, time },
    { $set: { userId: String(userId), zones, ...totals, ...(typeof body.Image === "string" && body.Image.trim() ? { Image: body.Image.trim() } : {}) } },
    { upsert: true, runValidators: true },
  );
  return { zones, panelId, time, ...totals };
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

      const [events, throughput, latestPanels] = await Promise.all([
        DeskSolarShoulderDetectionIncident.find({
          userId,
          timeOfIncident: range,
          ...(scope && { channelId: scope }),
        })
          .select("eventType zone zones panelId requiredJoints timeOfIncident returnedAt durationSec Image description channelId personCount capacity thresholdSec")
          .sort({ timeOfIncident: 1 })
          .limit(MAX_EVENTS)
          .lean(),
        SolderPanel.aggregate([
          { $match: { userId, time: range, ...(scope && { channelId: scope }) } },
          { $set: { hour: { $dateToString: { format: "%Y-%m-%dT%H", date: "$time", timezone } },
            panelRequired: { $ifNull: ["$requiredJoints", DEFAULT_REQUIRED_JOINTS] },
            panelMissed: { $max: [0, { $subtract: [{ $ifNull: ["$requiredJoints", DEFAULT_REQUIRED_JOINTS] }, { $sum: "$zones.done" }] }] },
          } },
          {
            $facet: {
              panels: [{ $group: { _id: { channelId: "$channelId", hour: "$hour" }, panels: { $sum: 1 }, missedJoints: { $sum: "$panelMissed" }, requiredJoints: { $sum: "$panelRequired" } } }],
              zones: [
                { $unwind: "$zones" },
                {
                  $group: {
                    _id: { channelId: "$channelId", hour: "$hour", zone: "$zones.zone" },
                    joints: { $sum: "$zones.done" },
                    solderSec: { $sum: "$zones.presenceSec" },
                  },
                },
              ],
            },
          },
        ]),
        SolderPanel.aggregate([
          { $match: { userId, time: range, ...(scope && { channelId: scope }) } },
          { $sort: { time: -1, _id: -1 } },
          { $group: { _id: "$channelId", panel: { $first: "$$ROOT" } } },
          // Older panel samples did not store their snapshot. Retrieve only
          // the incident matching this account, camera, panel and timestamp.
          { $lookup: {
            from: DeskSolarShoulderDetectionIncident.collection.name,
            let: { channel: "$_id", panelId: "$panel.panelId", time: "$panel.time" },
            pipeline: [
              { $match: { userId, eventType: "panel", incidentType: "deskSolarShoulderDetection", $expr: { $and: [
                { $eq: ["$channelId", "$$channel"] },
                { $eq: ["$panelId", "$$panelId"] },
                { $eq: ["$timeOfIncident", "$$time"] },
              ] } } },
              { $sort: { _id: -1 } },
              { $limit: 1 },
              { $project: { _id: 0, Image: 1 } },
            ],
            as: "snapshot",
          } },
          { $project: { _id: 1, "panel._id": 1, "panel.panelId": 1, "panel.time": 1, "panel.zones": 1, "panel.Image": 1, "panel.requiredJoints": 1, incidentImage: { $arrayElemAt: ["$snapshot.Image", 0] } } },
        ]),
      ]);
      const latestPanelByChannel = new Map(latestPanels.map(({ _id, panel, incidentImage }) => [String(_id), { ...panel, ...solderPanelCounts(panel), Image: panel.Image || incidentImage || "" }]));

      const hourly = new Map();
      const row = ({ channelId, hour }) => {
        const key = `${channelId}|${hour}`;
        if (!hourly.has(key)) hourly.set(key, { channelId: String(channelId), hour, panels: 0, zones: [] });
        return hourly.get(key);
      };
      throughput[0].panels.forEach(({ _id, panels, missedJoints, requiredJoints }) => { Object.assign(row(_id), { panels, missedJoints, requiredJoints }); });
      throughput[0].zones.forEach(({ _id, joints, solderSec }) => {
        row(_id).zones.push({ zone: _id.zone || "", joints, solderSec });
      });

      const absences = events.filter((e) => e.eventType !== "panel" && e.eventType !== "missedSolder");
      // The payload identifies panel misses, not which worker missed a joint.
      const missed = events
        .filter((e) => e.eventType === "panel")
        .map((e) => ({
            _id: String(e._id),
            incidentId: e._id,
            channelId: e.channelId,
            panelId: e.panelId,
            timeOfIncident: e.timeOfIncident,
            Image: e.Image,
            zones: e.zones,
            ...solderPanelCounts(e),
          })).filter((e) => e.missedJoints > 0);

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
            latestPanel: latestPanelByChannel.get(String(channel._id)) || null,
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
          pointsPerPanel: DEFAULT_REQUIRED_JOINTS,
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
