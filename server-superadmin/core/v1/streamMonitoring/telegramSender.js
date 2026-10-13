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
export const requestStreamTelegramReport = (urgent = false) => wakeSender?.(urgent);
const recoveryTypes = ["RECOVERED", "COMBINED_RECOVERY"];
const priorityTypes = [recoveryTypes, ["DOWN"], ["REMINDER"], ["OPS_WARNING"]];

async function deliveryEligibility(event, settings) {
  const now = Date.now();
  const hold = { allowed: false, nextAttemptAt: new Date(now + settings.reminderWakeMs) };
  const targets = await deliveryTargets();
  if (event.type === "OPS_WARNING")
    return { ...hold, allowed: event.chatId === settings.opsChatId && !targets.some(target => target.chatId === event.chatId)
      && !!await MonitoringState.exists({ sourceHost: event.payload.host, "latestResult.verdict": "INCONCLUSIVE",
        "latestResult.reason": event.payload.reason, inconclusiveStreak: { $gte: settings.unknownWarningThreshold },
        alertsMuted: { $ne: true }, lifecycleReason: null }) };
  if (!targets.some(target => target.chatId === event.chatId))
    return { allowed: false, nextAttemptAt: new Date(now + (recoveryTypes.includes(event.type) ? settings.intervalMs : settings.reminderWakeMs)) };
  const state = await MonitoringState.findById(String(event.cameraId)).lean();
  const camera = await Channel.findById(event.cameraId).setOptions({ includeInactive: true }).select("isAdded nvrId").lean();
  if (!camera?.isAdded || !await NVR.exists({ _id: camera.nvrId }) || state?.alertsMuted || state?.lifecycleReason)
    return { allowed: false, nextAttemptAt: new Date(now + settings.intervalMs) };
  if (["DOWN", "REMINDER"].includes(event.type)) {
    const age = now - new Date(state?.observedAt).getTime();
    if (state?.activeOutage?.id !== event.outageId || state.state !== "DOWN" || state.remindersPaused
      || state.latestResult?.verdict !== "FAILED" || !Number.isFinite(age) || age < 0 || age > settings.staleAfterMs)
      return { ...hold, nextAttemptAt: new Date(Math.max(hold.nextAttemptAt.getTime(), new Date(state?.nextCheckAt || 0).getTime())) };
    if (event.type === "REMINDER") {
      const initial = await TelegramOutbox.exists({ outageId: event.outageId, chatId: event.chatId, type: "DOWN", status: "SENT" });
      if (!initial) return hold;
      const latest = await TelegramOutbox.findOne({ outageId: event.outageId, chatId: event.chatId,
        type: { $in: ["DOWN", "REMINDER"] }, status: "SENT" }).sort({ sentAt: -1 }).select("sentAt").lean();
      if (!latest?.sentAt) return hold;
      const dueAt = new Date(latest.sentAt).getTime() + settings.reminderMs;
      if (dueAt > now) return { allowed: false, nextAttemptAt: new Date(dueAt) };
    }
  }
  return { allowed: true };
}

async function deferDelivery(event, nextAttemptAt, owner = null) {
  // A claim that never reached Telegram is not a delivery attempt.
  await TelegramOutbox.updateOne({ _id: event._id, status: owner ? "SENDING" : "PENDING", ...(owner ? { owner } : {}) }, {
    $set: { status: "PENDING", nextAttemptAt },
    ...(owner ? { $unset: { owner: "", leaseUntil: "" }, $inc: { attempts: -1 } } : {}),
  });
}

async function pendingByPriority() {
  const due = await TelegramOutbox.find({ status: "PENDING", nextAttemptAt: { $lte: new Date() }, type: { $in: recoveryTypes } })
    .sort({ nextAttemptAt: 1, createdAt: 1, _id: 1 }).limit(100).lean();
  if (due.length < 100) {
    // Deferred DOWN events must not indefinitely crowd eligible reminders out of the bounded queue.
    const normal = await TelegramOutbox.find({ status: "PENDING", nextAttemptAt: { $lte: new Date() },
      type: { $in: ["DOWN", "REMINDER", "OPS_WARNING"] } })
      .sort({ nextAttemptAt: 1, createdAt: 1, _id: 1 }).limit(100 - due.length).lean();
    due.push(...normal);
  }
  return due;
}

async function supersedeClosedDown(event) {
  if (!["DOWN", "REMINDER"].includes(event.type)) return false;
  const state = await MonitoringState.findById(String(event.cameraId)).select("alertsMuted lifecycleReason").lean();
  const outage = await MonitoringOutage.findById(event.outageId).lean();
  if (!outage?.closedAt && !state?.alertsMuted && !state?.lifecycleReason) return false;
  const cancelled = await TelegramOutbox.updateOne({ _id: event._id, status: { $in: ["PENDING", "SENDING"] } },
    { $set: { status: "CANCELLED" }, $unset: { owner: "", leaseUntil: "" } });
  if (cancelled.modifiedCount && event.type === "DOWN" && outage?.closeReason === "RECOVERED") {
    await enqueue("COMBINED_RECOVERY", { ...outage, id: outage._id }, { chatId: event.chatId, ownerIds: event.ownerIds });
    requestStreamTelegramReport(true);
  }
  return true;
}

