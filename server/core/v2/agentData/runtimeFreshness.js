export const RUNTIME_STALE_AFTER_SECONDS = 120;

export function runtimeIsStale(observedAt, now = Date.now()) {
  const timestamp = new Date(observedAt).getTime();
  return !Number.isFinite(timestamp) || now - timestamp > RUNTIME_STALE_AFTER_SECONDS * 1000;
}
