import { randomUUID } from "node:crypto";
import logger from "../../../utils/logger.js";
import { monitoringSettings } from "./settings.js";
import { readInventory } from "./inventory.js";
import { MonitoringState, MonitoringCollector } from "./models.js";
import { nextState } from "./stateMachine.js";
import { readStatuses } from "./statusAdapter.js";
import { createStreamTelegramSender } from "./telegramSender.js";

const LEASE_MS = 90_000;

// Continuous collection preserves downSince when no superadmin page is open.
// Only new monitoring records are written; existing camera/session controls are untouched.
export function startStreamMonitoring() {
  const settings = monitoringSettings();
  if (!settings.enabled) return () => {};
  const owner = randomUUID();
  const sendAlerts = createStreamTelegramSender();
  let stopped = false;
  let leaseUntil = 0;
  let timer;
  let renewing = false;
  let indexesReady = false;
  const active = () => !stopped && Date.now() < leaseUntil;
  const renewal = setInterval(async () => {
    if (!active() || renewing) return;
    renewing = true;
    try {
      const until = new Date(Date.now() + LEASE_MS);
      const result = await MonitoringCollector.updateOne({ _id: "primary", owner, leaseUntil: { $gt: new Date() } },
        { $set: { leaseUntil: until } });
      leaseUntil = result.modifiedCount === 1 ? until.getTime() : 0;
    } catch { leaseUntil = 0; }
    finally { renewing = false; }
  }, 15_000);
  renewal.unref();

  async function cycle() {
    try {
      if (stopped) return;
      if (!indexesReady) { await MonitoringState.createIndexes(); indexesReady = true; }
      const now = new Date();
      try {
        const lease = await MonitoringCollector.findOneAndUpdate({ _id: "primary",
          $or: [{ owner }, { leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }] },
        { $set: { owner, leaseUntil: new Date(now.getTime() + LEASE_MS) } }, { upsert: true, new: true }).lean();
        leaseUntil = new Date(lease.leaseUntil).getTime();
      } catch (error) {
        if (error.code === 11000) { leaseUntil = 0; return; }
        throw error;
      }
      const { cameras } = await readInventory(settings);
      await readStatuses(cameras, settings, async (camera, reading) => {
        if (!active()) return;
        try {
          const previous = await MonitoringState.findById(String(camera.cameraId))
            .select("adminId nvrId sourceKey revision alive observedAt downSince telegramDownSince").lean();
          if (!active() || (previous?.observedAt && new Date(previous.observedAt) >= reading.observedAt)) return;
          const next = nextState(previous, camera, reading, settings);
          if (!previous) await MonitoringState.create(next);
          else {
            const { _id, ...fields } = next;
            await MonitoringState.updateOne({ _id, revision: previous.revision }, { $set: fields });
          }
        } catch (error) {
          if (error.code !== 11000) logger.error(`[STREAM_MONITORING] observation failed: ${error.message}`);
        }
      }, active);
      if (active()) await sendAlerts(cameras, settings, active);
    } catch (error) {
      leaseUntil = 0;
      logger.error(`[STREAM_MONITORING] collection failed: ${error.message}`);
    } finally {
      if (!stopped) { timer = setTimeout(cycle, settings.intervalMs); timer.unref(); }
    }
  }
  timer = setTimeout(cycle, 0);
  timer.unref();
  return () => { stopped = true; leaseUntil = 0; clearTimeout(timer); clearInterval(renewal); sendAlerts.stop(); };
}
