import mongoose from "mongoose";
import moment from "moment-timezone";
import { Incident } from "../../v1/incidents/incidents.model.js";
import LogsConfiguration from "../logsConfiguration/logsConfiguration.model.js";
import { getAllowedDetectionTypes } from "../clientConfig/detectionLicense.service.js";
import { SACK_COUNTS, SACK_INCIDENT, SACK_SETTING } from "../../../services/sackLoading.js";
import { getRequestTimezone } from "../../../utils/timezone.js";
import Response from "../../../utils/response.js";

const values = input => (Array.isArray(input) ? input : String(input || "").split(",")).map(String).map(value => value.trim()).filter(Boolean);
const ids = input => values(input).map(value => {
  if (!mongoose.Types.ObjectId.isValid(value)) throw Object.assign(new Error("Invalid NVR or camera ID"), { status: 400 });
  return new mongoose.Types.ObjectId(value);
});
const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plate = { $toUpper: { $trim: { input: { $ifNull: ["$vehicleNumber", ""] } } } };

async function scope(req, res) {
  const user = req.verified?.userData;
  if (!user?.user_id) { res.status(401).json(Response.accessDeniedResp("Authentication required")); return null; }
  const allowed = await getAllowedDetectionTypes({ adminId: user.adminId, userId: user.user_id });
  if (!allowed.has(SACK_SETTING)) { res.status(403).json(Response.accessDeniedResp("Sack Loading/Unloading Detection is not enabled for your account")); return null; }
  const logs = req.verified.permissionConfig?.[0]?.permissionConfig?.logs;
  if (user.memberId && !(logs?.sackLoadingLogs?.view ?? logs?.global?.view ?? logs?.view ?? false)) {
    res.status(403).json(Response.accessDeniedResp("You do not have permission to view Sack Loading/Unloading Logs")); return null;
  }
  const configured = user.adminId && await LogsConfiguration.findOne({ adminId: user.adminId }).select("logs.sackLoadingLogs").lean();
  if (configured?.logs?.sackLoadingLogs === false) { res.status(403).json(Response.accessDeniedResp("Sack Loading/Unloading Logs are disabled")); return null; }
  const query = req.query || {}, match = { userId: String(user.user_id), incidentType: SACK_INCIDENT };
  if (query.startDate && query.endDate) {
    const start = moment.tz(query.startDate, getRequestTimezone(req)).startOf("day"), end = moment.tz(query.endDate, getRequestTimezone(req)).endOf("day");
    if (!start.isValid() || !end.isValid() || start.isAfter(end)) throw Object.assign(new Error("Invalid date range"), { status: 400 });
    match.timeOfIncident = { $gte: start.toDate(), $lte: end.toDate() };
  }
  const nvrs = ids(query.nvrId || query.nvrIds), cameras = ids(query.channelId || query.channelIds);
  if (nvrs.length) match.nvrId = { $in: nvrs };
  const authorized = req.verified?.authorizedChannel?.channels;
  if (user.memberId || Array.isArray(authorized)) {
    const permitted = ids(authorized || []);
    match.channelId = { $in: cameras.length ? cameras.filter(id => permitted.some(other => other.equals(id))) : permitted };
  } else if (cameras.length) match.channelId = { $in: cameras };
  const direction = String(query.direction || "all");
  if (!["all", "both", "loading", "unloading"].includes(direction)) throw Object.assign(new Error("direction must be loading, unloading or both"), { status: 400 });
  if (["loading", "unloading"].includes(direction)) match.direction = direction;
  if (query.vehicleNumber) match.vehicleNumber = { $regex: `^\\s*${escape(String(query.vehicleNumber).trim())}\\s*$`, $options: "i" };
  return match;
}

