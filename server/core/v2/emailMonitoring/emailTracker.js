import mongoose from "mongoose";
import logger from "../../../utils/logger.js";
import Admin from "../admin/admin.model.js";
import EmailMessage, { rankOf } from "./emailMessage.model.js";

const FAILURE_STATUSES = new Set(["failed", "bounce", "bounced", "dropped", "spamreport"]);
const STATUS_MAP = {
  processed: "queued",
  deferred: "deferred",
  delivered: "delivered",
  open: "opened",
  click: "clicked",
  bounce: "bounced",
  bounced: "bounced",
  dropped: "failed",
  spamreport: "spam",
};

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function emailValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.email || "";
}

function domainOf(email) {
  const domain = String(email || "").split("@")[1] || "";
  return domain.toLowerCase();
}

function objectIdOrNull(value) {
  const id = value?._id || value;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

async function resolveAdminId(metadata = {}) {
  const direct = objectIdOrNull(metadata.adminId || metadata.admin?._id);
  if (direct) return direct;

  const userId = metadata.userId || metadata.admin?.user_id;
  if (!userId) return null;

  const admin = await Admin.findOne({ user_id: String(userId) }).select("_id").lean();
  return admin?._id || null;
}

function messageIdFromSendGrid(sendStatus) {
  const response = Array.isArray(sendStatus) ? sendStatus[0] : sendStatus;
  return normalizeMessageId(response?.headers?.["x-message-id"] || response?.headers?.["X-Message-Id"] || null);
}

function normalizeMessageId(value) {
  return String(value || "").split(".")[0] || null;
}

export async function trackOutboundEmail(email, sendStatus, metadata = {}) {
  try {
    const adminId = await resolveAdminId(metadata);
    const messageId = messageIdFromSendGrid(sendStatus);
    const recipients = asArray(email.to).map(emailValue).filter(Boolean);
    const sender = emailValue(email.from);
    const category = metadata.category || metadata.detectionType || metadata.type || "";
    const timestamp = new Date();

    if (!recipients.length) return;

    await EmailMessage.insertMany(
      recipients.map((recipient) => ({
        adminId,
        messageId,
        direction: "sent",
        sender,
        recipient,
        recipientDomain: domainOf(recipient),
        subject: email.subject || "",
        category,
        status: "sent",
        events: [{ type: "sent", at: timestamp }],
        timestamp,
      })),
      { ordered: false }
    );
  } catch (error) {
    logger.error(`[EMAIL_MONITORING_TRACK_SEND_ERROR] ${error.message}`);
  }
}

export async function trackFailedEmail(email, error, metadata = {}) {
  try {
    const adminId = await resolveAdminId(metadata);
    const recipients = asArray(email.to).map(emailValue).filter(Boolean);
    const sender = emailValue(email.from);
    const category = metadata.category || metadata.detectionType || metadata.type || "";
    const timestamp = new Date();

    if (!recipients.length) return;

    await EmailMessage.insertMany(
      recipients.map((recipient) => ({
        adminId,
        direction: "sent",
        sender,
        recipient,
        recipientDomain: domainOf(recipient),
        subject: email.subject || "",
        category,
        status: "failed",
        error: error?.message || String(error || ""),
        events: [{ type: "failed", at: timestamp, reason: error?.message || "" }],
        timestamp,
      })),
      { ordered: false }
    );
  } catch (trackError) {
    logger.error(`[EMAIL_MONITORING_TRACK_FAIL_ERROR] ${trackError.message}`);
  }
}

export async function trackSendGridEvents(events = []) {
  const payload = asArray(events);
  const results = { received: payload.length, updated: 0, inserted: 0, skipped: 0 };

  for (const event of payload) {
    const rawEvent = String(event.event || "").toLowerCase();
    const status = STATUS_MAP[rawEvent] || rawEvent;
    const messageId = normalizeMessageId(event.sg_message_id || event["smtp-id"]);
    const recipient = event.email || "";
    const at = event.timestamp ? new Date(Number(event.timestamp) * 1000) : new Date();
    const reason = event.reason || event.response || event.status || "";

    if (rankOf(status) < 0) {
      results.skipped += 1;
      continue;
    }

    if (!messageId && !recipient) {
      results.skipped += 1;
      continue;
    }

    const match = messageId && recipient ? { messageId, recipient } : messageId ? { messageId } : { recipient };
    const existing = await EmailMessage.find(match);

    if (!existing.length) {
      await EmailMessage.create({
        messageId,
        direction: "sent",
        recipient,
        recipientDomain: domainOf(recipient),
        status: FAILURE_STATUSES.has(rawEvent) ? "failed" : status,
        error: FAILURE_STATUSES.has(rawEvent) ? reason : "",
        events: [{ type: status, at, reason }],
        timestamp: at,
      });
      results.inserted += 1;
      continue;
    }

    for (const doc of existing) {
      const nextStatus = FAILURE_STATUSES.has(rawEvent) ? STATUS_MAP[rawEvent] : status;
      if (rankOf(nextStatus) >= rankOf(doc.status)) doc.status = nextStatus;
      if (FAILURE_STATUSES.has(rawEvent)) doc.error = reason;
      doc.events.push({ type: status, at, reason });
      await doc.save();
      results.updated += 1;
    }
  }

  return results;
}
