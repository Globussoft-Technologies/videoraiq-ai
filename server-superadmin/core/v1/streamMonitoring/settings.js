import config from "config";
import path from "node:path";

const configured = (key, fallback) => config.has(key) ? config.get(key) : fallback;
const setting = (key, env, fallback) => process.env[env] ?? configured("StreamMonitoring." + key, fallback);

export function monitoringSettings() {
  const statusMode = setting("statusMode", "STREAM_MONITORING_STATUS_MODE", "auto");
  if (!["fixed", "per-nvr", "auto"].includes(statusMode)) throw new Error("Invalid monitoring status mode");
  const timeoutMs = Number(setting("timeoutMs", "STREAM_MONITORING_TIMEOUT_MS", 5000));
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error("Invalid monitoring timeout");
  const enabled = setting("enabled", "STREAM_MONITORING_ENABLED", false);
  const adminIds = setting("adminIds", "STREAM_MONITORING_ADMIN_IDS", []);
  return {
    enabled: enabled === true || enabled === "true", statusMode, timeoutMs,
    intervalMs: 120_000, reportIntervalMs: 600_000, sourceMaxAgeMs: 90_000, sourceClockSkewMs: 5000,
    batchSize: 128,
    statusUrl: setting("statusUrl", "STREAM_MONITORING_STATUS_URL", ""),
    defaultHost: configured("RTSPStream.host", ""), defaultAppEnv: configured("APP_ENV", "cloud"),
    apiBaseUrl: setting("apiBaseUrl", "STREAM_MONITORING_API_URL",
      "http://127.0.0.1:" + configured("port", 5000) + "/api/v1/stream-monitoring/internal"),
    apiKey: setting("apiKey", "STREAM_MONITORING_API_KEY", configured("Backend.token", "")),
    stateDir: path.resolve(setting("stateDir", "STREAM_MONITORING_STATE_DIR", "var/stream-monitoring")),
    adminIds: new Set((Array.isArray(adminIds) ? adminIds : String(adminIds).split(",")).map(id => String(id).trim()).filter(Boolean)),
  };
}
