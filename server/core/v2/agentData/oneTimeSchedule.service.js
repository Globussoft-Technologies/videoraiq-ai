import Channel from "../channels/channels.model.js";
import ChannelService from "../channels/channels.service.js";
import { AgentAction, AuditEvent } from "../agentActions/agentActions.model.js";
import { AgentOneTimeSchedule } from "./agentData.model.js";

function invoke(fn, req) {
  let result;
  const res = { status(code) { this.code = code; return this; }, json(payload) { result = { code: this.code || 200, payload }; return this; } };
  return Promise.resolve(fn(req, res)).then(() => ({ code: result?.code || 500, body: result?.payload?.body }));
}
function internalRequest(schedule) { return { body: { channelId: String(schedule.channelId), detectionType: schedule.detectionType, enable: Boolean(schedule.restoreEnabled) }, params: { id: String(schedule.channelId) }, verified: { agentActionId: String(schedule.actionId), userData: { adminId: String(schedule.accountId), system: true } } }; }
async function schedulerAudit(schedule, action, name, outcome, target = {}) {
  try {
    await AuditEvent.create({
      accountId: schedule.accountId,
      actionId: schedule.actionId,
      source: "agent",
      actor: { subject: "agent-scheduler", source: "agent" },
      action: name,
      target: { channelId: String(schedule.channelId), detectionType: schedule.detectionType, ...target },
      before: null,
      after: null,
      outcome,
      correlationId: action?.correlationId || String(schedule.actionId),
      requestId: action?.requestId || String(schedule.actionId),
    });
  } catch { /* audit failure must not stop durable schedule recovery */ }
}

async function disable(schedule) {
  const channel = await Channel.findById(schedule.channelId).select("_id updatedAt configurationVersion control detections").lean();
  if (!channel) throw Object.assign(new Error("Camera no longer exists."), { code: "NOT_FOUND" });
  if (String(channel.configurationVersion ?? 0) !== schedule.expectedConfigurationVersion) throw Object.assign(new Error("Camera configuration changed before scheduled disable."), { code: "STALE_CONFIGURATION" });
  const alreadyDisabled = schedule.detectionType === "__camera__"
    ? !Boolean(channel.control)
    : channel.detections?.[schedule.detectionType]?.enabled === false;
  const request = { ...internalRequest(schedule), body: { channelId: String(schedule.channelId), detectionType: schedule.detectionType, enable: false }, params: { id: String(schedule.channelId) } };
  const outcome = alreadyDisabled ? { code: 200, body: { status: "success" } } : schedule.detectionType === "__camera__"
    ? await invoke((req, res) => ChannelService.updateChannel(req, res), { ...request, body: { control: 0 } })
    : await invoke((req, res) => ChannelService.toggleDetection(req, res), request);
  if (outcome.code < 200 || outcome.code >= 300 || outcome.body?.status !== "success") throw Object.assign(new Error(outcome.body?.message || "Scheduled disable was rejected."), { code: "EXECUTION_REJECTED" });
  const observed = alreadyDisabled ? channel : await Channel.findById(schedule.channelId).select("updatedAt configurationVersion detections").lean();
  await AgentOneTimeSchedule.updateOne({ _id: schedule._id, status: "executing" }, { $set: { disableObservedVersion: String(observed.configurationVersion ?? 0) }, $push: { executionHistory: { at: new Date(), status: "disabled", observedVersion: String(observed.configurationVersion ?? 0) } } });
  await schedulerAudit(schedule, await AgentAction.findById(schedule.actionId).select("correlationId requestId").lean(), "agent_schedule_disabled", { status: "succeeded", noOp: alreadyDisabled, observedVersion: String(observed.configurationVersion ?? 0) });
}

