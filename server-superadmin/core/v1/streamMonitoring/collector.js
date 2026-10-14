import { randomUUID } from "node:crypto";
import logger from "../../../utils/logger.js";
import { monitoringSettings } from "./settings.js";
import { readInventory } from "./inventory.js";
import { MonitoringState, MonitoringCollector } from "./models.js";
import { readStatuses } from "./statusAdapter.js";
import {
  recordObservation,
  closeForLifecycle,
  flushTransitions,
} from "./outageService.js";
import { recordMonitoringError } from "./monitoringErrors.js";
import { createStreamTelegramSender } from "./telegramSender.js";
import { scheduledCheckAt } from "./stateMachine.js";
import { readMonitoringControl, observedSinceResume, subscribeMonitoringControl } from "./control.js";

const LEASE_MS = 90_000;

export function startStreamMonitoring() {
  const settings = monitoringSettings();
  const owner = randomUUID();
  const sendAlerts = createStreamTelegramSender();
  let stopped = false,
    leaseUntil = 0,
    timer,
    renewing = false,
    inventory,
    inventoryAt = 0,
    statusController,
    cycling = false,
    refreshingControl = false;
  let control = { enabled: settings.enabled, revision: -1, changedAt: null };
  const isActive = () => !stopped && control.enabled && Date.now() < leaseUntil;
  function applyControl(next) {
    if (stopped || next.revision < control.revision) return;
    if (next.revision === control.revision && next.enabled === control.enabled) return;
    control = next;
    leaseUntil = 0;
    statusController?.abort();
    sendAlerts.pause();
    inventoryAt = 0;
    if (!cycling) {
      clearTimeout(timer);
      timer = setTimeout(cycle, 0);
      timer.unref();
    }
  }
  const unsubscribeControl = subscribeMonitoringControl(applyControl);
  // Poll even while a scan is running or monitoring is off. This is only a
  // control-record read, never a camera-status or media request.
  const controlTimer = setInterval(async () => {
    if (stopped || refreshingControl) return;
    refreshingControl = true;
    try { applyControl(await readMonitoringControl(settings)); }
    catch { leaseUntil = 0; statusController?.abort(); sendAlerts.pause(); }
    finally { refreshingControl = false; }
  }, 5000);
  controlTimer.unref();
  const renewal = setInterval(async () => {
    if (!isActive() || renewing) return;
    renewing = true;
    try {
      const until = new Date(Date.now() + LEASE_MS);
      const saved = await MonitoringCollector.updateOne(
        { _id: "primary", owner, leaseUntil: { $gt: new Date() } },
        { $set: { leaseUntil: until, heartbeatAt: new Date() } },
      );
      leaseUntil = saved.modifiedCount === 1 ? until.getTime() : 0;
      if (!leaseUntil) statusController?.abort();
    } catch {
      leaseUntil = 0;
      statusController?.abort();
    } finally {
      renewing = false;
    }
  }, 15_000);
  renewal.unref();

  async function cycle() {
    if (cycling || stopped) return;
    cycling = true;
    let delay = 5000;
    const startedAt = Date.now();
    const statistics = {
      HEALTHY: 0,
      FAILED: 0,
      INCONCLUSIVE: 0,
      DEFERRED: 0,
      committed: 0,
    };
    try {
      if (stopped) return;
      applyControl(await readMonitoringControl(settings));
      if (!control.enabled) return;
      const cycleRevision = control.revision;
      const active = () => isActive() && control.revision === cycleRevision;
      const cycleSettings = { ...settings, controlRevision: cycleRevision,
        monitoringStartedAt: control.changedAt, canDispatch: () => !cycling };
      const onProjected = (transition) =>
        sendAlerts([], cycleSettings, active, transition.type === "RECOVERED");
      const hadLease = active();
      const now = new Date();
      try {
        const lease = await MonitoringCollector.findOneAndUpdate(
          {
            _id: "primary",
            $or: [
              { owner },
              { leaseUntil: { $lte: now } },
              { leaseUntil: { $exists: false } },
            ],
          },
          {
            $set: {
              owner,
              leaseUntil: new Date(now.getTime() + LEASE_MS),
              heartbeatAt: now,
            },
          },
          { upsert: true, new: true },
        ).lean();
        leaseUntil = new Date(lease.leaseUntil).getTime();
        if (!active()) return;
        if (!lease.cycleStartedAt || lease.cycleControlRevision !== cycleRevision) {
          const cycleStartedAt = new Date();
          const saved = await MonitoringCollector.updateOne({ _id: "primary", owner,
            leaseUntil: { $gt: new Date() } }, { $set: { cycleStartedAt, cycleControlRevision: cycleRevision } });
          if (!saved.matchedCount) { leaseUntil = 0; return; }
          cycleSettings.cycleStartedAt = cycleStartedAt;
        } else cycleSettings.cycleStartedAt = lease.cycleStartedAt;
      } catch (error) {
        if (error.code === 11000) {
          leaseUntil = 0;
          return;
        }
        throw error;
      }
      if (!active()) return;
      sendAlerts.configure(cycleSettings, active);
      if (!hadLease) sendAlerts([], cycleSettings, active);
      // No automatic index creation. Deployment must provision indexes separately.
      const stateFilter = settings.adminIds.size
        ? { adminId: { $in: [...settings.adminIds] } }
        : {};
      let rows = await MonitoringState.find(stateFilter).lean();
      if (
        !inventory ||
        Date.now() - inventoryAt >= settings.inventoryIntervalMs
      ) {
        inventory = await readInventory(settings, null, true);
        inventoryAt = Date.now();
        const cameras = new Map(
          inventory.cameras.map((camera) => [String(camera.cameraId), camera]),
        );
        for (const row of rows) {
          if (!active()) return;
          const camera = cameras.get(row._id);
          const reason = !camera
            ? "CAMERA_REMOVED"
            : !camera.enabled
              ? "CAMERA_DISABLED"
              : row.alertsMuted
                ? "CAMERA_MUTED"
                : null;
          if (reason) await closeForLifecycle(row, reason);
        }
        rows = await MonitoringState.find(stateFilter).lean();
      }
      const states = new Map(rows.map((row) => [row._id, row]));
      const due = inventory.cameras.filter((camera) => {
        const state = states.get(String(camera.cameraId));
        // Apply changed code defaults to existing records without a migration or resetting history.
        const nextCheckAt = scheduledCheckAt(state, cycleSettings);
        return (
          camera.enabled &&
          !state?.alertsMuted &&
          (!observedSinceResume(state, control) || !nextCheckAt || nextCheckAt.getTime() <= Date.now())
        );
      });
      await flushTransitions(active, onProjected);
      statusController = new AbortController();
      await readStatuses(
        due,
        cycleSettings,
        async (camera, reading) => {
          if (!active()) return;
          try {
            const current = await MonitoringState.findById(
              String(camera.cameraId),
            ).lean();
            if (current?.alertsMuted || !active()) return;
            const saved = await recordObservation(
              current,
              camera,
              reading,
              cycleSettings,
            );
            statistics[saved?.latestResult?.verdict || reading.verdict]++;
            if (saved) {
              statistics.committed++;
              states.set(String(camera.cameraId), saved);
              // Publish recovery before waiting for the remainder of the inventory cycle.
              if (saved.transitionTypes.includes("RECOVERED"))
                await flushTransitions(active, onProjected, camera.cameraId);
              await recordMonitoringError(camera, saved, cycleSettings);
            }
          } catch {
            logger.error(
              "[STREAM_MONITORING] camera observation could not be committed",
            );
          }
        },
        active,
        states,
        statusController.signal,
      );
      statusController = null;
      if (active()) {
        await flushTransitions(active, onProjected);
        if (statistics.committed) sendAlerts(due, cycleSettings, active);
        await MonitoringCollector.updateOne(
          { _id: "primary", owner },
          {
            $set: {
              lastCycleStats: {
                ...statistics,
                checkedAt: new Date(),
                durationMs: Date.now() - startedAt,
                due: due.length,
              },
            },
          },
        );
      }
      // Separate batch checks, individual verification, final report validation
      // and the fifteen-minute healthy-camera cooldown.
      let nextDue = Date.now() + 5000;
      for (const camera of inventory.cameras) {
        const state = states.get(String(camera.cameraId));
        if (!camera.enabled || state?.alertsMuted) continue;
        const scheduled = scheduledCheckAt(state, cycleSettings);
        if (scheduled) nextDue = Math.min(nextDue, scheduled.getTime());
      }
      delay = Math.min(5000, Math.max(1000, nextDue - Date.now()));
    } catch {
      leaseUntil = 0;
      logger.error("[STREAM_MONITORING] cycle failed; will retry");
    } finally {
      cycling = false;
      statusController?.abort();
      statusController = null;
      if (!stopped) {
        timer = setTimeout(cycle, delay);
        timer.unref();
      }
    }
  }
  timer = setTimeout(cycle, 0);
  timer.unref();
  return () => {
    stopped = true;
    leaseUntil = 0;
    clearTimeout(timer);
    clearInterval(renewal);
    clearInterval(controlTimer);
    unsubscribeControl();
    sendAlerts.stop();
    statusController?.abort();
  };
}
