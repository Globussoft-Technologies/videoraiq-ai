import config from "config";
import logger from "../utils/logger.js";
import { cleanupAllConversationLimits } from "../core/v2/assistant/assistantConversation.service.js";

const DEFAULT_INTERVAL_HOURS = 24;

export async function runAssistantConversationCleanup() {
  try {
    const summary = await cleanupAllConversationLimits();
    if (summary.deletedCount) {
      logger.info(`[ASSISTANT-RETENTION] removed ${summary.deletedCount} excess conversations across ${summary.owners} owners`);
    }
    return summary;
  } catch (error) {
    // Cleanup is retryable and must never take down the API process.
    logger.error(`[ASSISTANT-RETENTION] cleanup failed: ${error?.message || error}`);
    return { error: error?.message || String(error) };
  }
}

export function scheduleAssistantConversationCleanup() {
  try {
    const cfg = config.has("AssistantConversationRetention")
      ? config.get("AssistantConversationRetention")
      : {};
    if (cfg.enabled === false) return;
    const intervalMs = Math.max(Number(cfg.intervalHours) || DEFAULT_INTERVAL_HOURS, 1) * 3_600_000;
    const guarded = () => runAssistantConversationCleanup().catch((error) =>
      logger.error(`[ASSISTANT-RETENTION] unexpected cleanup rejection: ${error?.message || error}`),
    );
    setTimeout(guarded, 5 * 60_000).unref();
    setInterval(guarded, intervalMs).unref();
    logger.info(`[ASSISTANT-RETENTION] scheduled: first run in 5m, then every ${intervalMs / 3_600_000}h`);
  } catch (error) {
    logger.error(`[ASSISTANT-RETENTION] failed to schedule cleanup: ${error?.message || error}`);
  }
}
