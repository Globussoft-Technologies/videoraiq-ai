import { randomUUID } from "node:crypto";
import { MonitoringState, MonitoringOutage } from "./models.js";
import { nextState } from "./stateMachine.js";
import { projectTransition } from "./notificationOutbox.js";
import Channel from "../channels/channels.model.js";
import NVR from "../NVR/nvr.model.js";

// Transition intents are journaled in the SAME atomic camera write. Projection can be retried
// after a crash without requiring unverified MongoDB transaction support.
export async function recordObservation(previous, camera, reading, settings) {
  const currentCamera = await Channel.findById(camera.cameraId).setOptions({ includeInactive: true }).select("isAdded nvrId userId").lean();
  const removed = !currentCamera || !await NVR.exists({ _id: currentCamera.nvrId });
  if (removed || !currentCamera.isAdded) {
    if (previous) await closeForLifecycle(previous, removed ? "CAMERA_REMOVED" : "CAMERA_DISABLED");
    return null;
  }
  if (String(currentCamera.nvrId) !== String(camera.nvrId) || String(currentCamera.userId) !== String(camera.userId)
    || (previous?.observedAt && new Date(previous.observedAt) >= reading.observedAt)) return null;
  const { next, transitions } = nextState(previous, camera, reading, settings);
  const query = previous ? { _id: next._id, revision: previous.revision || 0 } : { _id: next._id };
  const update = { $set: next };
  if (transitions.length) update.$push = { pendingTransitions: { $each: transitions.map(event => ({ ...event, revision: next.revision })) } };
  if (!previous) update.$setOnInsert = { alertsMuted: false };
  delete next.alertsMuted; // policy is modified only by its authenticated handler
  try {
    const saved = await MonitoringState.updateOne(query, update, { upsert: !previous });
    return saved.modifiedCount === 1 || saved.upsertedCount === 1 ? next : null;
  } catch (error) { if (error.code === 11000) return null; throw error; }
}

export async function closeForLifecycle(state, reason, now = new Date()) {
  if (state.lifecycleReason === reason && !state.activeOutage) return;
  const transition = state.activeOutage ? { id: randomUUID(), type: "CLOSED",
    revision: (state.revision || 0) + 1, outage: { ...state.activeOutage, closedAt: now, closeReason: reason } } : null;
  const update = { $set: { lifecycleReason: reason, remindersPaused: true, activeOutage: null,
    alive: null, downSince: null, telegramDownSince: null }, $inc: { revision: 1 } };
  if (transition) update.$push = { pendingTransitions: transition };
  await MonitoringState.updateOne({ _id: state._id, revision: state.revision || 0 }, update);
}

export async function flushTransitions(active = () => true) {
  const rows = await MonitoringState.find({ "pendingTransitions.0": { $exists: true } }).limit(200).lean();
  for (const row of rows) {
    for (const transition of row.pendingTransitions || []) {
      if (!active()) return;
      const { id, ...outage } = transition.outage;
      const revision = transition.revision || 0;
      try {
        await MonitoringOutage.updateOne({ _id: id, $or: [{ revision: { $lte: revision } }, { revision: { $exists: false } }] },
          { $set: { ...outage, revision, isOpen: !outage.closedAt } }, { upsert: true });
      } catch (error) {
        if (error.code !== 11000) throw error;
        const existing = await MonitoringOutage.findById(id).select("revision").lean();
        if (!existing || (existing.revision || 0) < revision) throw error;
      }
      await projectTransition(transition);
      await MonitoringState.updateOne({ _id: row._id }, { $pull: { pendingTransitions: { id: transition.id } } });
    }
  }
}
