import { randomUUID } from "node:crypto";

const checkDelay = (state, verdict, settings) => !["DEFERRED", "INCONCLUSIVE"].includes(verdict)
  && (state === "SUSPECTED_DOWN" || state === "RECOVERING" || (state === "UNKNOWN" && verdict === "HEALTHY"))
  ? settings.targetedRecheckMs : settings.intervalMs;

export function scheduledCheckAt(state, settings) {
  const observedAt = state?.observedAt ? new Date(state.observedAt).getTime() : NaN;
  if (Number.isFinite(observedAt)) return new Date(observedAt + checkDelay(
    state.state || (state.alive === true ? "ALIVE" : "UNKNOWN"), state.latestResult?.verdict, settings));
  const scheduled = state?.nextCheckAt ? new Date(state.nextCheckAt) : null;
  return scheduled && Number.isFinite(scheduled.getTime()) ? scheduled : null;
}

export function freshState(state, camera, now, settings) {
  const age = now - new Date(state?.observedAt).getTime();
  return !!state && state.sourceKey === camera.sourceKey && !camera.mappingError
    && String(state.adminId) === String(camera.adminId) && String(state.nvrId) === String(camera.nvrId)
    && age >= 0 && age <= settings.staleAfterMs;
}

export function nextState(previous, camera, reading, settings) {
  const same = previous?.sourceKey === camera.sourceKey && String(previous?.adminId) === String(camera.adminId)
    && String(previous?.nvrId) === String(camera.nvrId);
  // Legacy DOWN booleans are not proof of failure (they included normal idle).
  // Re-enabled cameras establish a fresh baseline; the closed outage remains in history.
  const base = same && !previous?.lifecycleReason ? previous || {} : {};
  const state = base.state || (base.alive === true ? "ALIVE" : "UNKNOWN");
  const now = reading.observedAt;
  const next = {
    _id: String(camera.cameraId), adminId: camera.adminId, nvrId: camera.nvrId, cameraId: camera.cameraId,
    sourceKey: camera.sourceKey, sourceHost: camera.host, revision: (previous?.revision || 0) + 1,
    state, alive: state === "ALIVE" ? true : ["DOWN", "RECOVERING"].includes(state) ? false : null,
    observedAt: now, latestResult: reading,
    availability: reading.availability || null, lifecycleReason: null, alertsMuted: previous?.alertsMuted === true,
    failureStreak: base.failureStreak || 0, healthyStreak: base.healthyStreak || 0,
    inconclusiveStreak: base.inconclusiveStreak || 0, firstFailureAt: base.firstFailureAt || null,
    lastSuccessfulCheckAt: base.lastSuccessfulCheckAt || null, lastConclusiveAt: base.lastConclusiveAt || null,
    activeOutage: base.activeOutage || null, remindersPaused: base.remindersPaused || false,
    downSince: base.activeOutage?.startedAt || null, telegramDownSince: base.activeOutage?.startedAt || null,
    nextCheckAt: new Date(now.getTime() + settings.intervalMs),
  };
  const transitions = [];
  if (!same && previous?.activeOutage) transitions.push({
    id: randomUUID(), type: "CLOSED", outage: { ...previous.activeOutage, closedAt: now, closeReason: "SOURCE_CHANGED" },
  });
  if (reading.verdict === "DEFERRED") {
    // Idle/queued is expected on-demand behavior, not a check error.
    next.remindersPaused = true;
    next.failureStreak = 0;
    next.healthyStreak = 0;
    next.inconclusiveStreak = 0;
    if (!next.activeOutage) next.firstFailureAt = null;
    next.alive = next.activeOutage ? false : ["IDLE", "REPORTED_RUNNING"].includes(reading.availability) ? true : next.alive;
    return { next, transitions };
  }
  if (reading.verdict === "INCONCLUSIVE") {
    // Keep the operational state, but interrupted observations cannot confirm a transition.
    next.failureStreak = 0;
    next.healthyStreak = 0;
    if (!next.activeOutage) next.firstFailureAt = null;
    next.inconclusiveStreak++;
    next.remindersPaused = true;
    return { next, transitions };
  }
  next.inconclusiveStreak = 0;
  next.remindersPaused = false;
  next.lastConclusiveAt = now;
  if (reading.verdict === "FAILED") {
    next.healthyStreak = 0;
    next.failureStreak++;
    next.firstFailureAt ||= now;
    if (["DOWN", "RECOVERING"].includes(state) && next.activeOutage) next.state = "DOWN";
    else next.state = "SUSPECTED_DOWN";
    if (!next.activeOutage && next.failureStreak >= settings.failureConfirmations) {
      next.state = "DOWN";
      next.activeOutage = { id: randomUUID(), cameraId: camera.cameraId, adminId: camera.adminId, nvrId: camera.nvrId,
        startedAt: next.firstFailureAt, confirmedAt: now, reason: reading.reason,
        snapshot: { adminName: camera.adminName, email: camera.email, nvrName: camera.nvrName, name: camera.name, channelId: camera.channelId },
      };
      transitions.push({ id: randomUUID(), type: "DOWN", outage: next.activeOutage });
    }
    if (next.activeOutage) next.activeOutage = { ...next.activeOutage, reason: reading.reason };
  } else if (reading.verdict === "HEALTHY") {
    next.failureStreak = 0;
    next.firstFailureAt = null;
    next.healthyStreak++;
    next.lastSuccessfulCheckAt = now;
    if (next.activeOutage) {
      next.state = "RECOVERING";
      next.remindersPaused = true;
      if (next.healthyStreak >= settings.recoveryConfirmations) {
        const closed = { ...next.activeOutage, closedAt: now, closeReason: "RECOVERED" };
        transitions.push({ id: randomUUID(), type: "RECOVERED", outage: closed });
        next.activeOutage = null;
        next.state = "ALIVE";
        next.remindersPaused = false;
      }
    } else if (state === "SUSPECTED_DOWN" || state === "ALIVE" || next.healthyStreak >= settings.initialHealthyConfirmations) {
      next.state = "ALIVE";
    }
  }
  next.alive = next.state === "ALIVE" ? true : next.activeOutage ? false : null;
  next.downSince = next.activeOutage?.startedAt || null;
  next.telegramDownSince = next.downSince;
  // Only unfinished confirmation needs the three-minute targeted check.
  next.nextCheckAt = scheduledCheckAt(next, settings);
  return { next, transitions };
}
