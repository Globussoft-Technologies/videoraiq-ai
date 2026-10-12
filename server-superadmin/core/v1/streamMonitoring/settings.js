import config from "config";

const configured = (key, fallback = "") => config.has(key) ? config.get(key) : fallback;
// JSON configuration is authoritative; retain environment fallback for existing deployments.
const setting = (key, env, fallback) => configured(`StreamMonitoring.${key}`, process.env[env] ?? fallback);
const number = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== undefined && value !== ""
    ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
};

export function monitoringSettings() {
  const intervalMs = number(setting("intervalMs", "STREAM_MONITORING_INTERVAL_MS"), 10_000, 5_000, 300_000);
  const timeoutMs = number(setting("timeoutMs", "STREAM_MONITORING_TIMEOUT_MS"), 8_000, 1_000, 60_000);
  const enabled = setting("enabled", "STREAM_MONITORING_ENABLED", false);
  const statusMode = setting("statusMode", "STREAM_MONITORING_STATUS_MODE", "auto");
  const adminIds = setting("adminIds", "STREAM_MONITORING_ADMIN_IDS", []);
  return {
    enabled: enabled === true || enabled === "true",
    statusUrl: setting("statusUrl", "STREAM_MONITORING_STATUS_URL", ""),
    statusMode: ["fixed", "per-nvr", "auto"].includes(statusMode) ? statusMode : "auto",
    defaultHost: configured("RTSPStream.host"),
    defaultAppEnv: configured("APP_ENV", "cloud"),
    intervalMs,
    timeoutMs,
    staleAfterMs: number(setting("staleAfterMs", "STREAM_MONITORING_STALE_MS"),
      Math.max(60_000, intervalMs * 3 + timeoutMs), intervalMs * 2 + timeoutMs, 3_600_000),
    batchSize: number(setting("batchSize", "STREAM_MONITORING_BATCH_SIZE"), 200, 1, 500),
    concurrency: number(setting("concurrency", "STREAM_MONITORING_CONCURRENCY"), 4, 1, 16),
    adminIds: new Set((Array.isArray(adminIds) ? adminIds : String(adminIds).split(",")).map(id => String(id).trim()).filter(Boolean)),
  };
}
