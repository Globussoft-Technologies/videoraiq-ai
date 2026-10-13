import mongoose from "mongoose";
import crypto from "node:crypto";
import AssistantConversation from "./assistantConversation.model.js";
import logger from "../../../utils/logger.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MODEL_HISTORY_TURNS = 40;
export const MAX_RETAINED_CONVERSATIONS = 20;
const ownerLocks = new Map();

function ownerKey(owner) {
  return `${owner.adminId}:${owner.ownerType}:${owner.ownerId}`;
}

async function withOwnerLock(owner, work) {
  const key = ownerKey(owner);
  const previous = ownerLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  ownerLocks.set(key, current);
  await previous;
  try { return await work(); }
  finally {
    release();
    if (ownerLocks.get(key) === current) ownerLocks.delete(key);
  }
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function conversationOwner(req) {
  const adminId = req?.verified?.userData?.adminId;
  const memberId = req?.verified?.userData?.memberId;
  if (!adminId) throw httpError("Authenticated account is missing an admin ID.", 401);
  return {
    adminId,
    ownerType: memberId ? "member" : "admin",
    ownerId: memberId || adminId,
  };
}

function ownerFilter(req) {
  const { adminId, ownerType, ownerId } = conversationOwner(req);
  return { adminId, ownerType, ownerId };
}

export function serializeConversation(conversation) {
  return {
    id: String(conversation._id),
    title: conversation.title,
    messageCount: conversation.messageCount || 0,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastActivityAt: conversation.lastActivityAt || conversation.updatedAt || conversation.createdAt,
  };
}

export async function enforceConversationLimit(owner, limit = MAX_RETAINED_CONVERSATIONS) {
  const filter = { adminId: owner.adminId, ownerType: owner.ownerType, ownerId: owner.ownerId };
  // Documents created before lastActivityAt was introduced remain eligible:
  // seed their activity from the existing timestamp without loading them.
  await AssistantConversation.updateMany(
    { ...filter, $or: [{ lastActivityAt: { $exists: false } }, { lastActivityAt: null }] },
    [{ $set: { lastActivityAt: { $ifNull: ["$updatedAt", "$createdAt"] } } }],
  );
  const keep = await AssistantConversation.find(filter)
    .select("_id")
    .sort({ lastActivityAt: -1, updatedAt: -1, _id: -1 })
    .limit(limit)
    .lean();
  if (keep.length < limit) return { deletedCount: 0, keptCount: keep.length };
  // Delete by the current boundary rather than by a stale `$nin` list. A
  // conversation created by another API process between the read and delete
  // is newer than this boundary and is therefore protected.
  const boundary = keep.at(-1);
  const result = await AssistantConversation.deleteMany({
    ...filter,
    $or: [
      { lastActivityAt: { $lt: boundary.lastActivityAt } },
      { lastActivityAt: boundary.lastActivityAt, updatedAt: { $lt: boundary.updatedAt } },
      { lastActivityAt: boundary.lastActivityAt, updatedAt: boundary.updatedAt, _id: { $lt: boundary._id } },
    ],
  });
  return { deletedCount: result.deletedCount || 0, keptCount: keep.length };
}

export async function cleanupAllConversationLimits() {
  const owners = await AssistantConversation.aggregate([
    { $group: { _id: { adminId: "$adminId", ownerType: "$ownerType", ownerId: "$ownerId" } } },
  ]);
  let deletedCount = 0;
  for (const { _id: owner } of owners) {
    const result = await withOwnerLock(owner, () => enforceConversationLimit(owner));
    deletedCount += result.deletedCount;
  }
  return { owners: owners.length, deletedCount };
}

export function serializeMessage(message) {
  const serializeAttachment = (attachment) => {
    const storageKey = attachment?.storageKey || attachment?.path;
    const attachmentId = attachment?.attachmentId || (storageKey
      ? `legacy_${crypto.createHash("sha256").update(String(storageKey)).digest("hex").slice(0, 32)}`
      : null);
    if (!attachmentId) return null;
    return {
      attachmentId,
      type: attachment?.type || "file",
      ...(attachment?.angle ? { angle: attachment.angle } : {}),
      ...(attachment?.fileName ? { fileName: attachment.fileName } : {}),
      ...(attachment?.mimeType ? { mimeType: attachment.mimeType } : {}),
    };
  };
  const attachments = (message.attachments || []).map(serializeAttachment).filter(Boolean);
  return {
    id: String(message._id),
    role: message.role,
    text: message.text,
    ...(message.ui ? { ui: message.ui } : {}),
    // Keep this field present even when empty. Clients must use persisted
    // attachment metadata, never a browser-only File/blob preview.
    attachments,
    error: Boolean(message.error),
    at: message.createdAt,
  };
}

export async function listConversations(req) {
  const requestedPage = Number.parseInt(req.query?.page, 10);
  const requestedLimit = Number.parseInt(req.query?.limit, 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : DEFAULT_PAGE_SIZE,
  );
  const search = String(req.query?.search || '').trim().slice(0, 100);
  const owner = conversationOwner(req);
  try {
    await withOwnerLock(owner, () => enforceConversationLimit(owner));
  } catch (error) {
    logger.error(`[ASSISTANT-RETENTION] request cleanup failed: ${error?.message || error}`);
  }
  const filter = { ...owner };
  if (search) filter.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const [total, conversations] = await Promise.all([
    AssistantConversation.countDocuments(filter),
    AssistantConversation.find(filter)
      .select("-messages")
      .sort({ lastActivityAt: -1, updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    conversations: conversations.map(serializeConversation),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function findOwnedConversation(req, conversationId) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    throw httpError("Conversation was not found.", 404);
  }
  const conversation = await AssistantConversation.findOne({
    _id: conversationId,
    ...ownerFilter(req),
  });
  if (!conversation) throw httpError("Conversation was not found.", 404);
  return conversation;
}

export async function getConversation(req, conversationId) {
  const conversation = await findOwnedConversation(req, conversationId);
  return {
    ...serializeConversation(conversation),
    workflowState: conversation.workflowState || null,
    messages: conversation.messages.map(serializeMessage),
  };
}

export async function createConversation(req, title) {
  const owner = conversationOwner(req);
  return withOwnerLock(owner, async () => {
    const conversation = await AssistantConversation.create({
      ...owner,
      title: String(title || "New chat").trim().slice(0, 90) || "New chat",
      lastActivityAt: new Date(),
    });
    try {
      await enforceConversationLimit(owner);
    } catch (error) {
      // The conversation is still usable; the scheduled idempotent sweep will
      // retry a transient deletion failure.
      logger.error(`[ASSISTANT-RETENTION] create cleanup failed: ${error?.message || error}`);
    }
    return conversation;
  });
}

export async function appendMessage(conversation, role, text, error = false, ui, attachments = []) {
  const owner = { adminId: conversation.adminId, ownerType: conversation.ownerType, ownerId: conversation.ownerId };
  return withOwnerLock(owner, async () => {
    const current = await AssistantConversation.findOne({ _id: conversation._id, ...owner });
    if (!current) throw httpError("Conversation was not found.", 404);
    current.messages.push({ role, text, error, ...(ui ? { ui } : {}), attachments: Array.isArray(attachments) ? attachments : [] });
    current.messageCount = current.messages.length;
    current.lastActivityAt = new Date();
    await current.save();
    conversation.set(current.toObject());
    return current.messages.at(-1);
  });
}

export async function setWorkflowState(conversation, workflowState) {
  conversation.workflowState = workflowState || null;
  // workflowState is a Mixed field and face uploads mutate nested properties
  // (faceEnrollment/currentStep/completedSteps). Explicitly mark it dirty so
  // MongoDB cannot persist the message/UI while silently retaining the older
  // firstFace state.
  conversation.markModified("workflowState");
  await conversation.save();
  return conversation.workflowState;
}

export async function modelHistory(conversation) {
  return conversation.messages
    .slice(-MODEL_HISTORY_TURNS)
    .map(({ role, text, ui }) => ({ role, text, ...(ui ? { ui } : {}) }));
}

export async function deleteConversation(req, conversationId) {
  const conversation = await findOwnedConversation(req, conversationId);
  await AssistantConversation.deleteOne({ _id: conversation._id });
  return serializeConversation(conversation);
}

export async function renameConversation(req, conversationId, title) {
  const conversation = await findOwnedConversation(req, conversationId);
  conversation.title = title;
  await conversation.save();
  return serializeConversation(conversation);
}

export default {
  appendMessage,
  createConversation,
  deleteConversation,
  enforceConversationLimit,
  cleanupAllConversationLimits,
  findOwnedConversation,
  getConversation,
  listConversations,
  modelHistory,
  renameConversation,
  serializeConversation,
  serializeMessage,
  setWorkflowState,
};
