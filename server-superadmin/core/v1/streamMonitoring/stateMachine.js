import { randomUUID } from "node:crypto";
import {
  timestampMillis,
  isFreshObservation,
  isDeliveryVerified,
  validateObservation,
} from "./statusObservation.js";
import { scheduledCheckAt, advanceVerification, reportBoundary } from "./schedule.js";
export { scheduledCheckAt } from "./schedule.js";

export function freshState(state, camera, now, settings) {
  const age = now - new Date(state?.observedAt).getTime();
  return (
    !!state &&
    state.sourceKey === camera.sourceKey &&
    !camera.mappingError &&
    String(state.adminId) === String(camera.adminId) &&
    String(state.nvrId) === String(camera.nvrId) &&
    age >= 0 &&
    age <= (state.latestResult?.verdict === "HEALTHY" ? settings.aliveIntervalMs + 120_000 : settings.staleAfterMs) &&
    isFreshObservation(state.latestResult, now, state.latestResult?.verdict === "HEALTHY"
      ? { ...settings, staleAfterMs: Math.max(settings.staleAfterMs, settings.aliveIntervalMs + 120_000) } : settings)
  );
}

export function nextState(previous, camera, reading, settings) {
  const same =
    previous?.sourceKey === camera.sourceKey &&
    String(previous?.adminId) === String(camera.adminId) &&
    String(previous?.nvrId) === String(camera.nvrId);
  // Legacy DOWN booleans are not proof of failure (they included normal idle).
  // Re-enabled cameras establish a fresh baseline; the closed outage remains in history.
  const base = same && !previous?.lifecycleReason ? previous || {} : {};
  const state = base.state || (base.alive === true ? "ALIVE" : "UNKNOWN");
  reading = validateObservation(reading, base, settings);
  // Legacy counters have no source timestamp; establish a new baseline without
  // migrating records, changing an existing outage, or inventing a recovery.
  const hasSourceBaseline = Number.isFinite(
    timestampMillis(base.lastSourceCheckedAt),
  ) && (!settings.monitoringStartedAt || new Date(base.observedAt).getTime() >= new Date(settings.monitoringStartedAt).getTime());
  const now = reading.observedAt;
  const next = {
    _id: String(camera.cameraId),
    adminId: camera.adminId,
    nvrId: camera.nvrId,
    cameraId: camera.cameraId,
    sourceKey: camera.sourceKey,
    sourceHost: camera.host,
    revision: (previous?.revision || 0) + 1,
    state,
    alive:
      state === "ALIVE"
        ? true
        : ["DOWN", "RECOVERING"].includes(state)
          ? false
          : null,
    observedAt: now,
    latestResult: reading,
    verification: hasSourceBaseline ? base.verification || null : null,
    availability: reading.availability || null,
    lifecycleReason: null,
    alertsMuted: previous?.alertsMuted === true,
    failureStreak: hasSourceBaseline ? base.failureStreak || 0 : 0,
    healthyStreak: hasSourceBaseline ? base.healthyStreak || 0 : 0,
    inconclusiveStreak: base.inconclusiveStreak || 0,
    firstFailureAt: hasSourceBaseline ? base.firstFailureAt || null : null,
    lastSourceCheckedAt:
      reading.verdict === "INCONCLUSIVE"
        ? base.lastSourceCheckedAt || null
        : reading.sourceCheckedAt,
    lastSuccessfulCheckAt: base.lastSuccessfulCheckAt || null,
    lastConclusiveAt: base.lastConclusiveAt || null,
    activeOutage: base.activeOutage || null,
    remindersPaused: base.remindersPaused || false,
    downSince: base.activeOutage?.startedAt || null,
    telegramDownSince: base.activeOutage?.startedAt || null,
    nextCheckAt: new Date(now.getTime() + settings.intervalMs),
  };
  const transitions = [];
  if (!same && previous?.activeOutage)
    transitions.push({
      id: randomUUID(),
      type: "CLOSED",
      outage: {
        ...previous.activeOutage,
        closedAt: now,
        closeReason: "SOURCE_CHANGED",
      },
    });
  if (reading.verdict === "DEFERRED") {
    next.verification = null;
    // Idle/queued is expected on-demand behavior, not a check error.
    next.remindersPaused = true;
    next.failureStreak = 0;
    next.healthyStreak = 0;
    next.inconclusiveStreak = 0;
    if (!next.activeOutage) next.firstFailureAt = null;
    next.alive = next.activeOutage
      ? false
      : ["IDLE", "REPORTED_RUNNING"].includes(reading.availability)
        ? true
        : next.alive;
    next.nextCheckAt = scheduledCheckAt(next, settings);
    return { next, transitions };
  }
  if (reading.verdict === "INCONCLUSIVE") {
    // Uncertainty cannot count toward sustained failure. Continue individual
    // retries only for an existing suspect, starting a new evidence window.
    next.verification = reading.checkKind === "individual" && next.verification
      ? { phase: "INDIVIDUAL", reason: next.verification.reason } : null;
    // Keep the operational state, but interrupted observations cannot confirm a transition.
    // A replay does not erase the original suspicion either: wait for new evidence.
    if (!reading.repeatedObservation) {
      next.failureStreak = 0;
      next.healthyStreak = 0;
      if (!next.activeOutage) next.firstFailureAt = null;
    }
    next.inconclusiveStreak++;
    next.remindersPaused = true;
    next.nextCheckAt = scheduledCheckAt(next, settings);
    return { next, transitions };
  }
  next.inconclusiveStreak = 0;
  next.remindersPaused = false;
  next.lastConclusiveAt = now;
  if (reading.verdict === "FAILED") {
    next.healthyStreak = 0;
    next.failureStreak++;
    next.firstFailureAt ||= now;
    if (["DOWN", "RECOVERING"].includes(state) && next.activeOutage)
      next.state = "DOWN";
    else next.state = "SUSPECTED_DOWN";
    const individualDownConfirmed = reading.individualDownConfirmed === true
      && reading.reason === "RTSP_OFFLINE"
      && isDeliveryVerified({ ...reading, finalValidation: true }, now.getTime(), settings);
    // Confirm this individual report immediately, but keep Telegram delivery at
    // the existing cycle boundary with another fresh individual validation.
    const verification = individualDownConfirmed
      && (!next.verification || next.verification.reason !== reading.reason
        || !["READY", "FINAL"].includes(next.verification.phase))
      ? { verification: { phase: "READY", reason: reading.reason,
        reportAt: reportBoundary(now.getTime(), settings) }, final: false }
      : advanceVerification(next, reading, settings);
    next.verification = verification.verification;
    next.remindersPaused = !verification.final;
    if (verification.final) next.latestResult = { ...reading, finalValidation: true };
    if (
      !next.activeOutage &&
      (verification.final || individualDownConfirmed)
    ) {
      next.state = "DOWN";
      next.activeOutage = {
        id: randomUUID(),
        cameraId: camera.cameraId,
        adminId: camera.adminId,
        nvrId: camera.nvrId,
        startedAt: next.firstFailureAt,
        confirmedAt: now,
        reportAt: next.verification.reportAt,
        reason: reading.reason,
        snapshot: {
          adminName: camera.adminName,
          email: camera.email,
          nvrName: camera.nvrName,
          name: camera.name,
          channelId: camera.channelId,
        },
      };
      transitions.push({
        id: randomUUID(),
        type: "DOWN",
        outage: next.activeOutage,
      });
    }
    if (next.activeOutage)
      next.activeOutage = { ...next.activeOutage, reason: reading.reason };
  } else if (reading.verdict === "HEALTHY") {
    next.verification = null;
    next.failureStreak = 0;
    next.firstFailureAt = null;
    next.healthyStreak++;
    next.lastSuccessfulCheckAt = now;
    if (next.activeOutage) {
      next.state = "RECOVERING";
      next.remindersPaused = true;
      if (next.healthyStreak >= settings.recoveryConfirmations) {
        const closed = {
          ...next.activeOutage,
          closedAt: now,
          closeReason: "RECOVERED",
          reportAt: reportBoundary(now.getTime(), settings),
        };
        transitions.push({
          id: randomUUID(),
          type: "RECOVERED",
          outage: closed,
        });
        next.activeOutage = null;
        next.state = "ALIVE";
        next.remindersPaused = false;
      }
    } else if (
      state === "SUSPECTED_DOWN" ||
      state === "ALIVE" ||
      next.healthyStreak >= settings.initialHealthyConfirmations
    ) {
      next.state = "ALIVE";
    }
  }
  next.alive = next.state === "ALIVE" ? true : next.activeOutage ? false : null;
  next.downSince = next.activeOutage?.startedAt || null;
  next.telegramDownSince = next.downSince;
  // Persist the next batch, individual retry, report validation or Alive cooldown.
  next.nextCheckAt = scheduledCheckAt(next, settings);
  return { next, transitions };
}