export async function getSackLoadingLogs(req, res, next) {
  try {
    const match = await scope(req, res);
    if (!match) return;
    const grouped = {
      _id: "$_vehicleKey", _latestId: { $first: "$_id" }, vehicleNumber: { $first: "$_plate" },
      eventCount: { $sum: 1 }, vehicleSessionIds: { $addToSet: "$vehicleSessionId" }, directions: { $addToSet: "$direction" },
      ...Object.fromEntries(["incidentType", "incidentName", "description", "zone", "severity", "Image", "videoLink", "timeOfIncident", "nvrId", "channelId", "nvrData", "channelData"].map(key => [key, { $first: `$${key}` }])),
      ...Object.fromEntries(SACK_COUNTS.map(key => [key, { $sum: `$${key}` }])),
      loadedBoxCount: { $sum: { $cond: [{ $eq: ["$direction", "loading"] }, "$totalCount", 0] } },
      unloadedBoxCount: { $sum: { $cond: [{ $eq: ["$direction", "unloading"] }, "$totalCount", 0] } },
      events: { $push: {
        ...Object.fromEntries(["_id", "schemaVersion", "eventId", "vehicleSessionId", "direction", "Image", "videoLink", "description", "zone", "timeOfIncident", "truckPresent", ...SACK_COUNTS].map(key => [key, `$${key}`])),
        boxCount: "$totalCount", nvrName: "$nvrData.nvrName", channelName: { $ifNull: ["$channelData.customName", "$channelData.name"] },
      } },
    };
    const pipeline = [
      { $match: match },
      { $set: { _plate: plate } },
      { $set: { _vehicleKey: { $cond: [
        { $regexMatch: { input: "$_plate", regex: "^(|UNKNOWN|UNREADABLE.*|N/?A|NONE|NULL|-)$" } },
        { $concat: ["UNREADABLE:", { $toString: "$_id" }] }, "$_plate",
      ] } } },
      { $lookup: { from: "nvrs", localField: "nvrId", foreignField: "_id", pipeline: [{ $project: { nvrName: 1, location: 1 } }], as: "nvrData" } },
      { $unwind: { path: "$nvrData", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "channels", localField: "channelId", foreignField: "_id", pipeline: [{ $project: { name: 1, customName: 1 } }], as: "channelData" } },
      { $unwind: { path: "$channelData", preserveNullAndEmptyArrays: true } },
      { $sort: { timeOfIncident: -1, _id: -1 } }, { $group: grouped },
      { $set: { aggregationKey: "$_id", _id: "$_latestId", boxCount: "$totalCount", count: "$totalCount",
        createdAt: "$timeOfIncident", sessionCount: { $size: "$vehicleSessionIds" },
        direction: { $cond: [{ $gt: [{ $size: "$directions" }, 1] }, "both", { $arrayElemAt: ["$directions", 0] }] },
      } },
      { $unset: "_latestId" },
    ];
    const query = req.query || {};
    if (String(query.search || "").trim()) pipeline.push({ $match: { $or: ["vehicleNumber", "description", "zone", "nvrData.nvrName", "channelData.name", "events.description"].map(key => ({ [key]: { $regex: escape(query.search.trim()), $options: "i" } })) } });
    const sorts = new Set(["vehicleNumber", "direction", "loadedBoxCount", "unloadedBoxCount", "boxCount", "timeOfIncident", ...SACK_COUNTS]);
    const field = sorts.has(query.sortField) ? query.sortField : "timeOfIncident";
    const skip = Math.max(0, parseInt(query.skip, 10) || 0), limit = Math.min(10000, Math.max(1, parseInt(query.limit, 10) || 10));
    pipeline.push({ $facet: {
      count: [{ $count: "totalCount" }],
      summary: [{ $group: { _id: null, vehicles: { $sum: 1 }, events: { $sum: "$eventCount" }, loadedBoxes: { $sum: "$loadedBoxCount" }, unloadedBoxes: { $sum: "$unloadedBoxCount" }, totalBoxes: { $sum: "$totalCount" }, ...Object.fromEntries(SACK_COUNTS.map(key => [key, { $sum: `$${key}` }])) } }],
      data: [{ $sort: { [field]: query.sortOrder === "asc" ? 1 : -1, _id: -1 } }, { $skip: skip }, { $limit: limit }],
    } });
    const [result] = await Incident.aggregate(pipeline).allowDiskUse(true);
    return res.status(200).json(Response.userSuccessResp("Sack loading/unloading logs fetched", {
      totalCount: result?.count[0]?.totalCount || 0, summary: result?.summary[0] || { vehicles: 0, events: 0, loadedBoxes: 0, unloadedBoxes: 0, totalBoxes: 0 }, data: result?.data || [],
    }));
  } catch (error) { if (error.status) return res.status(error.status).json(Response.userFailResp(error.message)); next(error); }
}

export async function getSackVehicleNumbers(req, res, next) {
  try {
    const match = await scope(req, res);
    if (!match) return;
    const pipeline = [{ $match: match }, { $set: { _plate: plate } }, { $match: { _plate: { $nin: ["", "UNKNOWN", "N/A", "--"] } } }];
    if (req.query?.search) pipeline.push({ $match: { _plate: { $regex: escape(req.query.search), $options: "i" } } });
    pipeline.push({ $group: { _id: "$_plate" } }, { $sort: { _id: 1 } }, { $limit: 100 });
    const rows = await Incident.aggregate(pipeline);
    return res.status(200).json(Response.userSuccessResp("Sack vehicle numbers fetched", { vehicleNumbers: rows.map(row => row._id) }));
  } catch (error) { if (error.status) return res.status(error.status).json(Response.userFailResp(error.message)); next(error); }
}
