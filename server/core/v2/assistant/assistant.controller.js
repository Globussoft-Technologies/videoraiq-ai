import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import conversationService from "./assistantConversation.service.js";
import assistantService from "./assistant.service.js";

const MAX_MESSAGE_CHARS = 4_000;

class AssistantController {
  async list(req, res) {
    try {
      const result = await conversationService.listConversations(req);
      return res.status(200).json(Response.userSuccessResp("Assistant conversations fetched.", result));
    } catch (error) {
      return this.#sendError(res, error, "Failed to fetch assistant conversations.");
    }
  }

  async get(req, res) {
    try {
      const conversation = await conversationService.getConversation(req, req.params.conversationId);
      return res.status(200).json(Response.userSuccessResp("Assistant conversation fetched.", conversation));
    } catch (error) {
      return this.#sendError(res, error, "Failed to fetch the assistant conversation.");
    }
  }

  async remove(req, res) {
    try {
      const conversation = await conversationService.deleteConversation(req, req.params.conversationId);
      return res.status(200).json(Response.userSuccessResp("Assistant conversation deleted.", conversation));
    } catch (error) {
      return this.#sendError(res, error, "Failed to delete the assistant conversation.");
    }
  }

  async rename(req, res) {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
      return res.status(400).json(Response.validationFailResp("Chat title is required.", "Validation failed."));
    }
    if (title.length > 90) {
      return res.status(400).json(Response.validationFailResp("Chat title must be at most 90 characters.", "Validation failed."));
    }

    try {
      const conversation = await conversationService.renameConversation(req, req.params.conversationId, title);
      return res.status(200).json(Response.userSuccessResp("Assistant conversation renamed.", conversation));
    } catch (error) {
      return this.#sendError(res, error, "Failed to rename the assistant conversation.");
    }
  }

  async chat(req, res) {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const history = req.body?.history;
    const conversationId = req.body?.conversationId;

    if (!message) {
      return res.status(400).json(Response.validationFailResp("Message is required.", "Validation failed."));
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return res
        .status(400)
        .json(Response.validationFailResp(`Message must be at most ${MAX_MESSAGE_CHARS} characters.`, "Validation failed."));
    }
    if (history != null && !Array.isArray(history)) {
      return res.status(400).json(Response.validationFailResp("History must be an array.", "Validation failed."));
    }

    let conversation;
    let userMessage;
    try {
      conversation = conversationId
        ? await conversationService.findOwnedConversation(req, conversationId)
        : await conversationService.createConversation(req, message);
      const storedHistory = await conversationService.modelHistory(conversation);
      userMessage = await conversationService.appendMessage(conversation, "user", message);
      const result = await assistantService.askAssistant({ message, history: storedHistory, req });
      const assistantMessage = await conversationService.appendMessage(conversation, "assistant", result.text);

      return res.status(200).json(Response.userSuccessResp("Assistant response generated.", {
        reply: result.text,
        contextGeneratedAt: result.contextGeneratedAt,
        conversation: conversationService.serializeConversation(conversation),
        userMessage: conversationService.serializeMessage(userMessage),
        assistantMessage: conversationService.serializeMessage(assistantMessage),
      }));
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      logger.error(`Assistant chat failed: ${error?.message || error}`);
      const messageText =
        statusCode === 503
          ? "The AI assistant is not configured on this server."
          : statusCode === 502
            ? "The AI provider could not generate a response. Please try again."
            : statusCode === 404
              ? "Conversation was not found."
            : "Failed to generate an assistant response.";

      if (conversation && userMessage && statusCode !== 404) {
        try {
          await conversationService.appendMessage(conversation, "assistant", messageText, true);
        } catch (persistenceError) {
          logger.error(`Failed to persist assistant error response: ${persistenceError?.message || persistenceError}`);
        }
      }

      return res.status(statusCode).json({
        statusCode,
        body: {
          status: "failed",
          message: messageText,
          data: conversation ? { conversationId: String(conversation._id) } : undefined,
        },
      });
    }
  }

  #sendError(res, error, fallbackMessage) {
    const statusCode = Number(error?.statusCode) || 500;
    logger.error(`Assistant conversation request failed: ${error?.message || error}`);
    const message = statusCode === 404 ? "Conversation was not found." : fallbackMessage;
    return res.status(statusCode).json({ statusCode, body: { status: "failed", message } });
  }
}

export default new AssistantController();
