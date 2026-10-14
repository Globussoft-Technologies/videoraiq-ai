const millis = value => value ? new Date(value).getTime() : NaN;

export function reportBoundary(now, settings) {
  const anchor = millis(settings.cycleStartedAt);
  if (!Number.isFinite(anchor)) return new Date(now + settings.cycleMs);
  return new Date(anchor + Math.max(1, Math.ceil((now - anchor) / settings.cycleMs)) * settings.cycleMs);
}

export function checkKind(state, now, settings) {
  const verification = state?.verification;
  if (!verification || verification.phase === "BATCH_RECHECK") return "batch";
  if (verification.phase === "FINAL" && now >= millis(verification.startedAt) + settings.intervalMs) return "batch";
  return "individual";
}

export function scheduledCheckAt(state, settings) {
  const observedAt = millis(state?.observedAt);
  if (!Number.isFinite(observedAt)) return null;
  const verification = state.verification;
  if (verification?.phase === "BATCH_RECHECK") return new Date(millis(verification.startedAt) + settings.intervalMs);
  if (verification?.phase === "READY") return new Date(verification.reportAt);
  if (verification?.phase === "FINAL") return new Date(Math.min(
    observedAt + settings.individualIntervalMs, millis(verification.startedAt) + settings.intervalMs,
  ));
  if (verification?.phase === "INDIVIDUAL") return new Date(observedAt + settings.individualIntervalMs);
  return new Date(observedAt + (state.latestResult?.verdict === "HEALTHY" ? settings.aliveIntervalMs : settings.intervalMs));
}

// No network or persistence here. Only fresh, conclusive individual reports
// advance the five-minute window; gaps and uncertainty restart that window.
export function advanceVerification(previous, reading, settings) {
  const now = millis(reading.observedAt);
  let old = previous?.verification;
  const batch = { phase: "BATCH_RECHECK", startedAt: reading.observedAt, reason: reading.reason };
  if (!old || old.reason !== reading.reason) return { verification: batch, final: false };
  // A restart or long scheduling gap must not revive an old completed window.
  if (old.phase === "READY" && now - millis(old.reportAt) >= settings.intervalMs)
    old = { phase: "INDIVIDUAL", reason: reading.reason };
  if (reading.checkKind === "batch") {
    const start = millis(old.startedAt);
    if (now - start < settings.intervalMs) return { verification: old, final: false };
    return { verification: { phase: "INDIVIDUAL", reason: reading.reason }, final: false };
  }
  if (["READY", "FINAL"].includes(old.phase)) {
    const final = now >= millis(old.reportAt);
    return { verification: { ...old, phase: final ? "FINAL" : old.phase,
      ...(final && old.phase !== "FINAL" ? { startedAt: reading.observedAt } : {}) }, final };
  }
  if (old.phase !== "INDIVIDUAL") return { verification: old, final: false };
  const reset = !old.windowStartedAt || now - millis(old.lastIndividualAt) > settings.verificationMaxGapMs;
  const verification = {
    ...old,
    windowStartedAt: reset ? reading.observedAt : old.windowStartedAt,
    firstSourceAt: reset ? reading.sourceCheckedAt : old.firstSourceAt,
    lastIndividualAt: reading.observedAt,
    samples: reset ? 1 : (old.samples || 0) + 1,
  };
  if (now - millis(verification.windowStartedAt) >= settings.verificationWindowMs
    && millis(reading.sourceCheckedAt) - millis(verification.firstSourceAt) >= settings.verificationWindowMs
    && verification.samples >= settings.failureConfirmations) {
    verification.phase = "READY";
    verification.reportAt = reportBoundary(now, settings);
  }
  return { verification, final: false };
}
