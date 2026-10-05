import mongoose from "mongoose";
import crypto from "node:crypto";
import AssistantConversation from "./assistantConversation.model.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MODEL_HISTORY_TURNS = 40;

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
  };
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
  const filter = ownerFilter(req);
  if (search) filter.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const [total, conversations] = await Promise.all([
    AssistantConversation.countDocuments(filter),
    AssistantConversation.find(filter)
      .select("-messages")
      .sort({ updatedAt: -1 })
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
  return AssistantConversation.create({
    ...owner,
    title: String(title || "New chat").trim().slice(0, 90) || "New chat",
  });
}

export async function appendMessage(conversation, role, text, error = false, ui, attachments = []) {
  conversation.messages.push({ role, text, error, ...(ui ? { ui } : {}), attachments: Array.isArray(attachments) ? attachments : [] });
  conversation.messageCount = conversation.messages.length;
  await conversation.save();
  const message = conversation.messages.at(-1);
  return message;
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
  findOwnedConversation,
  getConversation,
  listConversations,
  modelHistory,
  renameConversation,
  serializeConversation,
  serializeMessage,
  setWorkflowState,
};
