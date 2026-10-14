import config from "config";

const configured = (key, fallback = "") =>
  config.has(key) ? config.get(key) : fallback;
const setting = (key, env, fallback) =>
  configured(`StreamMonitoring.${key}`, process.env[env] ?? fallback);
const number = (key, env, fallback, min, max) => {
  const raw = setting(key, env, fallback);
  const value = Number(raw);
  if (raw === "" || !Number.isInteger(value) || value < min || value > max)
    throw new Error(`Invalid StreamMonitoring.${key}`);
  return value;
};

export function monitoringSettings() {
  const intervalMs = number(
    "intervalMs",
    "STREAM_MONITORING_INTERVAL_MS",
    300_000,
    5_000,
    3_600_000,
  );
  const cycleMs = number("cycleMs", "STREAM_MONITORING_CYCLE_MS", 900_000, 900_000, 3_600_000);
  const individualIntervalMs = number("individualIntervalMs", "STREAM_MONITORING_INDIVIDUAL_MS", 30_000, 30_000, 60_000);
  const enabled = setting("enabled", "STREAM_MONITORING_ENABLED", false);
  const statusMode = setting(
    "statusMode",
    "STREAM_MONITORING_STATUS_MODE",
    "auto",
  );
  if (!["fixed", "per-nvr", "auto"].includes(statusMode))
    throw new Error("Invalid StreamMonitoring.statusMode");
  const adminIds = setting("adminIds", "STREAM_MONITORING_ADMIN_IDS", []);
  return {
    enabled: enabled === true || enabled === "true",
    statusMode,
    statusUrl: setting("statusUrl", "STREAM_MONITORING_STATUS_URL", ""),
    defaultHost: configured("RTSPStream.host"),
    defaultAppEnv: configured("APP_ENV", "cloud"),
    intervalMs,
    cycleMs,
    aliveIntervalMs: number("aliveIntervalMs", "STREAM_MONITORING_ALIVE_MS", cycleMs, 900_000, 3_600_000),
    individualIntervalMs,
    verificationWindowMs: number("verificationWindowMs", "STREAM_MONITORING_VERIFICATION_MS", 300_000, 300_000, 900_000),
    verificationMaxGapMs: Math.max(90_000, individualIntervalMs * 3),
    finalValidationMaxAgeMs: Math.max(90_000, individualIntervalMs * 3),
    inventoryIntervalMs: number(
      "inventoryIntervalMs",
      "STREAM_MONITORING_INVENTORY_MS",
      300_000,
      10_000,
      3_600_000,
    ),
    timeoutMs: number(
      "timeoutMs",
      "STREAM_MONITORING_TIMEOUT_MS",
      5_000,
      1_000,
      30_000,
    ),
    sourceClockSkewMs: number(
      "sourceClockSkewMs",
      "STREAM_MONITORING_SOURCE_CLOCK_SKEW_MS",
      5_000,
      0,
      60_000,
    ),
    individualConcurrency: number(
      "individualConcurrency",
      "STREAM_MONITORING_INDIVIDUAL_CONCURRENCY",
      2,
      1,
      4,
    ),
    staleAfterMs: number(
      "staleAfterMs",
      "STREAM_MONITORING_STALE_MS",
      Math.max(420_000, intervalMs + 120_000),
      10_000,
      7_200_000,
    ),
    batchSize: number("batchSize", "STREAM_MONITORING_BATCH_SIZE", 200, 1, 500),
    concurrency: number(
      "concurrency",
      "STREAM_MONITORING_CONCURRENCY",
      20,
      1,
      50,
    ),
    hostConcurrency: number(
      "hostConcurrency",
      "STREAM_MONITORING_HOST_CONCURRENCY",
      4,
      1,
      20,
    ),
    failureConfirmations: number(
      "failureConfirmations",
      "STREAM_MONITORING_FAILURE_CONFIRMATIONS",
      2,
      2,
      5,
    ),
    recoveryConfirmations: number(
      "recoveryConfirmations",
      "STREAM_MONITORING_RECOVERY_CONFIRMATIONS",
      1,
      1,
      5,
    ),
    initialHealthyConfirmations: number(
      "initialHealthyConfirmations",
      "STREAM_MONITORING_INITIAL_CONFIRMATIONS",
      1,
      1,
      5,
    ),
    reminderMs: number(
      "reminderMs",
      "STREAM_MONITORING_REMINDER_MS",
      900_000,
      60_000,
      3_600_000,
    ),
    reminderWakeMs: number(
      "reminderWakeMs",
      "STREAM_MONITORING_REMINDER_WAKE_MS",
      10_000,
      1_000,
      60_000,
    ),
    unknownWarningThreshold: number(
      "unknownWarningThreshold",
      "STREAM_MONITORING_WARNING_THRESHOLD",
      3,
      1,
      10,
    ),
    warningCooldownMs: number(
      "warningCooldownMs",
      "STREAM_MONITORING_WARNING_COOLDOWN_MS",
      3_600_000,
      3_600_000,
      86_400_000,
    ),
    maxDeliveryAttempts: number(
      "maxDeliveryAttempts",
      "STREAM_MONITORING_DELIVERY_ATTEMPTS",
      8,
      1,
      20,
    ),
    opsChatId: String(
      setting("opsChatId", "STREAM_MONITORING_OPS_CHAT_ID", ""),
    ),
    adminIds: new Set(
      (Array.isArray(adminIds) ? adminIds : String(adminIds).split(","))
        .map(String)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  };
}