// Existing entry point retained for channel linking. Durable events replace snapshot-only delivery.
export function createStreamTelegramSender() {
  const owner = randomUUID();
  let context, timer, stopped = false, running = false, wakeRequested = false, urgentWakeRequested = false;
  let nextSendAt = 0;
  async function run() {
    if (running || stopped || !context || !context.active()) return;
    running = true;
    wakeRequested = false; urgentWakeRequested = false;
    const { settings, active } = context;
    try {
      if (!telegramBotToken()) return;
      const limit = await MonitoringCollector.findById("telegramRateLimit").select("retryUntil").lean();
      if (new Date(limit?.retryUntil || 0).getTime() > Date.now()) return;
      await telegramBotIdentity();
      // Recover abandoned claims after a process restart; send outcomes remain at-least-once.
      await TelegramOutbox.updateMany({ status: "SENDING", leaseUntil: { $lte: new Date() } },
        { $set: { status: "PENDING", nextAttemptAt: new Date() }, $unset: { owner: "", leaseUntil: "" } });
      // Process existing recovery first. Reminder generation yields if a new recovery arrives.
      let due = await TelegramOutbox.find({ status: "PENDING", nextAttemptAt: { $lte: new Date() }, type: { $in: recoveryTypes } })
        .sort({ nextAttemptAt: 1, createdAt: 1, _id: 1 }).limit(100).lean();
      if (!due.length) {
        await enqueueDueReminders(settings, active, () => urgentWakeRequested);
        due = await pendingByPriority();
      }
      const priority = type => priorityTypes.findIndex(types => types.includes(type));
      const groupKey = event => JSON.stringify([event.chatId, event.type, event.payload?.snapshot?.adminName,
        event.payload?.snapshot?.email, event.payload?.snapshot?.nvrName]);
      due.sort((a, b) => priority(a.type) - priority(b.type) || groupKey(a).localeCompare(groupKey(b))
        || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a._id.localeCompare(b._id));
      const groups = [];
      const formattedAt = Date.now();
      for (const event of due) {
        let group = groups.at(-1);
        const candidate = group && group.chatId === event.chatId && group.type === event.type
          ? formatNotifications([...group.events, event], formattedAt) : null;
        if (!group || candidate === null || candidate.length > 3500) {
          group = { chatId: event.chatId, type: event.type, events: [], text: "" }; groups.push(group);
        }
        group.events.push(event);
        group.text = candidate !== null && candidate.length <= 3500 ? candidate : formatNotification(event, formattedAt);
      }
      for (const group of groups) {
        if (!active() || stopped) break;
        if (urgentWakeRequested && !recoveryTypes.includes(group.type)) { wakeRequested = true; break; }
        if (nextSendAt - Date.now() > 10_000) break;
        const claimed = [];
        for (const event of group.events) {
          // Deferred and RECOVERING events stay pending; lifecycle/recovery cancels them elsewhere.
          if (await supersedeClosedDown(event)) continue;
          const decision = await deliveryEligibility(event, settings);
          if (!decision.allowed) {
            if (event.type === "OPS_WARNING") await TelegramOutbox.updateOne({ _id: event._id, status: "PENDING" },
              { $set: { status: "CANCELLED", errorCode: "OPS_ISSUE_RESOLVED_OR_DESTINATION_INVALID" } });
            else await deferDelivery(event, decision.nextAttemptAt);
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
          for (const event of claimed) {
            const decision = active() && !stopped && !(urgentWakeRequested && !recoveryTypes.includes(event.type))
              ? await deliveryEligibility(event, settings)
              : { allowed: false, nextAttemptAt: new Date() };
            if (decision.allowed) dispatch.push(event);
            else if (!await supersedeClosedDown(event)) await deferDelivery(event, decision.nextAttemptAt, owner);
          }
          if (!dispatch.length) continue;
          const text = formatNotifications(dispatch, Date.now());
          nextSendAt = Date.now() + 3100;
          const response = await axios.post(`https://api.telegram.org/bot${telegramBotToken()}/sendMessage`, {
            chat_id: group.chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
          }, { timeout: 5000, maxRedirects: 0, maxContentLength: 1_000_000 });
          if (response.data?.ok !== true) throw Object.assign(new Error("Telegram rejected notification"), { response });
          await TelegramOutbox.updateMany({ _id: { $in: dispatch.map(row => row._id) }, status: "SENDING", owner },
            { $set: { status: "SENT", sentAt: new Date(), messageId: response.data.result?.message_id },
              $unset: { owner: "", leaseUntil: "" } });
          for (const event of dispatch) if (event.type === "OPS_WARNING")
            await MonitoringIssue.updateOne({ _id: event.payload.issueId }, { $set: { lastSentAt: new Date() } });
          for (const event of dispatch) if (event.type === "DOWN") {
            const outage = await MonitoringOutage.findById(event.outageId).lean();
            if (outage?.closeReason === "RECOVERED") {
              await enqueue("RECOVERED", { ...outage, id: outage._id }, { chatId: event.chatId, ownerIds: event.ownerIds });
              wake(true);
            }
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
        clearTimeout(timer); timer = setTimeout(run, wakeRequested ? 0 : context.settings.reminderWakeMs); timer.unref();
      }
    }
  }
  const wake = (urgent = false) => {
    if (stopped) return;
    if (urgent) urgentWakeRequested = true;
    if (running) { wakeRequested = true; return; }
    clearTimeout(timer); timer = setTimeout(run, 0); timer.unref();
  };
  wakeSender = wake;
  const sendAlerts = (_cameras, settings, active, urgent = false) => { context = { settings, active }; wake(urgent); };
  sendAlerts.configure = (settings, active) => { context = { settings, active }; };
  sendAlerts.stop = () => { stopped = true; clearTimeout(timer); if (wakeSender === wake) wakeSender = null; };
  return sendAlerts;
}
