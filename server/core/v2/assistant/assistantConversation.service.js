import mongoose from "mongoose";
import AssistantConversation from "./assistantConversation.model.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MODEL_HISTORY_TURNS = 20;

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
  return {
    id: String(message._id),
    role: message.role,
    text: message.text,
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
  const filter = ownerFilter(req);
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

export async function appendMessage(conversation, role, text, error = false) {
  conversation.messages.push({ role, text, error });
  conversation.messageCount = conversation.messages.length;
  await conversation.save();
  const message = conversation.messages.at(-1);
  return message;
}

export async function modelHistory(conversation) {
  return conversation.messages
    .slice(-MODEL_HISTORY_TURNS)
    .map(({ role, text }) => ({ role, text }));
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
};
