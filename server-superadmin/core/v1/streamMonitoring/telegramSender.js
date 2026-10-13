import axios from "axios";
import { randomUUID } from "node:crypto";
import logger from "../../../utils/logger.js";
import Channel from "../channels/channels.model.js";
import NVR from "../NVR/nvr.model.js";
import { MonitoringState, MonitoringOutage, MonitoringIssue, MonitoringCollector } from "./models.js";
import { TelegramOutbox } from "./telegramModels.js";
import { telegramBotToken, telegramBotIdentity } from "./telegramChannels.js";
import { deliveryTargets, enqueue } from "./notificationOutbox.js";
import { formatNotification, formatNotifications } from "./telegramReport.js";
import { enqueueDueReminders } from "./reminderWorker.js";

let wakeSender;
export const requestStreamTelegramReport = () => wakeSender?.();

async function eligible(event, settings) {
  const targets = await deliveryTargets();
  if (event.type === "OPS_WARNING")
    return event.chatId === settings.opsChatId && !targets.some(target => target.chatId === event.chatId)
      && !!await MonitoringState.exists({ sourceHost: event.payload.host, "latestResult.verdict": "INCONCLUSIVE",
        "latestResult.reason": event.payload.reason, inconclusiveStreak: { $gte: settings.unknownWarningThreshold },
        alertsMuted: { $ne: true }, lifecycleReason: null });
  if (!targets.some(target => target.chatId === event.chatId)) return false;
  const state = await MonitoringState.findById(String(event.cameraId)).lean();
  const camera = await Channel.findById(event.cameraId).setOptions({ includeInactive: true }).select("isAdded nvrId").lean();
  if (!camera?.isAdded || !await NVR.exists({ _id: camera.nvrId }) || state?.alertsMuted || state?.lifecycleReason) return false;
  if (["DOWN", "REMINDER"].includes(event.type)) {
    if (state?.activeOutage?.id !== event.outageId || state.state !== "DOWN") return false;
    return !state.remindersPaused && state.latestResult?.verdict === "FAILED"
      && Date.now() - new Date(state.observedAt).getTime() <= settings.staleAfterMs;
  }
  return true;
}

async function supersedeClosedDown(event) {
  if (!["DOWN", "REMINDER"].includes(event.type)) return false;
  const state = await MonitoringState.findById(String(event.cameraId)).select("alertsMuted lifecycleReason").lean();
  const outage = await MonitoringOutage.findById(event.outageId).lean();
  if (!outage?.closedAt && !state?.alertsMuted && !state?.lifecycleReason) return false;
  const cancelled = await TelegramOutbox.updateOne({ _id: event._id, status: { $in: ["PENDING", "SENDING"] } },
    { $set: { status: "CANCELLED" }, $unset: { owner: "", leaseUntil: "" } });
  if (cancelled.modifiedCount && event.type === "DOWN" && outage?.closeReason === "RECOVERED")
    await enqueue("COMBINED_RECOVERY", { ...outage, id: outage._id }, { chatId: event.chatId, ownerIds: event.ownerIds });
  return true;
}