async function restore(schedule) {
  const channel = await Channel.findById(schedule.channelId).select("_id updatedAt configurationVersion control detections").lean();
  const current = schedule.detectionType === "__camera__" ? { enabled: Boolean(channel?.control) } : channel?.detections?.[schedule.detectionType];
  if (!channel || !current || current.enabled !== false || String(channel.configurationVersion ?? 0) !== schedule.disableObservedVersion) {
    await AgentOneTimeSchedule.updateOne({ _id: schedule._id }, { $set: { status: "conflict" }, $push: { executionHistory: { at: new Date(), status: "conflict", reason: "Configuration changed or detector was manually changed after disable." } } });
    await AgentAction.updateOne({ _id: schedule.actionId, status: "verification_pending" }, { $set: { status: "invalidated", verifiedAt: new Date() } });
    await schedulerAudit(schedule, await AgentAction.findById(schedule.actionId).select("correlationId requestId").lean(), "agent_schedule_restore_conflict", { status: "invalidated", errorCode: "SCHEDULE_CONFLICT" });
    return;
  }
  // A detector that was already disabled must remain disabled.  Re-enabling it
  // here would turn a temporary no-op into an unauthorized state change.
  const outcome = !schedule.restoreEnabled ? { code: 200, body: { status: "success" } } : schedule.detectionType === "__camera__"
    ? await invoke((req, res) => ChannelService.updateChannel(req, res), { ...internalRequest(schedule), params: { id: String(schedule.channelId) }, body: { control: 1 } })
    : await invoke((req, res) => ChannelService.toggleDetection(req, res), internalRequest(schedule));
  if (outcome.code < 200 || outcome.code >= 300 || outcome.body?.status !== "success") {
    await AgentOneTimeSchedule.updateOne({ _id: schedule._id }, { $set: { status: "failed" }, $push: { executionHistory: { at: new Date(), status: "failed", reason: outcome.body?.message || "Scheduled restore was rejected." } } });
    await AgentAction.updateOne({ _id: schedule.actionId, status: "verification_pending" }, { $set: { status: "failed", verifiedAt: new Date() } });
    await schedulerAudit(schedule, await AgentAction.findById(schedule.actionId).select("correlationId requestId").lean(), "agent_schedule_restored", { status: "failed", errorCode: "EXECUTION_REJECTED" });
    return;
  }
  await AgentOneTimeSchedule.updateOne({ _id: schedule._id }, { $set: { status: "restored" }, $push: { executionHistory: { at: new Date(), status: "restored" } } });
  await schedulerAudit(schedule, await AgentAction.findById(schedule.actionId).select("correlationId requestId").lean(), "agent_schedule_restored", { status: "succeeded" });
  const remaining = await AgentOneTimeSchedule.countDocuments({ actionId: schedule.actionId, status: { $nin: ["restored", "cancelled"] } });
  if (!remaining) await AgentAction.updateOne({ _id: schedule.actionId, status: "verification_pending" }, { $set: { status: "completed", verifiedAt: new Date() } });
}

export async function runOneTimeScheduleTick(now = new Date()) {
  for (let processed = 0; processed < 100; processed += 1) {
    const dueDisable = await AgentOneTimeSchedule.findOneAndUpdate({ status: "approved", disableAt: { $lte: now } }, { $set: { status: "executing" }, $push: { executionHistory: { at: now, status: "disable_started" } } }, { new: true });
    if (!dueDisable) break;
    try { await disable(dueDisable); } catch (error) {
      await AgentOneTimeSchedule.updateOne({ _id: dueDisable._id }, { $set: { status: error.code === "STALE_CONFIGURATION" ? "conflict" : "failed" }, $push: { executionHistory: { at: new Date(), status: "failed", errorCode: error.code || "EXECUTION_ERROR" } } });
      await AgentAction.updateOne({ _id: dueDisable.actionId, status: "verification_pending" }, { $set: { status: error.code === "STALE_CONFIGURATION" ? "invalidated" : "failed", verifiedAt: new Date() } });
    }
  }
  for (let processed = 0; processed < 100; processed += 1) {
    const dueRestore = await AgentOneTimeSchedule.findOneAndUpdate({ status: "executing", restoreAt: { $lte: now }, disableObservedVersion: { $ne: null } }, { $set: { status: "restoring" }, $push: { executionHistory: { at: now, status: "restore_started" } } }, { new: true });
    if (!dueRestore) break;
    await restore(dueRestore);
  }
}

let timer;
export function startOneTimeScheduleRunner() { if (timer) return; timer = setInterval(() => runOneTimeScheduleTick().catch(() => {}), 30_000); timer.unref?.(); }
