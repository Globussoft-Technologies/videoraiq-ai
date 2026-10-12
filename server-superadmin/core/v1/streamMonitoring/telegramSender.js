import axios from "axios";
import { createHash, randomUUID } from "node:crypto";
import SuperAdmin from "../superAdmin/superAdmin.model.js";
import logger from "../../../utils/logger.js";
import { readInventory } from "./inventory.js";
import { MonitoringState } from "./models.js";
import { SuperAdminTelegramRecipient, SuperAdminTelegramDelivery } from "./telegramModels.js";
import { telegramBotToken, telegramBotIdentity, selectedTelegramChannels } from "./telegramChannels.js";
import { buildStreamReport, notificationDue, REMINDER_MS } from "./telegramReport.js";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const channelKey = chatId => createHash("sha256").update(chatId).digest("hex");
let wakeSender;
export const requestStreamTelegramReport = () => wakeSender?.();

// Sending a long report runs separately, so it never pauses camera observations.
// The collector's shared lease authorizes the active worker.
export function createStreamTelegramSender() {
  const owner = randomUUID();
  let context;
  let timer;
  let running = false;
  let stopped = false;
  let retryUntil = 0;

  async function run() {
    if (running || stopped || !context) return;
    const { settings, active } = context;
    if (!active() || !telegramBotToken()) return;
    running = true;
    let nextDelay = REMINDER_MS;
    let schedule = false;
    try {
      await telegramBotIdentity();
      const recipients = await SuperAdminTelegramRecipient.find({}).lean();
      if (!recipients.length) return;
      const accounts = await SuperAdmin.find({ _id: { $in: recipients.map(row => row._id) } }).select("_id").lean();
      const validOwners = new Set(accounts.map(account => String(account._id)));
      const targets = new Map();
      for (const recipient of recipients) {
        if (!validOwners.has(String(recipient._id))) continue;
        for (const channel of selectedTelegramChannels(recipient)) {
          if (!targets.has(channel.chatId)) targets.set(channel.chatId, { ownerIds: [], selectedAt: 0 });
          const target = targets.get(channel.chatId);
          target.ownerIds.push(recipient._id);
          target.selectedAt = Math.max(target.selectedAt, new Date(recipient.selectionChangedAt || 0).getTime());
        }
      }
      if (!targets.size || !active()) return;
      const inventory = await readInventory(settings);
      const states = await MonitoringState.find({ _id: { $in: inventory.cameras.map(camera => String(camera.cameraId)) } })
        .select("adminId nvrId sourceKey alive observedAt downSince telegramDownSince").lean();
      const report = buildStreamReport(inventory, states, settings, Date.now());
      if (!report.items.length || !active()) return;
      schedule = true;
      for (const [chatId, { ownerIds, selectedAt }] of targets) {
        if (!active()) break;
        if (Date.now() < retryUntil) { nextDelay = Math.min(nextDelay, retryUntil - Date.now()); break; }
        const id = channelKey(chatId);
        let delivery = await SuperAdminTelegramDelivery.findById(id).lean();
        const due = record => notificationDue(record, report, Date.now())
          || (selectedAt > new Date(record?.lastSentAt || 0).getTime()
            && new Date(record?.nextAttemptAt || 0).getTime() <= Date.now());
        if (!due(delivery)) {
          const dueAt = Math.max(new Date(delivery?.nextAttemptAt || 0).getTime(),
            new Date(delivery?.lastSentAt || 0).getTime() + REMINDER_MS);
          nextDelay = Math.min(nextDelay, Math.max(1000, dueAt - Date.now()));
          continue;
        }
        try {
          delivery = await SuperAdminTelegramDelivery.findOneAndUpdate({ _id: id,
            $or: [{ owner }, { leaseUntil: { $lte: new Date() } }, { leaseUntil: { $exists: false } }] },
          { $set: { owner, leaseUntil: new Date(Date.now() + 90_000) } }, { upsert: true, new: true }).lean();
        } catch (error) { if (error.code === 11000) continue; throw error; }
        try {
          if (!due(delivery) || !active()) continue;
          const sentAt = new Date();
          let completed = true;
          for (let index = 0; index < report.messages.length; index++) {
            if (index > 0) await wait(3100);
            if (!active()) { completed = false; break; }
            const linked = await SuperAdminTelegramRecipient.find({ _id: { $in: ownerIds } }).lean();
            if (!linked.some(recipient => selectedTelegramChannels(recipient).some(channel => channel.chatId === chatId))) {
              completed = false;
              break;
            }
            const renewed = await SuperAdminTelegramDelivery.updateOne({ _id: id, owner },
              { $set: { leaseUntil: new Date(Date.now() + 90_000) } });
            if (renewed.matchedCount !== 1 || !active()) { completed = false; break; }
            const response = await axios.post(`https://api.telegram.org/bot${telegramBotToken()}/sendMessage`, {
              chat_id: chatId, text: report.messages[index], link_preview_options: { is_disabled: true },
            }, { timeout: 5000, maxRedirects: 0, maxContentLength: 1_000_000 });
            if (response.data?.ok !== true) throw Object.assign(new Error("Telegram rejected message"), { response });
          }
          if (completed) {
            const reportedEpisodes = [...new Set([...(delivery.reportedEpisodes || [])
              .filter(episode => report.ongoingEpisodes.has(episode)), ...report.items.map(item => item.episode)])];
            await SuperAdminTelegramDelivery.updateOne({ _id: id, owner },
              { $set: { lastSentAt: sentAt, reportedEpisodes }, $unset: { nextAttemptAt: "" } });
            nextDelay = Math.min(nextDelay, Math.max(1000, sentAt.getTime() + REMINDER_MS - Date.now()));
          }
        } catch (error) {
          const code = error.response?.data?.error_code || error.response?.status;
          const retrySeconds = Number(error.response?.data?.parameters?.retry_after);
          const delay = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000
            : [400, 401, 403].includes(code) ? REMINDER_MS : 10_000;
          if (code === 429) retryUntil = Date.now() + delay;
          await SuperAdminTelegramDelivery.updateOne({ _id: id, owner },
            { $set: { nextAttemptAt: new Date(Date.now() + delay) } });
          nextDelay = Math.min(nextDelay, delay);
          // Axios errors include the bot token in their URL; log only the status.
          logger.warn(`[STREAM_TELEGRAM] delivery will retry (Telegram ${code || "network error"})`);
        } finally {
          await SuperAdminTelegramDelivery.updateOne({ _id: id, owner }, { $unset: { owner: "", leaseUntil: "" } });
        }
      }
    } catch {
      logger.error("[STREAM_TELEGRAM] report processing failed; will retry");
      nextDelay = 10_000;
      schedule = true;
    } finally {
      running = false;
      if (schedule && !stopped && active()) {
        clearTimeout(timer);
        timer = setTimeout(run, Math.max(1000, nextDelay));
        timer.unref();
      }
    }
  }

  const wake = () => {
    if (!running && !stopped) {
      clearTimeout(timer);
      timer = setTimeout(run, 0);
      timer.unref();
    }
  };
  wakeSender = wake;
  const sendAlerts = (_cameras, settings, active) => { context = { settings, active }; wake(); };
  sendAlerts.stop = () => { stopped = true; clearTimeout(timer); if (wakeSender === wake) wakeSender = null; };
  return sendAlerts;
}