// Existing entry point retained for channel linking. Durable events replace snapshot-only delivery.
export function createStreamTelegramSender() {
  const owner = randomUUID();
  let context, timer, stopped = false, running = false;
  let nextSendAt = 0;
  async function run() {
    if (running || stopped || !context || !context.active()) return;
    running = true;
    const { settings, active } = context;
    try {
      if (!telegramBotToken()) return;
      const limit = await MonitoringCollector.findById("telegramRateLimit").select("retryUntil").lean();
      if (new Date(limit?.retryUntil || 0).getTime() > Date.now()) return;
      await telegramBotIdentity();
      await enqueueDueReminders(settings, active);
      // Recover abandoned claims after a process restart; send outcomes remain at-least-once.
      await TelegramOutbox.updateMany({ status: "SENDING", leaseUntil: { $lte: new Date() } },
        { $set: { status: "PENDING", nextAttemptAt: new Date() }, $unset: { owner: "", leaseUntil: "" } });
      const due = await TelegramOutbox.find({ status: "PENDING", nextAttemptAt: { $lte: new Date() } })
        .sort({ createdAt: 1, _id: 1 }).limit(100).lean();
      const groups = [];
      for (const event of due) {
        const text = formatNotification(event, Date.now());
        let group = groups.at(-1);
        if (!group || group.chatId !== event.chatId || group.type !== event.type || group.text.length + text.length + 2 > 3500) {
          group = { chatId: event.chatId, type: event.type, events: [], text: "" }; groups.push(group);
        }
        group.events.push(event); group.text += (group.text ? "\n\n" : "") + text;
      }
      for (const group of groups) {
        if (!active() || stopped) break;
        if (nextSendAt - Date.now() > 10_000) break;
        const claimed = [];
        for (const event of group.events) {
          // Deferred and RECOVERING events stay pending; lifecycle/recovery cancels them elsewhere.
          if (await supersedeClosedDown(event)) continue;
          if (!await eligible(event, settings)) {
            if (event.type === "OPS_WARNING") await TelegramOutbox.updateOne({ _id: event._id, status: "PENDING" },
              { $set: { status: "CANCELLED", errorCode: "OPS_ISSUE_RESOLVED_OR_DESTINATION_INVALID" } });
            continue;
          }
          if (event.type === "OPS_WARNING") {
            const issue = await MonitoringIssue.findById(event.payload.issueId).lean();
            const lastWarning = issue?.lastAttemptAt || issue?.lastSentAt;
            if (lastWarning && Date.now() - new Date(lastWarning).getTime() < settings.warningCooldownMs) {
              await TelegramOutbox.updateOne({ _id: event._id, status: "PENDING" },
                { $set: { nextAttemptAt: new Date(new Date(lastWarning).getTime() + settings.warningCooldownMs) } });
              continue;
            }
            const reserved = await MonitoringIssue.updateOne({ _id: event.payload.issueId,
              $or: [{ lastAttemptAt: { $lte: new Date(Date.now() - settings.warningCooldownMs) } }, { lastAttemptAt: { $exists: false } }] },
              { $set: { lastAttemptAt: new Date() } });
            if (reserved.modifiedCount !== 1) continue;
          }
          const row = await TelegramOutbox.findOneAndUpdate({ _id: event._id, status: "PENDING" },
            { $set: { status: "SENDING", owner, leaseUntil: new Date(Date.now() + 90_000) }, $inc: { attempts: 1 } },
            { new: true }).lean();
          if (row) claimed.push(row);
        }
        if (!claimed.length) continue;
        try {
          const delay = nextSendAt - Date.now();
          if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
          const dispatch = [];
          for (const event of claimed) if (active() && !stopped && await eligible(event, settings)) dispatch.push(event);
          const excluded = claimed.filter(event => !dispatch.some(row => row._id === event._id));
          for (const event of excluded) await supersedeClosedDown(event);
          if (excluded.length) await TelegramOutbox.updateMany({ _id: { $in: excluded.map(row => row._id) }, status: "SENDING", owner },
            { $set: { status: "PENDING", nextAttemptAt: new Date(Date.now() + settings.reminderWakeMs) }, $unset: { owner: "", leaseUntil: "" } });
          if (!dispatch.length) continue;
          const text = formatNotifications(dispatch, Date.now());
          nextSendAt = Date.now() + 3100;
          const response = await axios.post(`https://api.telegram.org/bot${telegramBotToken()}/sendMessage`, {
            chat_id: group.chatId, text, link_preview_options: { is_disabled: true },
          }, { timeout: 5000, maxRedirects: 0, maxContentLength: 1_000_000 });
          if (response.data?.ok !== true) throw Object.assign(new Error("Telegram rejected notification"), { response });
          await TelegramOutbox.updateMany({ _id: { $in: dispatch.map(row => row._id) }, status: "SENDING", owner },
            { $set: { status: "SENT", sentAt: new Date(), messageId: response.data.result?.message_id },
              $unset: { owner: "", leaseUntil: "" } });
          for (const event of dispatch) if (event.type === "OPS_WARNING")
            await MonitoringIssue.updateOne({ _id: event.payload.issueId }, { $set: { lastSentAt: new Date() } });
          for (const event of dispatch) if (event.type === "DOWN") {
            const outage = await MonitoringOutage.findById(event.outageId).lean();
            if (outage?.closeReason === "RECOVERED") await enqueue("RECOVERED", { ...outage, id: outage._id },
              { chatId: event.chatId, ownerIds: event.ownerIds });
          }
        } catch (error) {
          const code = error.response?.data?.error_code || error.response?.status;
          const retry = Number(error.response?.data?.parameters?.retry_after);
          if (code === 429 && retry > 0) {
            nextSendAt = Date.now() + retry * 1000;
            await MonitoringCollector.updateOne({ _id: "telegramRateLimit" },
              { $set: { retryUntil: new Date(nextSendAt) } }, { upsert: true });
          }
          for (const event of claimed) {
            const permanent = [400, 401, 403].includes(code) || event.attempts >= settings.maxDeliveryAttempts;
            const waitMs = retry > 0 ? retry * 1000 : Math.min(300_000, 5000 * 2 ** Math.min(event.attempts, 6)) + Math.floor(Math.random() * 1000);
            await TelegramOutbox.updateOne({ _id: event._id, status: "SENDING", owner }, {
              $set: { status: permanent ? "FAILED" : "PENDING", errorCode: String(code || "NETWORK"),
                nextAttemptAt: new Date(Date.now() + waitMs) }, $unset: { owner: "", leaseUntil: "" },
            });
          }
          logger.warn(`[STREAM_TELEGRAM] delivery failed (status ${code || "network"})`);
        }
      }
    } catch { logger.error("[STREAM_TELEGRAM] delivery processing failed"); }
    finally {
      running = false;
      if (!stopped && context?.active()) {
        clearTimeout(timer); timer = setTimeout(run, context.settings.reminderWakeMs); timer.unref();
      }
    }
  }
  const wake = () => {
    if (!running && !stopped) { clearTimeout(timer); timer = setTimeout(run, 0); timer.unref(); }
  };
  wakeSender = wake;
  const sendAlerts = (_cameras, settings, active) => { context = { settings, active }; wake(); };
  sendAlerts.stop = () => { stopped = true; clearTimeout(timer); if (wakeSender === wake) wakeSender = null; };
  return sendAlerts;
}
