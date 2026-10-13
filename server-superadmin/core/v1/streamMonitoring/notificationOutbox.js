import { hash } from "./identity.js";
import { TelegramOutbox, SuperAdminTelegramRecipient } from "./telegramModels.js";
import SuperAdmin from "../superAdmin/superAdmin.model.js";
import { selectedTelegramChannels } from "./telegramChannels.js";

export async function deliveryTargets() {
  const recipients = await SuperAdminTelegramRecipient.find({}).lean();
  const accounts = await SuperAdmin.find({ _id: { $in: recipients.map(row => row._id) } }).select("_id").lean();
  const valid = new Set(accounts.map(row => String(row._id)));
  const targets = new Map();
  for (const recipient of recipients) {
    if (!valid.has(String(recipient._id))) continue;
    for (const channel of selectedTelegramChannels(recipient)) {
      const row = targets.get(channel.chatId) || { chatId: channel.chatId, ownerIds: [] };
      row.ownerIds.push(recipient._id); targets.set(channel.chatId, row);
    }
  }
  return [...targets.values()];
}

export async function enqueue(type, outage, target, sequence = 0, payload = {}) {
  const key = hash(JSON.stringify([target.chatId, outage.id, type, sequence]));
  await TelegramOutbox.updateOne({ _id: key }, { $setOnInsert: {
    type, cameraId: outage.cameraId, outageId: outage.id, chatId: target.chatId, ownerIds: target.ownerIds || [],
    sequence, payload: { ...outage, ...payload }, status: "PENDING", attempts: 0,
    createdAt: new Date(), nextAttemptAt: new Date(),
  } }, { upsert: true });
  return key;
}

export async function cancelOutage(outageId, types = ["DOWN", "REMINDER"]) {
  await TelegramOutbox.updateMany({ outageId, type: { $in: types }, status: "PENDING" },
    { $set: { status: "CANCELLED" } });
}

export async function projectTransition(transition) {
  const outage = transition.outage;
  if (transition.type === "DOWN") {
    for (const target of await deliveryTargets()) await enqueue("DOWN", outage, target);
    return;
  }
  await cancelOutage(outage.id);
  if (transition.type !== "RECOVERED") return;
  // Destinations are captured by the initial event; do not broadcast recovery to new subscribers.
  const initial = await TelegramOutbox.find({ outageId: outage.id, type: "DOWN" }).lean();
  for (const event of initial) {
    if (event.status === "SENDING") continue; // sender rechecks closure after its HTTP result
    const type = event.status === "SENT" ? "RECOVERED" : "COMBINED_RECOVERY";
    await enqueue(type, outage, { chatId: event.chatId, ownerIds: event.ownerIds });
  }
}
