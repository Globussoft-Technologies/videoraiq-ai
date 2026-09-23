import adminModel from "../admin/admin.model.js";
import channelsModel from "../channels/channels.model.js";
import { Incident } from "../incidents/incidents.model.js";
import attendanceModel from "../attendance/attendance.model.js";
import logsConfigService from "../logsConfiguration/logsConfiguration.service.js";
import {
  TOUR_MODULES,
  isModuleLogEnabled,
  isModuleVisible,
} from "../../../constants/tourModules.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function scopedChannelIds(req) {
  const isMember = Boolean(req?.verified?.userData?.memberId);
  if (!isMember) return null;

  const ids = req?.verified?.authorizedChannel?.channels;
  return Array.isArray(ids) ? ids : [];
}

async function buildFeatureCatalog(req) {
  const attachedPermissions = req?.verified?.permissionConfig;
  const role = Array.isArray(attachedPermissions) ? attachedPermissions[0] : attachedPermissions;
  const permissions = role?.permissionConfig || {};
  const { adminId, user_id: userId } = req?.verified?.userData || {};

  // Match the navigation/tour fail-open behaviour: a temporary logs-config
  // lookup failure must not make legitimate features disappear from answers.
  let logs = null;
  try {
    if (adminId) logs = await logsConfigService.resolveLogsForAdmin({ adminId, userId });
  } catch {
    logs = null;
  }

  const modules = TOUR_MODULES
    .filter((module) => !module.tourOnly)
    .filter((module) => isModuleVisible(module, permissions) && isModuleLogEnabled(module, logs))
    .map(({ key, label, path, group, description }) => ({
      key,
      label,
      path: `/${String(path).replace(/^\/+/, "")}`,
      group,
      description,
    }));

  return { total: modules.length, modules };
}

/**
 * Build a small, aggregate-only snapshot for Gemini. The tenant ID is resolved
 * from the authenticated admin record, and member accounts are restricted to
 * the channel IDs attached by verifyToken. Images, tokens and personal details
 * are deliberately never included in the model prompt.
 */
export async function buildApplicationContext(req) {
  const adminId = req?.verified?.userData?.adminId;
  if (!adminId) throw new Error("Authenticated account is missing an admin ID.");

  const admin = await adminModel.findById(adminId).select("user_id timezone").lean();
  if (!admin?.user_id) throw new Error("Admin account was not found.");

  const tenantUserId = String(admin.user_id);
  const channelIds = scopedChannelIds(req);
  const channelScope = channelIds === null ? {} : { _id: { $in: channelIds } };
  const incidentChannelScope = channelIds === null ? {} : { channelId: { $in: channelIds } };
  const since = new Date(Date.now() - DAY_MS);

  const cameraFilter = { userId: tenantUserId, isAdded: true, ...channelScope };
  const incidentFilter = {
    userId: tenantUserId,
    timeOfIncident: { $gte: since },
    ...incidentChannelScope,
  };

  const attendanceQuery = req?.verified?.userData?.memberId
    ? Promise.resolve(null)
    : attendanceModel.countDocuments({ user: adminId, createdAt: { $gte: since } });

  const [
    totalCameras,
    activeCameras,
    incidents,
    unresolvedIncidents,
    highSeverityIncidents,
    resolvedIncidents,
    incidentTypes,
    recentIncidents,
    attendanceRecords,
    productFeatures,
  ] = await Promise.all([
    channelsModel.countDocuments(cameraFilter),
    channelsModel.countDocuments({ ...cameraFilter, control: 1 }),
    Incident.countDocuments(incidentFilter),
    Incident.countDocuments({ ...incidentFilter, resolved: false }),
    Incident.countDocuments({ ...incidentFilter, severity: "high" }),
    Incident.countDocuments({ ...incidentFilter, resolved: true }),
    Incident.aggregate([
      { $match: incidentFilter },
      { $group: { _id: "$incidentType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Incident.find(incidentFilter)
      .sort({ timeOfIncident: -1 })
      .limit(5)
      .select("incidentName incidentType severity resolved timeOfIncident")
      .lean(),
    attendanceQuery,
    buildFeatureCatalog(req),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    period: "last 24 hours",
    timezone: admin.timezone || "server default",
    accessScope: channelIds === null ? "tenant" : "authorized cameras only",
    cameras: {
      total: totalCameras,
      detectionsActive: activeCameras,
      detectionsInactive: Math.max(0, totalCameras - activeCameras),
    },
    incidents: {
      total: incidents,
      unresolved: unresolvedIncidents,
      resolved: resolvedIncidents,
      highSeverity: highSeverityIncidents,
      topTypes: incidentTypes.map(({ _id, count }) => ({ type: _id || "unknown", count })),
      recent: recentIncidents.map((item) => ({
        name: item.incidentName || item.incidentType || "Incident",
        type: item.incidentType || "unknown",
        severity: item.severity || "unknown",
        resolved: Boolean(item.resolved),
        occurredAt: item.timeOfIncident,
      })),
    },
    attendance:
      attendanceRecords === null
        ? { available: false, reason: "Not included for member accounts." }
        : { available: true, records: attendanceRecords },
    productFeatures,
  };
}

export default buildApplicationContext;
