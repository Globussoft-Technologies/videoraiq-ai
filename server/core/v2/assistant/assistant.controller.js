import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import conversationService from "./assistantConversation.service.js";
import assistantService from "./assistant.service.js";
import { transcribeAudio } from "./assistant.provider.js";
import authorizedUsersService from "../authorizedUsers/authorizedUsers.service.js";
import path from "node:path";
import crypto from "node:crypto";
import { putMediaV2, readMediaV2, streamMediaV2 } from "../adminStorage/mediaStorage.v2.js";

const MAX_MESSAGE_CHARS = 4_000;
const REGISTER_DETAIL_STEPS = ["firstName", "lastName", "designation", "department"];
const registerExecutionLocks = new Set();

// Persist assistant photos immediately through the shared V2 media storage
// resolver. No persistent local fallback is allowed for chatbot attachments.
async function storeAssistantFace({ adminId, conversationId, angle, file }) {
  const extension = file.mimetype === "image/png" ? "png" : "jpg";
  try {
    // Use the shared V2 resolver so admin storage settings and ENV-backed
    // NAS/S3 storage behave identically to the rest of the application.
    return await putMediaV2({
      adminId,
      buffer: file.buffer,
      mediaType: "image",
      folderName: `assistant/${conversationId}`,
      originalName: `${angle}-${crypto.randomUUID()}.${extension}`,
      fallbackToEnv: true,
    });
  } catch (error) {
    logger.error(`Assistant attachment was not stored in remote media storage: ${error?.message || error}`);
    throw error;
  }
}

function persistRegistrationImageReferences(conversation, faceEnrollmentStorage = {}) {
  const latestUserMessage = [...(conversation.messages || [])].reverse().find((message) => message.role === "user");
  if (!latestUserMessage) return;
  const uploaded = Object.entries(faceEnrollmentStorage)
    .filter(([, pathValue]) => typeof pathValue === "string" && pathValue)
    .map(([angle, pathValue]) => ({
      attachmentId: `att_${crypto.randomUUID()}`,
      type: "image",
      angle,
      path: pathValue,
      storageKey: pathValue,
      fileName: `${angle}${String(pathValue).toLowerCase().endsWith(".png") ? ".png" : ".jpg"}`,
      mimeType: String(pathValue).toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
    }));
  if (!uploaded.length) return;
  const existing = Array.isArray(latestUserMessage.attachments) ? latestUserMessage.attachments : [];
  const merged = new Map(existing.map((attachment) => [attachment?.angle || attachment?.storageKey || attachment?.path || JSON.stringify(attachment), attachment]));
  uploaded.forEach((attachment) => {
    const previous = merged.get(attachment.angle) || merged.get(attachment.storageKey);
    merged.set(attachment.angle || attachment.storageKey, previous?.attachmentId ? { ...attachment, attachmentId: previous.attachmentId } : attachment);
  });
  latestUserMessage.attachments = [...merged.values()];
  conversation.markModified("messages");
  return latestUserMessage.attachments;
}

function registrationAttachmentIds(conversation, faceEnrollmentStorage = {}) {
  const latestUserMessage = [...(conversation.messages || [])].reverse().find((message) => message.role === "user");
  const attachments = Array.isArray(latestUserMessage?.attachments) ? latestUserMessage.attachments : [];
  return Object.fromEntries(Object.entries(faceEnrollmentStorage).map(([angle, storageKey]) => {
    const attachment = attachments.find((candidate) => (candidate?.storageKey || candidate?.path) === storageKey);
    return [angle, attachment?.attachmentId || null];
  }));
}

function imageFileFromDataUrl(value, index) {
  const match = String(value || "").match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return {
    buffer: Buffer.from(match[2], "base64"),
    mimetype: `image/${match[1]}`,
    originalname: `attachment-${index + 1}.${match[1] === "png" ? "png" : "jpg"}`,
  };
}

function registerFaceFlags(state) {
  return {
    front: Boolean(state?.faceEnrollment?.front),
    left: Boolean(state?.faceEnrollment?.left),
    right: Boolean(state?.faceEnrollment?.right),
  };
}

function isFreshRegisterRequest(message) {
  return /^(?:(?:i\s+(?:want|would like)\s+to|please|start|begin)\s+)?(?:register|create|add)\s+(?:(?:an?\s+|your\s+|the\s+)?(?:new\s+)?(?:user|users|employee|employees))\b/i.test(String(message || "").trim());
}

