import { MonitoringIssue } from "./models.js";
import { hash } from "./identity.js";
import { enqueue } from "./notificationOutbox.js";
import logger from "../../../utils/logger.js";

export async function recordMonitoringError(camera, state, settings) {
  if (state.latestResult?.verdict !== "INCONCLUSIVE"
    || state.inconclusiveStreak < settings.unknownWarningThreshold) return;
  const reason = state.latestResult.reason;
  const id = hash(JSON.stringify([camera.host || "mapping", reason]));
  const now = new Date();
  await MonitoringIssue.updateOne({ _id: id }, { $set: { host: camera.host, reason, lastSeenAt: now } }, { upsert: true });
  // No customer destination fallback, and no per-camera warnings for a shared host issue.
  const issue = await MonitoringIssue.findOneAndUpdate({ _id: id,
    $or: [{ nextWarningAt: { $lte: now } }, { nextWarningAt: { $exists: false } }] },
  { $set: { nextWarningAt: new Date(now.getTime() + settings.warningCooldownMs),
    warningId: id + ":" + now.toISOString(), warningPayload: { issueId: id, host: camera.host, reason,
      lastConclusiveAt: state.lastConclusiveAt, inconclusiveStreak: state.inconclusiveStreak } } }, { new: true }).lean();
  if (!settings.opsChatId) {
    if (issue) logger.warn("[STREAM_MONITORING] operations destination is not configured");
    return;
  }
  // Retry projection of the same warning after a crash; enqueue uses a deterministic key.
  const warning = issue || await MonitoringIssue.findById(id).lean();
  if (!warning?.warningId) return;
  await enqueue("OPS_WARNING", { id: warning.warningId }, { chatId: settings.opsChatId, ownerIds: [] }, 0, warning.warningPayload);
}
