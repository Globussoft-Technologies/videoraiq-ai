// Source timestamps describe service observations, not video-frame verification.
const isoTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function timestampMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || !isoTimestamp.test(value)) return NaN;
  const calendar = new Date(value.slice(0, 10) + "T00:00:00Z");
  // Date.parse normalizes some invalid calendar dates; reject those explicitly.
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== value.slice(0, 10) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    return NaN;
  return Date.parse(value);
}

export function observationIssue(reading, now, settings) {
  const receivedAt = timestampMillis(reading?.observedAt);
  const checkedAt = timestampMillis(reading?.sourceCheckedAt);
  if (!Number.isFinite(checkedAt)) return "SOURCE_TIMESTAMP_MISSING";
  if (
    !Number.isFinite(receivedAt) ||
    now - receivedAt < 0 ||
    now - receivedAt > settings.staleAfterMs
  )
    return "SOURCE_STATUS_STALE";
  if (checkedAt - now > settings.sourceClockSkewMs)
    return "SOURCE_TIMESTAMP_FUTURE";
  if (now - checkedAt > settings.staleAfterMs) return "SOURCE_STATUS_STALE";
  return null;
}

export function isFreshObservation(reading, now, settings) {
  return observationIssue(reading, now, settings) === null;
}

// Replayed snapshots cannot increment confirmation or establish recovery.
export function validateObservation(reading, previous, settings) {
  if (reading.verdict === "INCONCLUSIVE") return reading;
  const issue = observationIssue(
    reading,
    timestampMillis(reading.observedAt),
    settings,
  );
  if (issue)
    return {
      ...reading,
      verdict: "INCONCLUSIVE",
      reason: issue,
      availability: null,
    };
  const checkedAt = timestampMillis(reading.sourceCheckedAt);
  const acceptedAt = timestampMillis(previous?.lastSourceCheckedAt);
  if (Number.isFinite(acceptedAt) && checkedAt <= acceptedAt)
    return {
      ...reading,
      verdict: "INCONCLUSIVE",
      availability: null,
      repeatedObservation: true,
      reason:
        checkedAt === acceptedAt
          ? "SOURCE_OBSERVATION_REPEATED"
          : "SOURCE_OBSERVATION_OUT_OF_ORDER",
    };
  return reading;
}

export function isDeliveryVerified(reading, now, settings) {
  return reading?.finalValidation === true && reading.checkKind === "individual"
    && isFreshObservation(reading, now, settings)
    && now - timestampMillis(reading.observedAt) <= settings.finalValidationMaxAgeMs
    && now - timestampMillis(reading.sourceCheckedAt) <= settings.finalValidationMaxAgeMs;
}
