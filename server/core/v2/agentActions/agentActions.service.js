import crypto from "node:crypto";
import mongoose from "mongoose";
import Channel from "../channels/channels.model.js";
import ChannelService from "../channels/channels.service.js";
import ChannelValidator from "../channels/channels.validate.js";
import { DetectionSetting } from "../detectionSettings/detectionSettings.model.js";
import { AgentAction, AuditEvent } from "./agentActions.model.js";
import { AgentOneTimeSchedule, AgentRuntimeObservation } from "../agentData/agentData.model.js";
import { isScheduleActiveNow } from "../../../services/detectionSchedule.resolver.js";
import { findScheduleConflict, hasAnyWindow } from "../../../utils/scheduleWindows.js";
import { isHumanCredential } from "./agentGateway.js";
import { getRequestTimezone } from "../../../utils/timezone.js";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";
import { runtimeStatus } from "./runtimeStatus.js";
import logger from "../../../utils/logger.js";

const MAX_TARGETS = 100;
const DEFAULT_EXPIRY_MS = 15 * 60 * 1000;
const CONFIG_FIELDS = new Set(["videoLinkRequirement", "video_min_length", "video_max_length", "level_of_importance", "alertThreshold", "faceAuth", "videoResolution", "referencePoints"]);
const SCHEDULE_FIELDS = new Set(["mode", "timezone", "days"]);
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function fail(res, status, message, error) {
  return res.status(status).json({ statusCode: status, body: { status: "failed", message, ...(error ? { errorCode: error } : {}) } });
}
function ok(res, message, data, status = 200) {
  return res.status(status).json({ statusCode: status, body: { status: "success", message, data } });
}
function objectId(value) { return mongoose.Types.ObjectId.isValid(String(value || "")); }
function validTimezone(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try { Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}
function validClock(value) { return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function validSchedule(schedule) {
  if (!schedule || typeof schedule !== "object" || !["always", "custom"].includes(schedule.mode)) return false;
  if (schedule.timezone !== undefined && !validTimezone(schedule.timezone)) return false;
  if (schedule.days === undefined) return schedule.mode === "always";
  if (!schedule.days || typeof schedule.days !== "object" || Object.keys(schedule.days).some((day) => !WEEKDAYS.includes(day))) return false;
  if (!WEEKDAYS.every((day) => Array.isArray(schedule.days[day] ?? []) && (schedule.days[day] ?? []).every((window) => window && validClock(window.start) && validClock(window.end)))) return false;
  if (schedule.mode === "custom" && !hasAnyWindow(schedule.days)) return false;
  return !findScheduleConflict(schedule.days);
}
function subject(req) {
  const data = req.verified?.userData || {};
  return { subject: String(data.memberId || data.userId || data.user_id || data.adminId || ""), memberId: data.memberId ? String(data.memberId) : undefined, userId: data.userId || data.user_id ? String(data.userId || data.user_id) : undefined, adminId: data.adminId ? String(data.adminId) : undefined };
}
function accountId(req) { return String(req.verified?.userData?.adminId || ""); }
function actionView(action) {
  const row = action.toObject ? action.toObject() : action;
  return { actionId: String(row._id), agentRunId: row.agentRunId, operation: row.operation, status: row.status, proposalVersion: row.proposalVersion, digest: row.digest, expiresAt: row.expiresAt, decidedAt: row.decidedAt, executedAt: row.executedAt, verifiedAt: row.verifiedAt, requestingPrincipal: row.requester, approvingPrincipal: row.approver, correlationId: row.correlationId, requestId: row.requestId, createdAt: row.createdAt, updatedAt: row.updatedAt, impact: row.impact, targets: row.targets.map((target) => ({ channelId: String(target.channelId), detectionType: target.detectionType, settingId: target.settingId ? String(target.settingId) : undefined, before: target.before, after: target.after, expectedConfigurationVersion: target.expectedVersion, result: target.result })) };
}
function can(req, mode) {
  const data = req.verified?.userData || {};
  if (!data.memberId) return true;
  const config = req.verified?.permissionConfig?.[0]?.permissionConfig;
  return Boolean(config?.channels?.[mode]);
}
function accessibleFilter(req, ids) {
  const data = req.verified?.userData || {};
  // Owner tokens vary between legacy login flows; only apply userId when the
  // token actually carries it. Member scope is governed by the explicit
  // authorized-channel assignment rather than the channel owner's userId.
  if (!data.memberId) {
    const filter = { _id: { $in: ids } };
    const ownerId = data.userId || data.user_id;
    return ownerId ? { ...filter, userId: String(ownerId) } : filter;
  }
  const allowed = req.verified?.authorizedChannel?.channels || [];
  const allowedIds = new Set(allowed.map((id) => String(id)));
  return { _id: { $in: ids.filter((id) => allowedIds.has(String(id))) } };
}
function accessibleScopeFilter(req) {
  const data = req.verified?.userData || {};
  if (!data.memberId) {
    const ownerId = data.userId || data.user_id;
    return ownerId ? { userId: String(ownerId) } : {};
  }
  const allowed = (req.verified?.authorizedChannel?.channels || []).filter((id) => objectId(id)).map((id) => new mongoose.Types.ObjectId(id));
  return { _id: { $in: allowed } };
}
function actionTargetScope(req) {
  if (!req.verified?.userData?.memberId) return {};
  const allowed = (req.verified?.authorizedChannel?.channels || []).filter(objectId).map((id) => new mongoose.Types.ObjectId(id));
  // Every target must still be assigned. A positive match on one target would
  // leak the other targets of a shared/multi-camera action after reassignment.
  return { targets: { $not: { $elemMatch: { channelId: { $nin: allowed } } } } };
}
function isAccessibleChannel(req, channel) {
  const data = req.verified?.userData || {};
  if (!data.memberId) {
    const ownerId = data.userId || data.user_id;
    return !ownerId || String(channel.userId) === String(ownerId);
  }
  return (req.verified?.authorizedChannel?.channels || []).some((id) => String(id) === String(channel._id));
}
function proposalDigest(operation, targets, after) {
  return crypto.createHash("sha256").update(JSON.stringify({ operation, targets: targets.map((target) => ({ channelId: String(target.channelId), detectionType: target.detectionType, settingId: target.settingId ? String(target.settingId) : null, before: target.before, expectedVersion: target.expectedVersion })), after })).digest("hex");
}
function requestFingerprint(operation, targets, after) {
  return crypto.createHash("sha256").update(JSON.stringify({ operation, targets, after })).digest("hex");
}
function assertProposal(action, body) {
  if (Number(body.proposalVersion) !== action.proposalVersion || String(body.digest || "") !== action.digest) return "PROPOSAL_MISMATCH";
  if (new Date(action.expiresAt).getTime() <= Date.now()) return "ACTION_EXPIRED";
  return null;
}
async function audit(action, actor, actionName, target, before, after, outcome, requestId = action.requestId) {
  await AuditEvent.create({ accountId: action.accountId, actionId: action._id, source: "agent", actor, action: actionName, target, before, after, outcome, correlationId: action.correlationId, requestId });
}

class AgentActionsService {
  async prepare(req, res) {
    if (!can(req, "edit")) return fail(res, 403, "You do not have permission to change camera detections.");
    const { operation, targets, after, idempotencyKey } = req.body || {};
    const supportedOperation = ["camera_detection_toggle", "camera_processing_toggle", "camera_configuration_update", "camera_schedule_update", "one_time_restore"].includes(operation);
    const validOneTime = operation === "one_time_restore" && after?.disableAt && after?.restoreAt && !Number.isNaN(Date.parse(after.disableAt)) && !Number.isNaN(Date.parse(after.restoreAt)) && new Date(after.restoreAt) > new Date(after.disableAt);
    if (!supportedOperation) return fail(res, 400, "Unsupported agent action operation.");
    const needsEnabled = ["camera_detection_toggle", "camera_processing_toggle"].includes(operation);
    const hasConfig = operation === "camera_configuration_update" && after?.settings && typeof after.settings === "object" && !Array.isArray(after.settings);
    const hasSchedule = operation === "camera_schedule_update" && after?.schedule && typeof after.schedule === "object";
    if (!Array.isArray(targets) || !targets.length || targets.length > MAX_TARGETS || (needsEnabled && typeof after?.enabled !== "boolean") || (operation === "camera_configuration_update" && !hasConfig) || (operation === "camera_schedule_update" && !hasSchedule) || (operation === "one_time_restore" && !validOneTime) || typeof idempotencyKey !== "string" || !idempotencyKey.trim()) return fail(res, 400, "operation, targets, after, and idempotencyKey are required; configuration and schedule operations require their bounded payload.");
    if (hasConfig && Object.keys(after.settings).some((key) => !CONFIG_FIELDS.has(key))) return fail(res, 400, "Unsupported detector configuration field.");
    if (hasConfig) {
      const validation = ChannelValidator.validateUpdateChannelConfig(after.settings);
      if (validation.error) return fail(res, 400, validation.error.message, "INVALID_SETTINGS");
    }
    if (hasSchedule && (Object.keys(after.schedule).some((key) => !SCHEDULE_FIELDS.has(key)) || !validSchedule(after.schedule))) return fail(res, 400, "Unsupported or invalid detector schedule.", "INVALID_SCHEDULE");
    if (["one_time_restore", "camera_schedule_update"].includes(operation)) {
      const explicitTimezone = operation === "one_time_restore" ? after.timezone : after.schedule.timezone;
      const adminTimezone = req.verified?.userData?.adminTimezoneConfigured === false ? null : req.verified?.userData?.timezone;
      if (!validTimezone(explicitTimezone) && !validTimezone(adminTimezone)) return fail(res, 400, "A valid schedule timezone is required when the administrator has no configured timezone.", "INVALID_TIMEZONE");
    }
    const allowedAfter = operation === "one_time_restore" ? new Set(["disableAt", "restoreAt", "timezone"]) : operation === "camera_configuration_update" ? new Set(["enabled", "settings"]) : operation === "camera_schedule_update" ? new Set(["enabled", "schedule"]) : new Set(["enabled"]);
    if (!after || typeof after !== "object" || Object.keys(after).some((key) => !allowedAfter.has(key))) return fail(res, 400, "Unsupported field in after payload.", "UNSUPPORTED_AFTER_FIELD");
    if (operation === "one_time_restore" && after.timezone !== undefined && !validTimezone(after.timezone)) return fail(res, 400, "timezone must be a valid IANA timezone.", "INVALID_TIMEZONE");
    if (!objectId(accountId(req))) return fail(res, 401, "Authenticated administrator scope is required.");
    if (operation === "camera_processing_toggle" && targets.some((target) => target?.detectionType !== "__camera__" || target?.settingId != null)) return fail(res, 400, "A camera-wide target requires detectionType __camera__ and no settingId.", "INVALID_TARGET");
    const normalized = targets.map((target) => ({ channelId: String(target?.channelId || ""), detectionType: operation === "camera_processing_toggle" ? "" : String(target?.detectionType || ""), settingId: operation === "camera_processing_toggle" ? null : target?.settingId ? String(target.settingId) : null }));
    if (normalized.some((target) => !objectId(target.channelId) || (operation !== "camera_processing_toggle" && !target.detectionType))) return fail(res, 400, "Every target requires a valid channelId; detector type is required unless changing whole-camera processing.");
    if (["camera_configuration_update", "camera_schedule_update"].includes(operation) && normalized.some((target) => !target.detectionType)) return fail(res, 400, "Configuration and schedule operations require detector type.");
    if (["camera_configuration_update", "camera_schedule_update"].includes(operation) && normalized.some((target) => !objectId(target.settingId))) return fail(res, 400, "Configuration and schedule operations require settingId.", "SETTING_ID_REQUIRED");
    if (new Set(normalized.map((target) => `${target.channelId}:${target.detectionType}`)).size !== normalized.length) return fail(res, 400, "Duplicate action targets are not allowed.", "DUPLICATE_TARGET");
    const requester = subject(req);
    if (!requester.subject) return fail(res, 401, "Authenticated requester identity is required.");
    const fingerprint = requestFingerprint(operation, normalized, after);
    const existing = await AgentAction.findOne({ accountId: accountId(req), "requester.subject": requester.subject, idempotencyKey: idempotencyKey.trim() });
    if (existing) {
      if (req.verified?.userData?.memberId && existing.targets.some((target) => !(req.verified?.authorizedChannel?.channels || []).some((id) => String(id) === String(target.channelId)))) return fail(res, 403, "One or more action cameras are no longer in your scope.", "ACTION_OUT_OF_SCOPE");
      if (existing.requestFingerprint !== fingerprint) return fail(res, 409, "This idempotency key was already used with different action content.", "IDEMPOTENCY_KEY_REUSED");
      if (existing.status === "prepared" && new Date(existing.expiresAt).getTime() <= Date.now()) return fail(res, 409, "Action proposal has expired.", "ACTION_EXPIRED");
      return ok(res, "Existing action proposal returned.", actionView(existing));
    }
    const ids = normalized.map((target) => new mongoose.Types.ObjectId(target.channelId));
    let channels = await Channel.find(accessibleFilter(req, ids)).select("_id userId name customName control detections updatedAt configurationVersion").lean();
    const requestedChannelIds = new Set(normalized.map((target) => target.channelId));
    if (channels.length !== requestedChannelIds.size) return fail(res, 403, "One or more requested cameras are unavailable in your scope.");
    if (["camera_configuration_update", "camera_schedule_update"].includes(operation)) {
      let shared;
      try {
        shared = await Promise.all(normalized.map(async (target) => {
        // Resolve the setting globally first.  Scope filtering before this
        // check would hide an out-of-scope linked camera and produce an
        // incomplete proposal for a shared setting.
        const linked = await Channel.find({ [`detections.${target.detectionType}.id`]: target.settingId }).select("_id userId name customName detections updatedAt configurationVersion").lean();
        if (linked.some((channel) => !isAccessibleChannel(req, channel))) {
          throw Object.assign(new Error("A shared detector setting affects a camera outside the caller's scope."), { code: "SHARED_SETTING_OUT_OF_SCOPE" });
        }
          return linked;
        }));
      } catch (error) {
        if (error?.code === "SHARED_SETTING_OUT_OF_SCOPE") return fail(res, 403, error.message, error.code);
        throw error;
      }
      const merged = new Map(channels.map((channel) => [String(channel._id), channel]));
      shared.flat().forEach((channel) => merged.set(String(channel._id), channel));
      channels = [...merged.values()];
      const requestedKeys = new Set(normalized.map((target) => `${target.channelId}:${target.detectionType}`));
      for (const target of normalized.slice()) {
        for (const channel of shared.flat().filter((candidate) => String(candidate.detections?.[target.detectionType]?.id || "") === target.settingId)) {
          const key = `${channel._id}:${target.detectionType}`;
          if (!requestedKeys.has(key)) {
            normalized.push({ channelId: String(channel._id), detectionType: target.detectionType, settingId: target.settingId });
            requestedKeys.add(key);
          }
        }
      }
      if (normalized.length > MAX_TARGETS) return fail(res, 400, `Shared setting impact exceeds the maximum of ${MAX_TARGETS} targets.`, "TARGET_LIMIT_EXCEEDED");
    }
    const byId = new Map(channels.map((channel) => [String(channel._id), channel]));
    const settingIds = [...new Set(channels.flatMap((channel) => Object.values(channel.detections || {}).map((entry) => entry?.id).filter(Boolean).map(String)))];
    const settingDocs = settingIds.length ? await DetectionSetting.find({ _id: { $in: settingIds } }).select("_id settings").lean() : [];
    const settingsById = new Map(settingDocs.map((setting) => [String(setting._id), setting]));
    let resolved;
    try {
      resolved = normalized.map((target) => {
      const channel = byId.get(target.channelId);
      const link = target.detectionType ? channel?.detections?.[target.detectionType] : null;
      const settingDoc = link?.id ? settingsById.get(String(link.id)) : null;
      if (["camera_detection_toggle", "camera_configuration_update", "camera_schedule_update", "one_time_restore"].includes(operation) && !link?.id) throw new Error(`Detection ${target.detectionType} is not assigned to camera ${target.channelId}.`);
      if (target.settingId && String(link?.id || "") !== target.settingId) throw new Error(`Setting ${target.settingId} is not assigned to camera ${target.channelId}.`);
      if (operation === "camera_processing_toggle" && !Object.values(channel?.detections || {}).some((entry) => entry?.id)) throw new Error(`Camera ${target.channelId} has no processing configuration.`);
      const affectedDetectors = operation === "camera_processing_toggle" ? Object.entries(channel.detections || {}).filter(([, entry]) => entry?.id).map(([key, entry]) => ({ detectionType: key, enabled: Boolean(entry.enabled), settingId: String(entry.id) })) : undefined;
      const afterValue = operation === "one_time_restore" ? { disableAt: new Date(after.disableAt), restoreAt: new Date(after.restoreAt), timezone: after.timezone || getRequestTimezone(req), enabled: false } : operation === "camera_configuration_update" ? { settings: after.settings, enabled: after.enabled ?? Boolean(link?.enabled) } : operation === "camera_schedule_update" ? { schedule: { ...after.schedule, timezone: after.schedule.timezone || getRequestTimezone(req) }, enabled: after.enabled ?? (after.schedule.mode === "always" ? true : Boolean(link?.enabled)) } : { enabled: after.enabled, ...(affectedDetectors ? { affectedDetectors: affectedDetectors.map((entry) => ({ ...entry, enabled: after.enabled })) } : {}) };
      return { channelId: channel._id, detectionType: target.detectionType || "__camera__", settingId: link?.id || null, before: { enabled: operation === "camera_processing_toggle" ? Boolean(channel.control) : Boolean(link?.enabled), ...(operation === "camera_configuration_update" ? { settings: settingDoc?.settings || {} } : {}), ...(operation === "camera_schedule_update" ? { schedule: link?.schedule || null } : {}), ...(affectedDetectors ? { affectedDetectors } : {}), cameraName: channel.customName || channel.name || String(channel._id) }, after: afterValue, expectedVersion: String(channel.configurationVersion ?? 0) };
      });
    } catch (error) {
      return fail(res, 400, error.message || "Invalid action target.", "INVALID_TARGET");
    }
    const digest = proposalDigest(operation, resolved, after);
    const requestId = String(req.header("x-request-id") || crypto.randomUUID());
    const agentRunId = typeof req.body?.agentRunId === "string" && req.body.agentRunId.trim() ? req.body.agentRunId.trim().slice(0, 200) : null;
    let action;
    try {
      action = await AgentAction.create({ accountId: accountId(req), requester, operation, agentRunId, targets: resolved, proposalVersion: 1, digest, requestFingerprint: fingerprint, idempotencyKey: idempotencyKey.trim(), expiresAt: new Date(Date.now() + DEFAULT_EXPIRY_MS), correlationId: crypto.randomUUID(), requestId, impact: { targetCount: resolved.length, enabled: after.enabled, operation, requiresScheduler: operation === "one_time_restore", affectedTargets: resolved.map((target) => ({ channelId: String(target.channelId), detectionType: target.detectionType, settingId: target.settingId ? String(target.settingId) : null })) } });
    } catch (error) {
      if (error?.code === 11000) {
        const retry = await AgentAction.findOne({ accountId: accountId(req), "requester.subject": requester.subject, idempotencyKey: idempotencyKey.trim() });
        if (retry?.requestFingerprint === fingerprint) return ok(res, "Existing action proposal returned.", actionView(retry));
        return fail(res, 409, "This idempotency key was already used with different action content.", "IDEMPOTENCY_KEY_REUSED");
      }
      throw error;
    }
    if (operation === "one_time_restore") {
      await Promise.all(resolved.map((target) => AgentOneTimeSchedule.create({ accountId: accountId(req), actionId: action._id, channelId: target.channelId, detectionType: target.detectionType, timezone: target.after.timezone, disableAt: target.after.disableAt, restoreAt: target.after.restoreAt, restoreEnabled: Boolean(target.before.enabled), expectedConfigurationVersion: target.expectedVersion, status: "planned" })));
    }
    await audit(action, requester, "agent_action_prepared", { operation }, null, { targets: resolved.map((target) => ({ channelId: String(target.channelId), detectionType: target.detectionType, enabled: target.after.enabled })) }, { status: "prepared" }, requestId);
    return ok(res, "Action proposal prepared. No camera setting was changed.", actionView(action), 201);
  }

  async decision(req, res) {
    if (!can(req, "edit")) return fail(res, 403, "You do not have permission to approve camera detection changes.");
    if (!isHumanCredential(req)) return fail(res, 403, "An agent credential cannot provide the human approval decision.", "HUMAN_APPROVAL_REQUIRED");
    let action = await this.#findScoped(req, req.params.actionId);
    if (!action) return fail(res, 404, "Agent action was not found.");
    const mismatch = assertProposal(action, req.body || {});
    if (mismatch) { if (mismatch === "ACTION_EXPIRED") { action.status = "expired"; await action.save(); } return fail(res, 409, mismatch === "ACTION_EXPIRED" ? "This action proposal has expired. Prepare a new action." : "The proposal version or digest no longer matches. Prepare a new action.", mismatch); }
    const decision = req.body?.decision;
    if (!["approve", "cancel"].includes(decision)) return fail(res, 400, "decision must be approve or cancel.");
    const decisionKey = String(req.body?.idempotencyKey || "").trim();
    if (decisionKey && action.decisionIdempotencyKey === decisionKey) {
      if (action.status !== (decision === "approve" ? "approved" : "cancelled")) return fail(res, 409, "This idempotency key was already used for a different decision.", "IDEMPOTENCY_KEY_REUSED");
      return ok(res, "Existing decision returned.", actionView(action));
    }
    if (action.status !== "prepared") return fail(res, 409, `This action is already ${action.status}.`);
    const nextStatus = decision === "approve" ? "approved" : "cancelled";
    const decided = await AgentAction.findOneAndUpdate({ _id: action._id, status: "prepared", ...(decisionKey ? { $or: [{ decisionIdempotencyKey: null }, { decisionIdempotencyKey: decisionKey }] } : {}) }, { $set: { status: nextStatus, approver: subject(req), decisionIdempotencyKey: decisionKey || null, decidedAt: new Date() } }, { new: true });
    if (!decided) return fail(res, 409, "This action was decided concurrently or is no longer prepared.", "ACTION_NOT_DECISIONABLE");
    action = decided;
    // Approval is not execution: the runner must not claim the schedule until
    // execute has rechecked scope and the configuration version.
    if (action.operation === "one_time_restore" && decision === "cancel") await AgentOneTimeSchedule.updateMany({ actionId: action._id, status: "planned" }, { $set: { status: "cancelled", cancelledAt: new Date() } });
    await audit(action, action.approver, `agent_action_${action.status}`, { operation: action.operation }, null, null, { status: action.status });
    return ok(res, `Action ${action.status}.`, actionView(action));
  }

  async execute(req, res) {
    if (!can(req, "edit")) return fail(res, 403, "You do not have permission to execute camera detection changes.");
    const initial = await this.#findScoped(req, req.params.actionId);
    if (!initial) return fail(res, 404, "Agent action was not found.");
    if (req.verified?.userData?.tokenType === 'detection-agent' &&
      (!initial.approver || !initial.decidedAt || initial.status === 'prepared'))
      return fail(res, 403, 'Human approval is required before execution.');
    const executionKey = String(req.body?.idempotencyKey || "").trim();
    if (!executionKey) return fail(res, 400, "idempotencyKey is required.");
    if (["completed", "partially_failed", "failed", "verification_pending"].includes(initial.status)) {
      if (initial.executionIdempotencyKey && initial.executionIdempotencyKey !== executionKey) return fail(res, 409, "This execution idempotency key was already used with different content.", "IDEMPOTENCY_KEY_REUSED");
      return ok(res, "Existing execution result returned.", actionView(initial));
    }
    if (initial.status === "executing") {
      if (initial.executionIdempotencyKey !== executionKey) return fail(res, 409, "This action is already being executed with a different idempotency key.", "IDEMPOTENCY_KEY_REUSED");
      return ok(res, "Execution is already in progress.", actionView(initial));
    }
    const mismatch = assertProposal(initial, req.body || {});
    if (mismatch) return fail(res, 409, mismatch === "ACTION_EXPIRED" ? "This action proposal has expired. Prepare a new action." : "The proposal version or digest no longer matches. Prepare a new action.", mismatch);
    const action = await AgentAction.findOneAndUpdate({ _id: initial._id, status: "approved" }, { $set: { status: "executing", executedAt: new Date(), executionIdempotencyKey: executionKey } }, { new: true });
    if (!action) return fail(res, 409, "This action is already being executed or is no longer approved.");
    const results = [];
    for (const target of action.targets) {
      try {
        results.push(await this.#executeTarget(req, action, target));
      } catch (error) {
        logger.error(`[AGENT_ACTION] execution failed actionId=${action._id} requestId=${action.requestId} channelId=${target.channelId} error=${error?.message || "unknown"}`);
        results.push({ status: "failed", errorCode: "EXECUTION_ERROR", message: "The detector operation could not be completed.", retryStatus: "retryable", reconciliationStatus: "pending" });
      }
    }
    action.targets.forEach((target, index) => { target.result = results[index]; });
    const successful = results.filter((result) => result.status === "completed").length;
    action.status = results.some((result) => result.status === "invalidated") ? "invalidated" : results.length > 0 && results.every((result) => result.status === "verification_pending") ? "verification_pending" : successful === results.length ? "completed" : successful ? "partially_failed" : "failed";
    action.verifiedAt = action.status === "verification_pending" ? null : new Date(); await action.save();
    if (action.operation === "one_time_restore") {
      await Promise.all(action.targets.map((target) => AgentOneTimeSchedule.updateOne(
        { actionId: action._id, channelId: target.channelId, detectionType: target.detectionType, status: "planned" },
        target.result?.status === "verification_pending"
          ? { $set: { status: "approved" }, $push: { executionHistory: { at: new Date(), status: "approved_for_scheduler", correlationId: action.correlationId } } }
          : { $set: { status: "conflict" }, $push: { executionHistory: { at: new Date(), status: "execution_rejected", errorCode: target.result?.errorCode || "EXECUTION_REJECTED" } } },
      )));
    }
    await audit(action, subject(req), "agent_action_executed", { operation: action.operation }, null, null, { status: action.status, results });
    return ok(res, "Agent action execution completed.", actionView(action));
  }

  async get(req, res) { if (!can(req, "view")) return fail(res, 403, "You do not have permission to view camera actions."); const action = await this.#findScoped(req, req.params.actionId); return action ? ok(res, "Agent action retrieved.", actionView(action)) : fail(res, 404, "Agent action was not found."); }
  async list(req, res) {
    if (!can(req, "view")) return fail(res, 403, "You do not have permission to view camera actions.");
    const validOperations = ["camera_detection_toggle", "camera_processing_toggle", "camera_configuration_update", "camera_schedule_update", "one_time_restore"];
    const validStatuses = ["prepared", "approved", "cancelled", "expired", "invalidated", "executing", "completed", "partially_failed", "failed", "verification_pending"];
    if (req.query.operation && !validOperations.includes(String(req.query.operation))) return fail(res, 400, "Unsupported action operation filter.", "INVALID_FILTER");
    if (req.query.status && !validStatuses.includes(String(req.query.status))) return fail(res, 400, "Unsupported action status filter.", "INVALID_FILTER");
    for (const key of ["from", "to"]) if (req.query[key] && Number.isNaN(new Date(String(req.query[key])).getTime())) return fail(res, 400, `${key} must be an ISO-8601 timestamp.`, "INVALID_FILTER");
    if (req.query.targetChannelId && !objectId(req.query.targetChannelId)) return fail(res, 400, "targetChannelId must be a valid ObjectId.", "INVALID_FILTER");
    if (req.query.targetSettingId && !objectId(req.query.targetSettingId)) return fail(res, 400, "targetSettingId must be a valid ObjectId.", "INVALID_FILTER");
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const filter = { accountId: accountId(req), ...actionTargetScope(req), $and: [{ $or: [{ "requester.subject": subject(req).subject }, { "approver.subject": subject(req).subject }] }] };
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.operation) filter.operation = String(req.query.operation);
    if (req.query.agentRunId) filter.agentRunId = String(req.query.agentRunId);
    if (req.query.targetChannelId) filter["targets.channelId"] = new mongoose.Types.ObjectId(req.query.targetChannelId);
    if (req.query.targetSettingId) filter["targets.settingId"] = new mongoose.Types.ObjectId(req.query.targetSettingId);
    if (req.query.actor) filter.$and.push({ $or: [{ "requester.subject": String(req.query.actor) }, { "approver.subject": String(req.query.actor) }] });
    if (req.query.from || req.query.to) filter.createdAt = { ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}), ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}) };
    const [actions, total] = await Promise.all([AgentAction.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit), AgentAction.countDocuments(filter)]);
    return ok(res, "Agent actions retrieved.", { items: actions.map(actionView), total, hasMore: skip + actions.length < total, skip, limit, sort: "createdAt desc, _id desc", appliedFilters: req.query, dataFreshAt: new Date().toISOString(), requestId: String(req.header("x-request-id") || crypto.randomUUID()) });
  }
  async auditEvents(req, res) {
    if (!can(req, "view")) return fail(res, 403, "You do not have permission to view audit events.");
    for (const key of ["from", "to"]) if (req.query[key] && Number.isNaN(new Date(String(req.query[key])).getTime())) return fail(res, 400, `${key} must be an ISO-8601 timestamp.`, "INVALID_FILTER");
    for (const key of ["actionId", "targetChannelId", "targetSettingId"]) if (req.query[key] && !objectId(req.query[key])) return fail(res, 400, `${key} must be a valid ObjectId.`, "INVALID_FILTER");
    const filter = { accountId: accountId(req) };
    if (req.verified?.userData?.memberId) {
      filter["target.channelId"] = { $in: (req.verified?.authorizedChannel?.channels || []).map(String) };
    }
    if (req.query.action) filter.action = String(req.query.action);
    if (req.query.actionId && objectId(req.query.actionId)) filter.actionId = new mongoose.Types.ObjectId(req.query.actionId);
    if (req.query.targetChannelId) {
      const requestedChannelId = String(req.query.targetChannelId);
      if (req.verified?.userData?.memberId && !(req.verified?.authorizedChannel?.channels || []).some((id) => String(id) === requestedChannelId)) {
        return ok(res, "Audit events retrieved.", { items: [], total: 0, hasMore: false, skip: 0, limit: Math.min(Math.max(Number(req.query.limit) || 50, 1), 100), sort: "createdAt desc, _id desc", appliedFilters: req.query, dataFreshAt: new Date().toISOString(), requestId: String(req.header("x-request-id") || crypto.randomUUID()) });
      }
      filter["target.channelId"] = requestedChannelId;
    }
    if (req.query.targetSettingId) filter["target.settingId"] = String(req.query.targetSettingId);
    if (req.query.actor) filter["actor.subject"] = String(req.query.actor);
    if (req.query.from || req.query.to) filter.createdAt = { ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}), ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}) };
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const [events, total] = await Promise.all([AuditEvent.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), AuditEvent.countDocuments(filter)]);
    return ok(res, "Audit events retrieved.", { items: events.map((event) => ({ ...event, eventId: String(event._id) })), total, hasMore: skip + events.length < total, skip, limit, sort: "createdAt desc, _id desc", appliedFilters: req.query, dataFreshAt: new Date().toISOString(), requestId: String(req.header("x-request-id") || crypto.randomUUID()) });
  }
  async detectionStatus(req, res) {
    if (!can(req, "view")) return fail(res, 403, "You do not have permission to view camera detections.");
    const requestedIds = String(req.query.channelIds || "").split(",").filter(Boolean);
    const detectionType = String(req.query.detectionType || "");
    if (requestedIds.length > MAX_TARGETS || requestedIds.some((id) => !objectId(id)) || (detectionType && !Object.hasOwn(DETECTION_TYPES, detectionType))) return fail(res, 400, "Up to 100 valid channelIds and an optional real detector key are supported.", "INVALID_FILTER");
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), MAX_TARGETS);
    const filter = requestedIds.length ? accessibleFilter(req, requestedIds.map((id) => new mongoose.Types.ObjectId(id))) : accessibleScopeFilter(req);
    if (req.query.configuredEnabled !== undefined && !["true", "false"].includes(String(req.query.configuredEnabled))) return fail(res, 400, "configuredEnabled must be true or false.", "INVALID_FILTER");
    if (req.query.configuredEnabled !== undefined && !detectionType) return fail(res, 400, "configuredEnabled requires detectionType.", "INVALID_FILTER");
    if (req.query.configuredEnabled !== undefined) filter[`detections.${detectionType}.enabled`] = String(req.query.configuredEnabled) === "true";
    if (detectionType) filter[`detections.${detectionType}.id`] = { $exists: true, $ne: null };
    const [total, channels] = await Promise.all([
      Channel.countDocuments(filter),
      Channel.find(filter).select("_id detections configurationVersion").sort({ _id: 1 }).skip(skip).limit(limit).lean(),
    ]);
    const pairs = channels.flatMap((channel) => (detectionType ? [detectionType] : Object.keys(channel.detections || {}).filter((key) => Object.hasOwn(DETECTION_TYPES, key) && channel.detections[key]?.id)).map((key) => ({ channel, key })));
    const observations = await Promise.all(pairs.map(({ channel, key }) => AgentRuntimeObservation.findOne({ accountId: accountId(req), channelId: channel._id, detectionType: key }).sort({ observedAt: -1 }).lean()));
    const statuses = pairs.map(({ channel, key }, index) => runtimeStatus(channel, key, observations[index]));
    return ok(res, "Detection runtime status retrieved. Runtime telemetry is unavailable for unknown states.", { statuses, items: statuses, total, hasMore: skip + channels.length < total, skip, limit, paginationUnit: "camera", sort: "_id asc, detectionType asc", appliedFilters: req.query, dataFreshAt: new Date().toISOString(), requestId: String(req.header("x-request-id") || crypto.randomUUID()) });
  }
  async #findScoped(req, id) { if (!objectId(id) || !objectId(accountId(req))) return null; return AgentAction.findOne({ _id: id, accountId: accountId(req), ...actionTargetScope(req), $or: [{ "requester.subject": subject(req).subject }, { "approver.subject": subject(req).subject }] }); }
  async #executeTarget(req, action, target) {
    const current = await Channel.findOne(accessibleFilter(req, [target.channelId])).select("_id updatedAt configurationVersion control detections").lean();
    if (!current) return { status: "failed", errorCode: "NOT_FOUND", message: "Camera is no longer accessible.", retryStatus: "terminal", reconciliationStatus: "unreconciled" };
    if (String(current.configurationVersion ?? 0) !== target.expectedVersion) return { status: "invalidated", errorCode: "STALE_CONFIGURATION", message: "Camera configuration changed after approval.", retryStatus: "reconciliation_required", reconciliationStatus: "pending" };
    if (action.operation === "one_time_restore") return { status: "verification_pending", desiredState: target.after, observedState: null, desiredVersion: target.expectedVersion, observedVersion: null, verifiedAt: null, retryStatus: "reconciliation_required", reconciliationStatus: "pending", message: "One-time schedule is approved and awaiting scheduler execution." };
    let response;
    const mockRes = { status(code) { this.code = code; return this; }, json(payload) { response = { code: this.code || payload?.statusCode || 200, payload }; return this; }, send(payload) { return this.json(payload); } };
    if (action.operation === "camera_processing_toggle") await ChannelService.updateChannel({ params: { id: String(target.channelId) }, body: { control: target.after.enabled ? 1 : 0 }, verified: { ...req.verified, agentActionId: String(action._id) } }, mockRes);
    else if (action.operation === "camera_configuration_update") await ChannelService.updateChannelConfiguration({ query: { id: String(target.channelId), detectionKey: target.detectionType }, body: { enabled: target.after.enabled, settings: target.after.settings }, verified: { ...req.verified, agentActionId: String(action._id) } }, mockRes);
    else if (action.operation === "camera_schedule_update") await this.#executeScheduleUpdate(req, action, target, mockRes);
    else await ChannelService.toggleDetection({ body: { channelId: String(target.channelId), detectionType: target.detectionType, enable: target.after.enabled }, verified: { ...req.verified, agentActionId: String(action._id) } }, mockRes);
    const body = response?.payload?.body;
    if (!response || response.code < 200 || response.code >= 300 || body?.status !== "success") {
      logger.warn(`[AGENT_ACTION] execution rejected actionId=${action._id} requestId=${action.requestId} channelId=${target.channelId} httpStatus=${response?.code ?? "none"} reason=${body?.message || "no response"}`);
      return { status: "failed", errorCode: body?.errorCode || "EXECUTION_REJECTED", message: response?.code < 500 && typeof body?.error === "string" ? `${body?.message || "Invalid request"}: ${body.error}` : body?.message || "The detector service rejected the change.", retryStatus: response?.code >= 500 ? "retryable" : "terminal", reconciliationStatus: "pending" };
    }
    const observed = await Channel.findOne(accessibleFilter(req, [target.channelId])).select("_id updatedAt configurationVersion control detections").lean();
    const detectorResults = action.operation === "camera_processing_toggle" ? (target.after.affectedDetectors || []).map((entry) => {
      const actual = observed?.detections?.[entry.detectionType];
      const matches = String(actual?.id || "") === entry.settingId && actual?.enabled === entry.enabled;
      return { detectionType: entry.detectionType, settingId: entry.settingId, desiredEnabled: entry.enabled,
        enabled: Boolean(actual?.enabled), effectiveEnabled: Boolean(actual?.enabled) && isScheduleActiveNow(actual?.schedule),
        status: matches ? "completed" : "verification_pending" };
    }) : undefined;
    const enabled = action.operation === "camera_processing_toggle" ? Boolean(observed?.control) : observed?.detections?.[target.detectionType]?.enabled;
    const schedule = action.operation === "camera_processing_toggle" ? null : observed?.detections?.[target.detectionType]?.schedule;
    const effectiveEnabled = Boolean(enabled) && isScheduleActiveNow(schedule);
    if (enabled !== target.after.enabled || detectorResults?.some((entry) => entry.status !== "completed")) return { status: "verification_pending", desiredState: target.after, observedState: { enabled: Boolean(enabled), effectiveEnabled, ...(detectorResults ? { affectedDetectors: detectorResults } : {}) }, desiredVersion: target.expectedVersion, observedVersion: String(observed?.configurationVersion ?? 0), verifiedAt: null, retryStatus: "reconciliation_required", reconciliationStatus: "pending" };
    return { status: "completed", desiredState: target.after, observedState: { enabled, effectiveEnabled, ...(detectorResults ? { affectedDetectors: detectorResults } : {}) }, desiredVersion: target.expectedVersion, observedVersion: String(observed?.configurationVersion ?? 0), verifiedAt: new Date(), retryStatus: "not_required", reconciliationStatus: "reconciled" };
  }
  async #executeScheduleUpdate(req, action, target, mockRes) {
    const channel = await Channel.findById(target.channelId).select("userId detections").lean();
    const setting = channel?.detections?.[target.detectionType];
    if (!setting?.id) return mockRes.status(404).json({ body: { status: "failed", message: "Detector is not assigned." } });
    const schedule = target.after.schedule || {};
    const allowed = ["mode", "timezone", "days"];
    if (Object.keys(schedule).some((key) => !allowed.includes(key))) return mockRes.status(400).json({ body: { status: "failed", message: "Unsupported schedule field." } });
    const doc = await Channel.findById(target.channelId);
    const currentEnabled = Boolean(doc.detections[target.detectionType]?.enabled);
    if (typeof target.after.enabled === "boolean" && currentEnabled !== target.after.enabled) {
      const toggleResponse = {};
      const toggleRes = { status(code) { this.code = code; return this; }, json(payload) { toggleResponse.code = this.code || 200; toggleResponse.payload = payload; return this; } };
      await ChannelService.toggleDetection({ body: { channelId: String(target.channelId), detectionType: target.detectionType, enable: target.after.enabled }, verified: { ...req.verified, agentActionId: String(action._id) } }, toggleRes);
      if (toggleResponse.code < 200 || toggleResponse.code >= 300 || toggleResponse.payload?.body?.status !== "success") return mockRes.status(toggleResponse.code || 500).json(toggleResponse.payload || { body: { status: "failed", message: "The detector service rejected the schedule state." } });
    }
    if (typeof target.after.enabled === "boolean") doc.detections[target.detectionType].enabled = target.after.enabled;
    doc.detections[target.detectionType].schedule = schedule;
    doc.control = 1;
    doc.markModified(`detections.${target.detectionType}.schedule`);
    await doc.save();
    return mockRes.status(200).json({ body: { status: "success", message: "Schedule updated." } });
  }
}

export default new AgentActionsService();
