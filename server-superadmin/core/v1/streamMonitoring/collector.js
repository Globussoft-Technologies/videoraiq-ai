import { randomUUID } from "node:crypto";
import logger from "../../../utils/logger.js";
import { monitoringSettings } from "./settings.js";
import { readInventory } from "./inventory.js";
import { MonitoringState, MonitoringCollector } from "./models.js";
import { readStatuses } from "./statusAdapter.js";
import { recordObservation, closeForLifecycle, flushTransitions } from "./outageService.js";
import { recordMonitoringError } from "./monitoringErrors.js";
import { createStreamTelegramSender } from "./telegramSender.js";

const LEASE_MS = 90_000;

export function startStreamMonitoring() {
  const settings = monitoringSettings();
  if (!settings.enabled) return () => {};
  const owner = randomUUID();
  const sendAlerts = createStreamTelegramSender();
  let stopped = false, leaseUntil = 0, timer, renewing = false, inventory, inventoryAt = 0;
  const active = () => !stopped && Date.now() < leaseUntil;
  const renewal = setInterval(async () => {
    if (!active() || renewing) return;
    renewing = true;
    try {
      const until = new Date(Date.now() + LEASE_MS);
      const saved = await MonitoringCollector.updateOne({ _id: "primary", owner, leaseUntil: { $gt: new Date() } },
        { $set: { leaseUntil: until, heartbeatAt: new Date() } });
      leaseUntil = saved.modifiedCount === 1 ? until.getTime() : 0;
    } catch { leaseUntil = 0; }
    finally { renewing = false; }
  }, 15_000);
  renewal.unref();

  async function cycle() {
    let delay = 5000;
    const startedAt = Date.now();
    const statistics = { HEALTHY: 0, FAILED: 0, INCONCLUSIVE: 0, DEFERRED: 0, committed: 0 };
    try {
      if (stopped) return;
      const now = new Date();
      try {
        const lease = await MonitoringCollector.findOneAndUpdate({ _id: "primary",
          $or: [{ owner }, { leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }] },
        { $set: { owner, leaseUntil: new Date(now.getTime() + LEASE_MS), heartbeatAt: now } },
        { upsert: true, new: true }).lean();
        leaseUntil = new Date(lease.leaseUntil).getTime();
      } catch (error) { if (error.code === 11000) { leaseUntil = 0; return; } throw error; }
      // No automatic index creation. Deployment must provision indexes separately.
      const stateFilter = settings.adminIds.size ? { adminId: { $in: [...settings.adminIds] } } : {};
      let rows = await MonitoringState.find(stateFilter).lean();
      if (!inventory || Date.now() - inventoryAt >= settings.inventoryIntervalMs) {
        inventory = await readInventory(settings, null, true);
        inventoryAt = Date.now();
        const cameras = new Map(inventory.cameras.map(camera => [String(camera.cameraId), camera]));
        for (const row of rows) {
          if (!active()) return;
          const camera = cameras.get(row._id);
          const reason = !camera ? "CAMERA_REMOVED" : !camera.enabled ? "CAMERA_DISABLED" : row.alertsMuted ? "CAMERA_MUTED" : null;
          if (reason) await closeForLifecycle(row, reason);
        }
        rows = await MonitoringState.find(stateFilter).lean();
      }
      const states = new Map(rows.map(row => [row._id, row]));
      const due = inventory.cameras.filter(camera => {
        const state = states.get(String(camera.cameraId));
        return camera.enabled && !state?.alertsMuted && (!state?.nextCheckAt || new Date(state.nextCheckAt).getTime() <= Date.now());
      });
      await flushTransitions(active);
      await readStatuses(due, settings, async (camera, reading) => {
        if (!active()) return;
        try {
          const current = await MonitoringState.findById(String(camera.cameraId)).lean();
          if (current?.alertsMuted || !active()) return;
          const saved = await recordObservation(current, camera, reading, settings);
          statistics[reading.verdict]++;
          if (saved) { statistics.committed++; await recordMonitoringError(camera, saved, settings); }
        } catch { logger.error("[STREAM_MONITORING] camera observation could not be committed"); }
      }, active, states);
      if (active()) {
        await flushTransitions(active);
        sendAlerts(due, settings, active);
        await MonitoringCollector.updateOne({ _id: "primary", owner }, { $set: {
          lastCycleStats: { ...statistics, checkedAt: new Date(), durationMs: Date.now() - startedAt, due: due.length },
        } });
      }
      // Per-camera due times, not a ten-minute sleep: targeted checks and new healthy confirmation run on time.
      const next = await MonitoringState.findOne({ ...stateFilter, alertsMuted: { $ne: true }, lifecycleReason: null })
        .sort({ nextCheckAt: 1 }).select("nextCheckAt").lean();
      delay = Math.min(5000, Math.max(1000, new Date(next?.nextCheckAt || Date.now() + 5000).getTime() - Date.now()));
    } catch {
      leaseUntil = 0;
      logger.error("[STREAM_MONITORING] cycle failed; will retry");
    } finally { if (!stopped) { timer = setTimeout(cycle, delay); timer.unref(); } }
  }
  timer = setTimeout(cycle, 0); timer.unref();
  return () => {
    stopped = true; leaseUntil = 0; clearTimeout(timer); clearInterval(renewal); sendAlerts.stop();
    // Let outstanding bounded reads finish; they cannot commit once active() is false.
  };
}