function isRegistrationHowTo(message) {
  const text = String(message || '').trim();
  return /\b(?:steps?|guide|instructions?|how\s+(?:can|do|to)|what\s+(?:do\s+i\s+need|is\s+required)|requirements?|explain)\b/i.test(text)
    && !/^\s*(?:register|create|add|enroll)\b/i.test(text);
}

function isFreshAlertRecipientRequest(message) {
  const value = String(message || "").trim();
  return /\b(?:alert|notification)\s+recipients?\b/i.test(value)
    && /\b(?:add|create|register)\b/i.test(value);
}

function isRegisterConfirmation(message) {
  return /^(?:confirm\s+registration|register\s+user|register|confirm|yes(?:,?\s*register)?)\.?$/i.test(String(message || "").trim());
}

function preserveStoredRegistrationFaces(previous, next) {
  if (previous?.workflow !== "register_new_user" || next?.workflow !== "register_new_user") return next;
  const previousFaces = previous.faceEnrollment || {};
  const nextFaces = next.faceEnrollment || {};
  next.faceEnrollment = {
    front: previousFaces.front || nextFaces.front || null,
    left: previousFaces.left || nextFaces.left || null,
    right: previousFaces.right || nextFaces.right || null,
  };
  const previousStoredFaces = previous.faceEnrollmentStorage || {};
  const nextStoredFaces = next.faceEnrollmentStorage || {};
  next.faceEnrollmentStorage = {
    front: previousStoredFaces.front || nextStoredFaces.front || null,
    left: previousStoredFaces.left || nextStoredFaces.left || null,
    right: previousStoredFaces.right || nextStoredFaces.right || null,
  };
  const previousAttachmentIds = previous.faceEnrollmentAttachmentIds || {};
  const nextAttachmentIds = next.faceEnrollmentAttachmentIds || {};
  next.faceEnrollmentAttachmentIds = {
    front: previousAttachmentIds.front || nextAttachmentIds.front || null,
    left: previousAttachmentIds.left || nextAttachmentIds.left || null,
    right: previousAttachmentIds.right || nextAttachmentIds.right || null,
  };
  const allFacesStored = ["front", "left", "right"].every((angle) => typeof next.faceEnrollment[angle] === "string" && next.faceEnrollment[angle]);
  if (allFacesStored) {
    next.completedSteps = Array.from(new Set([...(next.completedSteps || []), "face.front"]));
    const missingDetail = REGISTER_DETAIL_STEPS.find((step) => !next.completedSteps.includes(step) && !String(next.values?.[step] || "").trim());
    next.currentStep = missingDetail || "review";
    if (next.currentStep === "review" && !["completed", "cancelled", "registering"].includes(next.status)) next.status = "review";
  }
  return next;
}

function registerUiForState(state, previousUi) {
  const step = state?.currentStep;
  // Terminal registration states intentionally have no input card. In
  // particular, a cancelled workflow must not be interpreted as a field named
  // "cancelled" by the generic form fallback.
  if (!state || state.workflow !== "register_new_user" || !step || ["cancelled", "completed", "registering"].includes(state.status)) return undefined;
  if (step === "department" || step === "location") {
    const retainedOptions = previousUi?.workflow === "register_new_user"
      && previousUi?.type === "reference_select"
      && previousUi?.field === step
      && Array.isArray(previousUi.options)
      ? previousUi.options
      : undefined;
    return { type: "reference_select", workflow: "register_new_user", step, currentStep: step, field: step, label: step === "department" ? "Department" : "Location", inputType: "select", searchable: true, ...(retainedOptions ? { options: retainedOptions } : {}), values: { ...(state.values || {}) }, ...(step === "location" ? { allowSkip: true } : {}) };
  }
  if (step === "face.front" || step.endsWith("Face")) {
    return { type: "face_upload", workflow: "register_new_user", step: "face.front", currentStep: "face.front", label: "Face Enrollment", description: "Add one image for each required face view.", fields: [{ field: "front", label: "Front Face", inputType: "image", required: true }, { field: "left", label: "Left Face", inputType: "image", required: true }, { field: "right", label: "Right Face", inputType: "image", required: true }], inputType: "image", actions: ["camera", "upload"], required: true, values: { ...(state.values || {}) }, faceEnrollment: { front: state.faceEnrollment?.front || null, left: state.faceEnrollment?.left || null, right: state.faceEnrollment?.right || null }, progress: { completed: ["front", "left", "right"].filter((angle) => state.faceEnrollment?.[angle]).length, total: 3 } };
  }
  if (step === "employeeReview" || step === "review") {
    return { type: "review", phase: step === "employeeReview" ? "employee" : "final", workflow: "register_new_user", step, currentStep: step, values: { ...(state.values || {}) }, faceEnrollment: { front: Boolean(state.faceEnrollment?.front), left: Boolean(state.faceEnrollment?.left), right: Boolean(state.faceEnrollment?.right) }, actions: step === "employeeReview" ? ["continue_face_enrollment", "edit", "cancel"] : ["register", "back", "cancel"] };
  }
  const labels = { firstName: "First Name", lastName: "Last Name", employeeId: "Employee ID", email: "Email", designation: "Designation", vehicleNumber: "Vehicle Number" };
  const optional = ["employeeId", "email", "location", "vehicleNumber"].includes(step);
  return { type: "form_step", workflow: "register_new_user", step, currentStep: step, field: step, label: labels[step] || step, inputType: step === "email" ? "email" : "text", required: !optional, allowSkip: optional, values: { ...(state.values || {}) }, faceEnrollment: { front: Boolean(state.faceEnrollment?.front), left: Boolean(state.faceEnrollment?.left), right: Boolean(state.faceEnrollment?.right) } };
}

