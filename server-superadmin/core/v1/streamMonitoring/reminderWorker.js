import { MonitoringState } from "./models.js";
import { TelegramOutbox } from "./telegramModels.js";
import { deliveryTargets, enqueue } from "./notificationOutbox.js";

export async function enqueueDueReminders(settings, active, shouldYield = () => false) {
  const targets = await deliveryTargets();
  const targetById = new Map(targets.map(target => [target.chatId, target]));
  const states = await MonitoringState.find({ state: "DOWN", activeOutage: { $ne: null },
    remindersPaused: { $ne: true }, alertsMuted: { $ne: true }, lifecycleReason: null }).lean();
  const now = Date.now();
  for (const state of states) {
    if (!active() || shouldYield()) return;
    if (state.latestResult?.verdict !== "FAILED"
      || now - new Date(state.observedAt).getTime() > settings.staleAfterMs) continue;
    for (const target of targets) {
      if (!active() || shouldYield()) return;
      const outage = state.activeOutage;
      const initial = await TelegramOutbox.findOne({ outageId: outage.id, chatId: target.chatId, type: "DOWN" }).lean();
      if (!initial) { await enqueue("DOWN", outage, target); continue; }
      if (initial.status !== "SENT") continue;
      const pending = await TelegramOutbox.exists({ outageId: outage.id, chatId: target.chatId,
        type: "REMINDER", status: { $in: ["PENDING", "SENDING", "FAILED"] } });
      if (pending) continue;
      const latest = await TelegramOutbox.findOne({ outageId: outage.id, chatId: target.chatId,
        type: { $in: ["DOWN", "REMINDER"] }, status: "SENT" }).sort({ sentAt: -1 }).lean();
      if (!latest?.sentAt || now - new Date(latest.sentAt).getTime() < settings.reminderMs) continue;
      await enqueue("REMINDER", outage, targetById.get(target.chatId), (latest.sequence || 0) + 1,
        { lastSentAt: latest.sentAt });
    }
  }
}
