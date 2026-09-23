import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../core/v2/assistant/assistant.service.js", () => ({
  default: { askAssistant: vi.fn() },
}));

vi.mock("../../../core/v2/assistant/assistantConversation.service.js", () => ({
  default: {
    appendMessage: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    findOwnedConversation: vi.fn(),
    getConversation: vi.fn(),
    listConversations: vi.fn(),
    modelHistory: vi.fn(),
    renameConversation: vi.fn(),
    serializeConversation: vi.fn(),
    serializeMessage: vi.fn(),
  },
}));

vi.mock("../../../utils/logger.js", () => ({
  default: { error: vi.fn() },
}));

import assistantService from "../../../core/v2/assistant/assistant.service.js";
import conversationService from "../../../core/v2/assistant/assistantConversation.service.js";
import assistantController from "../../../core/v2/assistant/assistant.controller.js";
import { makeReqRes } from "../../helpers/factory.js";

const conversation = {
  _id: "66f123456789012345678901",
  title: "Hello",
  messageCount: 0,
  messages: [],
};
const userMessage = { _id: "66f123456789012345678902", role: "user", text: "Hello" };
const assistantMessage = { _id: "66f123456789012345678903", role: "assistant", text: "Hi" };

beforeEach(() => {
  vi.clearAllMocks();
  conversationService.createConversation.mockResolvedValue(conversation);
  conversationService.findOwnedConversation.mockResolvedValue(conversation);
  conversationService.modelHistory.mockResolvedValue([]);
  conversationService.appendMessage.mockImplementation(async (_conversation, role, text, error = false) => ({
    ...(role === "user" ? userMessage : assistantMessage),
    text,
    error,
  }));
  conversationService.serializeConversation.mockReturnValue({
    id: String(conversation._id),
    title: conversation.title,
    messageCount: 2,
  });
  conversationService.serializeMessage.mockImplementation((message) => ({
    id: String(message._id),
    role: message.role,
    text: message.text,
    error: Boolean(message.error),
  }));
});

describe("assistantController.chat", () => {
  it("rejects an empty message", async () => {
    const { req, res } = makeReqRes();
    req.body = { message: "   " };

    await assistantController.chat(req, res);

    expect(res.statusCode).toBe(400);
    expect(res._body.body.message).toBe("Message is required.");
    expect(assistantService.askAssistant).not.toHaveBeenCalled();
  });

  it("rejects malformed legacy history", async () => {
    const { req, res } = makeReqRes();
    req.body = { message: "Hello", history: "not-an-array" };

    await assistantController.chat(req, res);

    expect(res.statusCode).toBe(400);
    expect(res._body.body.message).toBe("History must be an array.");
  });

  it("creates a conversation and persists both messages", async () => {
    const { req, res } = makeReqRes();
    req.body = { message: "Hello" };
    assistantService.askAssistant.mockResolvedValueOnce({
      text: "Hi",
      contextGeneratedAt: "2026-09-22T12:00:00.000Z",
    });

    await assistantController.chat(req, res);

    expect(res.statusCode).toBe(200);
    expect(conversationService.createConversation).toHaveBeenCalledWith(req, "Hello");
    expect(conversationService.appendMessage).toHaveBeenNthCalledWith(1, conversation, "user", "Hello");
    expect(conversationService.appendMessage).toHaveBeenNthCalledWith(2, conversation, "assistant", "Hi");
    expect(res._body.body.data).toMatchObject({
      reply: "Hi",
      conversation: { id: String(conversation._id) },
      userMessage: { role: "user", text: "Hello" },
      assistantMessage: { role: "assistant", text: "Hi" },
    });
  });

  it("uses stored history when continuing an owned conversation", async () => {
    const { req, res } = makeReqRes();
    req.body = { message: "Continue", conversationId: String(conversation._id) };
    const storedHistory = [{ role: "user", text: "Earlier question" }];
    conversationService.modelHistory.mockResolvedValueOnce(storedHistory);
    assistantService.askAssistant.mockResolvedValueOnce({ text: "Continued." });

    await assistantController.chat(req, res);

    expect(res.statusCode).toBe(200);
    expect(conversationService.findOwnedConversation).toHaveBeenCalledWith(req, String(conversation._id));
    expect(assistantService.askAssistant).toHaveBeenCalledWith({
      message: "Continue",
      history: storedHistory,
      req,
    });
  });

  it("persists a safe error message when the provider fails", async () => {
    const { req, res } = makeReqRes();
    req.body = { message: "Hello" };
    const error = new Error("provider internals");
    error.statusCode = 502;
    assistantService.askAssistant.mockRejectedValueOnce(error);

    await assistantController.chat(req, res);

    expect(res.statusCode).toBe(502);
    expect(res._body.body.message).toBe("The AI provider could not generate a response. Please try again.");
    expect(res._body.body.data.conversationId).toBe(String(conversation._id));
    expect(conversationService.appendMessage).toHaveBeenLastCalledWith(
      conversation,
      "assistant",
      "The AI provider could not generate a response. Please try again.",
      true,
    );
    expect(JSON.stringify(res._body)).not.toContain("provider internals");
  });
});

describe("assistantController conversation history", () => {
  it("returns paginated conversation summaries", async () => {
    const { req, res } = makeReqRes();
    const result = { conversations: [{ id: String(conversation._id) }], pagination: { page: 1, total: 1 } };
    conversationService.listConversations.mockResolvedValueOnce(result);

    await assistantController.list(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.body.data).toEqual(result);
  });

  it("deletes only through the owner-scoped service", async () => {
    const { req, res } = makeReqRes();
    req.params = { conversationId: String(conversation._id) };
    conversationService.deleteConversation.mockResolvedValueOnce({ id: String(conversation._id) });

    await assistantController.remove(req, res);

    expect(res.statusCode).toBe(200);
    expect(conversationService.deleteConversation).toHaveBeenCalledWith(req, String(conversation._id));
  });

  it("renames an owned conversation", async () => {
    const { req, res } = makeReqRes();
    req.params = { conversationId: String(conversation._id) };
    req.body = { title: "  Daily incident summary  " };
    conversationService.renameConversation.mockResolvedValueOnce({
      id: String(conversation._id),
      title: "Daily incident summary",
    });

    await assistantController.rename(req, res);

    expect(res.statusCode).toBe(200);
    expect(conversationService.renameConversation).toHaveBeenCalledWith(
      req,
      String(conversation._id),
      "Daily incident summary",
    );
    expect(res._body.body.data.title).toBe("Daily incident summary");
  });

  it("rejects an empty renamed title", async () => {
    const { req, res } = makeReqRes();
    req.params = { conversationId: String(conversation._id) };
    req.body = { title: "   " };

    await assistantController.rename(req, res);

    expect(res.statusCode).toBe(400);
    expect(conversationService.renameConversation).not.toHaveBeenCalled();
  });
});