class AssistantController {
  async transcribe(req, res) {
    try {
      const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId.trim() : "";
      if (conversationId) await conversationService.findOwnedConversation(req, conversationId);
      if (!req.file?.buffer?.length) {
        return res.status(400).json(Response.validationFailResp("Audio recording is required.", "Validation failed."));
      }
      const result = await transcribeAudio({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype || "audio/webm",
        originalname: req.file.originalname || "voice.webm",
      });
      return res.status(200).json(Response.userSuccessResp("Audio transcribed.", result));
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      logger.error(`Assistant transcription failed: ${error?.stack || error?.message || error}`);
      const message = statusCode === 422
        ? "No speech was detected in the recording."
        : statusCode === 503
          ? "Voice transcription is not configured on this server."
          : statusCode === 404
            ? "Conversation was not found."
            : "Couldn't understand the recording. Please try again.";
      return res.status(statusCode).json({ status: "failed", message });
    }
  }

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

  async attachment(req, res) {
    try {
      const conversation = await conversationService.findOwnedConversation(req, req.params.conversationId);
      const requestedId = String(req.params.attachmentId || "");
      const attachment = conversation.messages
        .flatMap((message) => Array.isArray(message.attachments) ? message.attachments : [])
        .find((candidate) => {
          const storageKey = candidate?.storageKey || candidate?.path;
          const legacyId = storageKey
            ? `legacy_${crypto.createHash("sha256").update(String(storageKey)).digest("hex").slice(0, 32)}`
            : "";
          return candidate?.attachmentId === requestedId || legacyId === requestedId;
        });
      const storageKey = attachment?.storageKey || attachment?.path;
      if (!storageKey) return res.status(404).json({ status: "failed", message: "Attachment was not found." });
      if (String(storageKey).startsWith("local://assistant/")) {
        return res.status(404).json({ status: "failed", message: "Attachment is stored in an unsupported local location." });
      }
      return await streamMediaV2(storageKey, res);
    } catch (error) {
      if (!res.headersSent) return res.status(error?.statusCode || 404).json({ status: "failed", message: "Attachment was not found." });
      return undefined;
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
    const rawMessage = typeof req.body?.message === "string" ? req.body.message : "";
    const message = /^\s*Password\s*:/i.test(rawMessage) ? rawMessage.trimStart() : rawMessage.trim();
    const history = req.body?.history;
    const conversationId = req.body?.conversationId;
    const incidentContext = req.body?.incidentContext && typeof req.body.incidentContext === "object" && !Array.isArray(req.body.incidentContext)
      ? req.body.incidentContext
      : undefined;
    const attachmentCount = Number.isFinite(Number(req.body?.attachmentCount)) ? Math.max(0, Math.min(20, Number(req.body.attachmentCount))) : 0;
    const imageAttachments = Array.isArray(req.body?.imageAttachments)
      ? req.body.imageAttachments.filter((value) => typeof value === "string" && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value)).slice(0, 3)
      : [];
    const action = req.body?.action && typeof req.body.action === "string"
      ? { action: req.body.action, workflow: req.body.workflow, step: req.body.step, field: req.body.field, value: req.body.value, valueType: req.body.valueType }
      : req.body?.action && typeof req.body.action === "object"
        ? { action: req.body.action.action, workflow: req.body.action.workflow, step: req.body.action.step, field: req.body.action.field, value: req.body.action.value, valueType: req.body.action.valueType, values: req.body.action.values }
        : null;
    const structuredRegisterAction = action?.action === "register" && action?.workflow === "register_new_user" && action?.step === "review";
    const requestedReset = req.body?.resetWorkflow === true
      || isFreshRegisterRequest(message)
      || isFreshAlertRecipientRequest(message);

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
    let completedRegistrationState = null;
    try {
      conversation = conversationId
        ? await conversationService.findOwnedConversation(req, conversationId)
        : await conversationService.createConversation(req, message);
      // “Register User” is the final action for the active workflow, never a
      // request to start another registration. This guard also protects the
      // API when an older frontend sends resetWorkflow=true for that button.
      const activeRegistration = conversation.workflowState?.workflow === "register_new_user"
        && !["cancelled", "completed"].includes(conversation.workflowState.status);
      const confirmingCreateUser = conversation.workflowState?.workflow === "create_user"
        && conversation.workflowState.status === "review"
        && /^(?:create user|confirm|yes)\.?$/i.test(message);
      const resetWorkflow = requestedReset
        && !isRegisterConfirmation(message)
        && !confirmingCreateUser
        && !structuredRegisterAction
        && (!activeRegistration || isFreshRegisterRequest(message));
      if (resetWorkflow) {
        conversation.workflowState = null;
        await conversation.save();
      }
      if (conversation.workflowState?.workflow === "register_new_user") {
        conversation.workflowState = preserveStoredRegistrationFaces(conversation.workflowState, conversation.workflowState);
        conversation.markModified("workflowState");
        await conversation.save();
      }
      if (structuredRegisterAction) {
        logger.info(`[REGISTER_WORKFLOW] REGISTER_CONFIRM conversationId=${String(conversation._id)} currentStep=${conversation.workflowState?.currentStep || "none"} faceEnrollment=${JSON.stringify(registerFaceFlags(conversation.workflowState))}`);
      }
      const storedHistory = await conversationService.modelHistory(conversation);
      // Every non-registration image sent through chat belongs to the user
      // message, including messages carrying a structured task/action. The
      // old action/active-workflow exclusions made those images exist only in
      // the current browser session.
      // Persist files on the same request that creates the user message. A
      // fresh Register User request used to be excluded here because the UI
      // also had a follow-up face-upload request. If that second request was
      // interrupted, the conversation contained only text and the images
      // disappeared after reload. The follow-up workflow upload may still
      // enrich the message with angle metadata, but it must not be the only
      // persistence path.
      // Append the text turn before doing external storage work. SFTP can be
      // temporarily unavailable; creating the conversation first and only
      // appending afterward left a perfectly valid chat with zero messages.
      // That was especially confusing after the client refreshed the thread
      // following a camera/photo action.
      userMessage = await conversationService.appendMessage(conversation, "user", message);

      const canPersistGenericImages = imageAttachments.length > 0;
      const storedImageAttachments = canPersistGenericImages
        ? await Promise.all(imageAttachments.map(async (value, index) => {
            const file = imageFileFromDataUrl(value, index);
            if (!file) return null;
            const remotePath = await storeAssistantFace({ adminId: req.verified?.userData?.adminId, conversationId: String(conversation._id), angle: `attachment-${index + 1}`, file });
            return {
              attachmentId: `att_${crypto.randomUUID()}`,
              type: "image",
              ...(isFreshRegisterRequest(message) ? { angle: ["front", "left", "right"][index] } : {}),
              path: remotePath,
              storageKey: remotePath,
              fileName: file.originalname,
              mimeType: file.mimetype,
            };
          }))
        : [];
      const persistedAttachments = storedImageAttachments.filter(Boolean);
      if (persistedAttachments.length) {
        userMessage.attachments = persistedAttachments;
        conversation.markModified("messages");
        await conversation.save();
      }
      // A cancelled/completed registration is history, not an active workflow.
      // Do not let a later unrelated message be interpreted as the next
      // registration field. A fresh explicit registration request has already
      // cleared this state above via resetWorkflow.
      const assistantWorkflowState = conversation.workflowState?.workflow === "register_new_user"
        && ["cancelled", "completed"].includes(conversation.workflowState.status)
        ? undefined
        : conversation.workflowState;
      const result = await assistantService.askAssistant({ message, history: storedHistory, req, workflowState: assistantWorkflowState, action, incidentContext, attachmentCount, imageAttachments, conversationContext: conversation.conversationContext || null, conversationId: String(conversation._id) });
      // Do not let an empty/malformed MCP response reach Mongoose. The message
      // schema requires text, and that validation error used to surface as an
      // unrelated HTTP 500 instead of identifying the provider failure.
      if (!result || typeof result.text !== "string" || !result.text.trim()) {
        const providerError = new Error("The assistant provider returned an empty response.");
        providerError.statusCode = 502;
        throw providerError;
      }
      // A documentation request is an independent turn. Do not return or
      // persist a stale registration state, otherwise the client rebuilds the
      // old Last Name card even when MCP correctly returned documentation.
      if (isRegistrationHowTo(message) && ["register_new_user", "create_user"].includes(conversation.workflowState?.workflow)) {
        conversation.workflowState = null;
        await conversationService.setWorkflowState(conversation, null);
      }
      // Only rebuild the UI from state produced by this request. Falling back
      // to conversation.workflowState here made a stale firstName card reappear
      // after the MCP had already generated the next face-upload prompt.
      const returnedRegisterState = result.workflowState?.workflow === "register_new_user" ? result.workflowState : null;
      const previousRegisterUi = [...storedHistory].reverse().find((turn) => turn.role === "assistant" && turn.ui?.workflow === "register_new_user" && turn.ui?.type === "reference_select" && Array.isArray(turn.ui?.options) && turn.ui.options.length)?.ui;
      if (returnedRegisterState && (!result.ui || result.ui.workflow !== "register_new_user" || (result.ui.currentStep !== returnedRegisterState.currentStep && !["error", "success", "status"].includes(result.ui.type)) || (returnedRegisterState.currentStep === "department" && Array.isArray(result.ui.options) && result.ui.options.length === 0))) {
        result.ui = registerUiForState(returnedRegisterState, previousRegisterUi);
      }
      if (returnedRegisterState?.status === "cancelled" && !result.ui) {
        // Persist a terminal marker so clients can hide any older registration
        // card in the same transcript. This is a status message, not an input
        // card, so cancellation cannot reopen the workflow visually.
        result.ui = { type: "status", workflow: "register_new_user", status: "cancelled" };
      }
      if (result.executeWorkflow && conversation.workflowState?.workflow === "register_new_user") {
        const lockKey = String(conversation._id);
        if (registerExecutionLocks.has(lockKey)) {
          result.text = "Registration is already in progress. Please wait for it to finish.";
          result.ui = { type: "status", workflow: "register_new_user", status: "registering" };
          result.workflowState = conversation.workflowState;
        } else {
          registerExecutionLocks.add(lockKey);
          conversation.workflowState.status = "registering";
          await conversationService.setWorkflowState(conversation, conversation.workflowState);
          let execution;
          try {
            execution = await this.executeRegisterUser(req, conversation.workflowState);
          } catch (error) {
            logger.error(`Register user execution failed: ${error?.message || error}`);
            execution = { ok: false, text: "I couldn't register the user. Your information has been preserved so you can retry." };
          }
          if (execution.ok) {
            result.text = execution.text;
            result.ui = { type: "success", workflow: "register_new_user", status: "completed", values: conversation.workflowState.values, faceEnrollment: { front: true, left: true, right: true } };
            conversation.workflowState.status = "completed";
            completedRegistrationState = JSON.parse(JSON.stringify(conversation.workflowState));
          } else {
            result.text = execution.text;
            conversation.workflowState.status = "review";
            conversation.workflowState.currentStep = "review";
            result.ui = { type: "error", workflow: "register_new_user", step: "review", currentStep: "review", status: "error", values: { ...conversation.workflowState.values }, faceEnrollment: registerFaceFlags(conversation.workflowState), actions: ["retry", "change", "cancel"] };
          }
          result.workflowState = conversation.workflowState;
          registerExecutionLocks.delete(lockKey);
        }
      }
      if (result.workflowState) {
        result.workflowState = preserveStoredRegistrationFaces(conversation.workflowState, result.workflowState);
        await conversationService.setWorkflowState(conversation, result.workflowState);
      }
      if (Object.hasOwn(result, "conversationContext")) {
        conversation.conversationContext = result.conversationContext || null;
        conversation.markModified("conversationContext");
      }
      // appendMessage saves the reply and its read context in the same document
      // write, so a successful reply cannot leave the prior context behind.
      const assistantMessage = await conversationService.appendMessage(conversation, "assistant", result.text, false, result.ui);
      if (completedRegistrationState) {
        await conversationService.setWorkflowState(conversation, null);
      }

      return res.status(200).json(Response.userSuccessResp("Assistant response generated.", {
        reply: result.text,
        contextGeneratedAt: result.contextGeneratedAt,
        workflowState: completedRegistrationState || conversation.workflowState,
        // Keep the current workflow card available at the response envelope
        // level as well as on assistantMessage. This mirrors the NVR flow and
        // lets clients render the form even when an older response normalizer
        // drops message metadata.
        ui: result.ui,
        conversation: conversationService.serializeConversation(conversation),
        userMessage: conversationService.serializeMessage(userMessage),
        assistantMessage: conversationService.serializeMessage(assistantMessage),
      }));
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      logger.error(`Assistant chat failed: ${error?.stack || error?.message || error}`);
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

  async uploadRegisterUserFace(req, res) {
    const conversationId = String(req.body?.conversationId || "");
    const angle = String(req.body?.angle || "").toLowerCase();
    const conversation = await conversationService.findOwnedConversation(req, conversationId);
    let state = conversation.workflowState;
    const uploadedFiles = [
      ...(Array.isArray(req.files?.files) ? req.files.files : []),
      ...(Array.isArray(req.files?.file) ? req.files.file : []),
    ];
    if (state?.workflow !== "register_new_user" || (!uploadedFiles.length && !["front", "left", "right"].includes(angle))) {
      return res.status(400).json({ status: "failed", message: "No active user registration image step." });
    }

    // The chat response and the upload request can arrive on adjacent event
    // turns. Reconcile a stale detail step from the persisted values before
    // rejecting a face upload. Employee details remain the source of truth;
    // this only advances the pending workflow pointer and never creates data.
    const values = state.values || {};
    const detailsComplete = Boolean(String(values.firstName || "").trim())
      && Boolean(String(values.lastName || "").trim())
      && Boolean(String(values.designation || "").trim())
      && Boolean(String(values.departmentId || "").trim());
    if (detailsComplete && (!["face.front", "frontFace", "leftFace", "rightFace", "review"].includes(state.currentStep))) {
      const missingFace = ["front", "left", "right"].find((candidate) => !state.faceEnrollment?.[candidate]);
      state.currentStep = missingFace ? "face.front" : "review";
      if (state.currentStep === "review") state.status = "review";
      await conversationService.setWorkflowState(conversation, state);
    }

    if (uploadedFiles.length > 1 || (uploadedFiles.length === 1 && !angle)) {
      if (uploadedFiles.length > 3) return res.status(400).json({ status: "failed", message: "This registration needs only 3 face images: Front, Left, and Right." });
      if (uploadedFiles.some((file) => !/^image\/(jpeg|png)$/.test(file.mimetype || ""))) return res.status(400).json({ status: "failed", message: "All face images must be JPG or PNG files." });
      state.faceEnrollment ||= {};
      state.faceEnrollmentStorage ||= {};
      // Prefer explicit angle names in the selected filenames. This prevents
      // left/front/right files from being assigned incorrectly when the file
      // picker returns them in alphabetical or user-selected order. Any
      // remaining ambiguous files retain the documented Front, Left, Right
      // order.
      const assigned = new Map();
      const unused = [];
      for (const file of uploadedFiles) {
        const name = String(file.originalname || "").toLowerCase();
        const match = ["front", "left", "right"].find((candidate) => new RegExp(`(?:^|[^a-z])${candidate}(?:[^a-z]|$)`).test(name) && !assigned.has(candidate));
        if (match) assigned.set(match, file);
        else unused.push(file);
      }
      const missingAngles = ["front", "left", "right"].filter((candidate) => !state.faceEnrollment?.[candidate]);
      for (const candidate of missingAngles) {
        if (!assigned.has(candidate) && unused.length) assigned.set(candidate, unused.shift());
      }
      for (const candidate of ["front", "left", "right"]) {
        if (!assigned.has(candidate) && unused.length) assigned.set(candidate, unused.shift());
      }
      for (const currentAngle of ["front", "left", "right"]) {
        const file = assigned.get(currentAngle);
        if (!file) continue;
        const remotePath = await storeAssistantFace({ adminId: req.verified?.userData?.adminId, conversationId, angle: currentAngle, file });
        state.faceEnrollmentStorage[currentAngle] = remotePath;
        state.faceEnrollment[currentAngle] = remotePath;
        state.completedSteps = Array.from(new Set([...(state.completedSteps || []), `${currentAngle}Face`]));
      }
      persistRegistrationImageReferences(conversation, state.faceEnrollmentStorage);
      state.faceEnrollmentAttachmentIds = registrationAttachmentIds(conversation, state.faceEnrollmentStorage);
      const allFacesStored = ["front", "left", "right"].every((candidate) => state.faceEnrollment?.[candidate]);
      if (allFacesStored && (["face.front", "frontFace", "leftFace", "rightFace"].includes(state.currentStep) || state.currentStep === "employeeReview")) {
        state.currentStep = "review";
        state.status = "review";
      } else if (!allFacesStored && (["face.front", "frontFace", "leftFace", "rightFace"].includes(state.currentStep) || state.currentStep === "employeeReview")) {
        state.currentStep = "face.front";
      }
      await conversationService.setWorkflowState(conversation, state);
      logger.info(`[REGISTER_WORKFLOW] FACE_UPLOAD_SUCCESS conversationId=${conversationId} currentStep=${state.currentStep} faceEnrollment=${JSON.stringify(registerFaceFlags(state))}`);
      const nextUi = state.currentStep === "review"
        ? { type: "review", workflow: "register_new_user", step: "review", currentStep: "review", values: { ...state.values }, faceEnrollment: { front: true, left: true, right: true }, actions: ["register", "back", "cancel"] }
        : state.currentStep === "face.front"
          ? { type: "face_upload", workflow: "register_new_user", step: "face.front", currentStep: "face.front", label: "Face Enrollment", description: "Add one image for each required face view.", fields: [{ field: "front", label: "Front Face", inputType: "image", required: true }, { field: "left", label: "Left Face", inputType: "image", required: true }, { field: "right", label: "Right Face", inputType: "image", required: true }], values: { ...state.values }, faceEnrollment: { front: state.faceEnrollment.front, left: state.faceEnrollment.left, right: state.faceEnrollment.right }, progress: { completed: ["front", "left", "right"].filter((candidate) => state.faceEnrollment?.[candidate]).length, total: 3 } }
        : { type: "form_step", workflow: "register_new_user", step: state.currentStep, currentStep: state.currentStep, field: state.currentStep, label: state.currentStep === "firstName" ? "First Name" : state.currentStep === "lastName" ? "Last Name" : state.currentStep, inputType: state.currentStep === "email" ? "email" : "text", required: !["employeeId", "email", "location", "vehicleNumber"].includes(state.currentStep), allowSkip: ["employeeId", "email", "location", "vehicleNumber"].includes(state.currentStep), values: { ...state.values }, faceEnrollment: { front: Boolean(state.faceEnrollment.front), left: Boolean(state.faceEnrollment.left), right: Boolean(state.faceEnrollment.right) } };
      const nextText = state.currentStep === "review"
        ? "All three face images are uploaded. Please review the user details and choose Register User to continue."
        : "All three face images are stored. Let’s continue with the user details. Required fields must be filled; optional fields include Skip."
      const correctedNextText = state.currentStep === "review"
        ? "All three face images are uploaded. Please review the user details and choose Register User to continue."
        : state.currentStep === "face.front"
          ? `I received ${uploadedFiles.length} face image${uploadedFiles.length === 1 ? "" : "s"}. Add the remaining face views and choose Continue.`
          : "Face images are stored. Let’s continue with the user details. Required fields must be filled; optional fields include Skip.";
      const assistantMessage = await conversationService.appendMessage(conversation, "assistant", correctedNextText, false, nextUi);
    conversation.workflowState = state;
    await conversation.save();
      return res.status(200).json(Response.userSuccessResp("Face images uploaded.", {
        message: correctedNextText,
        userMessage: conversationService.serializeMessage([...conversation.messages].reverse().find((message) => message.role === "user")),
        assistantMessage: conversationService.serializeMessage(assistantMessage),
        ui: nextUi,
        workflowState: state,
      }));
    }

    const file = uploadedFiles[0];
    const expected = "face.front";
    if (state.currentStep !== expected) return res.status(400).json({ status: "failed", message: `The registration is currently waiting for ${state.currentStep}.` });
    if (!file || !/^image\/(jpeg|png)$/.test(file.mimetype || "")) return res.status(400).json({ status: "failed", message: "Upload a JPG or PNG image." });
    state.faceEnrollment ||= {};
    state.faceEnrollmentStorage ||= {};
    const remotePath = await storeAssistantFace({ adminId: req.verified?.userData?.adminId, conversationId, angle, file });
    state.faceEnrollmentStorage[angle] = remotePath;
    state.faceEnrollment[angle] = remotePath;
    persistRegistrationImageReferences(conversation, state.faceEnrollmentStorage);
    state.faceEnrollmentAttachmentIds = registrationAttachmentIds(conversation, state.faceEnrollmentStorage);
    state.completedSteps = Array.from(new Set([...(state.completedSteps || []), expected]));
    state.currentStep = ["front", "left", "right"].every((candidate) => state.faceEnrollment?.[candidate]) ? "review" : "face.front";
    if (state.currentStep === "review") state.status = "review";
    await conversationService.setWorkflowState(conversation, state);
    logger.info(`[REGISTER_WORKFLOW] FACE_UPLOAD_SUCCESS conversationId=${conversationId} currentStep=${state.currentStep} faceEnrollment=${JSON.stringify(registerFaceFlags(state))}`);
    const nextLabel = "Face Enrollment";
    const nextUi = state.currentStep === "face.front"
      ? {
          type: "face_upload",
          workflow: "register_new_user",
          step: "face.front",
          currentStep: "face.front",
          label: nextLabel,
          description: "Add one image for each required face view.",
          fields: [{ field: "front", label: "Front Face", inputType: "image", required: true }, { field: "left", label: "Left Face", inputType: "image", required: true }, { field: "right", label: "Right Face", inputType: "image", required: true }],
          inputType: "image",
          actions: ["camera", "upload"],
          required: true,
          values: { ...state.values },
          faceEnrollment: { front: Boolean(state.faceEnrollment.front), left: Boolean(state.faceEnrollment.left), right: Boolean(state.faceEnrollment.right) },
        }
      : {
          type: "review",
          workflow: "register_new_user",
          step: "review",
          currentStep: "review",
          values: { ...state.values },
          faceEnrollment: { front: true, left: true, right: true },
          actions: ["register", "back", "cancel"],
        };
    const nextText = state.currentStep === "review"
      ? "All three face images are uploaded. Please review the user details and choose Register User to continue."
      : state.currentStep === "review" ? "All three face images are uploaded. Please review the user details and choose Register User to continue." : `${angle[0].toUpperCase()}${angle.slice(1)} Face uploaded. Add the remaining face views and choose Continue.`;
    const assistantMessage = await conversationService.appendMessage(conversation, "assistant", nextText, false, nextUi);
    return res.status(200).json(Response.userSuccessResp("Registration image uploaded.", {
      message: nextText,
      userMessage: conversationService.serializeMessage([...conversation.messages].reverse().find((message) => message.role === "user")),
      assistantMessage: conversationService.serializeMessage(assistantMessage),
      ui: nextUi,
      workflowState: state,
    }));
  }

  async executeRegisterUser(req, state) {
    const references = ["front", "left", "right"].map((angle) => ({
      angle,
      storageKey: state.faceEnrollmentStorage?.[angle] || state.faceEnrollment?.[angle],
    }));
    if (references.some((reference) => typeof reference.storageKey !== "string" || !reference.storageKey)) return { ok: false, text: "I couldn't register the user because all three face images are required." };
    const files = [];
    try {
      for (const reference of references) {
        const buffer = await readMediaV2(reference.storageKey);
        files.push({ buffer, originalname: path.basename(reference.storageKey), mimetype: reference.storageKey.endsWith(".png") ? "image/png" : "image/jpeg" });
      }
      const values = state.values || {};
      let response;
      const mockRes = { status(code) { this.code = code; return this; }, json(payload) { response = { code: this.code || 200, payload }; return this; }, send(payload) { response = { code: this.code || 200, payload }; return this; } };
      await authorizedUsersService.createAuthUser({ verified: req.verified, body: { firstName: values.firstName, lastName: values.lastName, email: values.email || "", emp_id: values.employeeId || "", departmentId: values.departmentId || "", designation: values.designation, vehicleNumber: values.vehicleNumber || "", location: values.location || "" }, files }, mockRes);
      const success = response?.code >= 200 && response?.code < 300 && response?.payload?.body?.status === "success";
      const failure = response?.payload?.body;
      const reason = failure?.message && failure.message !== "Failed to create authorizedUser."
        ? failure.message
        : failure?.error || failure?.message || "The registration service rejected the request.";
      return { ok: success, text: success ? `User registered successfully.\n\n${values.firstName} ${values.lastName}\nFace Enrollment: Front ✓  Left ✓  Right ✓` : `I couldn't register the user.\n\nReason: ${reason}\n\nYour information has been preserved. You can retry without re-entering the details or uploading the photos.` };
    } finally {
      // Keep the server-side face references after a failed registration so a
      // retry does not send the user back through all three uploads. Successful
      // registration cleanup is performed after the API has accepted the user.
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
