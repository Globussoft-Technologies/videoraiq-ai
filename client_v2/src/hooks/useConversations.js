import { useCallback, useEffect, useRef, useState } from 'react';
import {
  askAssistant,
  fetchAssistantAttachment,
  deleteAssistantConversation,
  getAssistantConversation,
  listAssistantConversations,
  renameAssistantConversation,
} from '@/helpers/assistant';

const ACTIVE_KEY = 'vq_assistant_active_id';
const PAGE_SIZE = 50;

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function startsFreshWorkflow(text) {
  const value = String(text || '').trim();
  const startsRecipientBatch = /\b(?:alert|notification)\s+recipients?\b/i.test(value)
    || /\b(?:add|adding|create|creating|register|registering)\b[^\n.!?]*\b(?:new\s+)?emails?\b/i.test(value)
    || /\b(?:add|adding|create|creating|register|registering)\b[^\n.!?]*\bemail\s+addresses?\b/i.test(value);
  return /^(?:(?:i\s+(?:want|would like)\s+to|please|start|begin)\s+)?(?:create|add|set\s+up|setup)\s+(?:an?\s+)?(?:new\s+)?(?:auto\s+email|attendance\s+email)\s+reports?\b/i.test(value)
    || /^(?:(?:i\s+(?:want|would like)\s+to|please|start|begin)\s+)?(?:register|create|add)\s+(?:(?:an?\s+|your\s+|the\s+)?new\s+(?:user|employee)s?|(?:an?\s+|your\s+|the\s+)?(?:user|users|employee|employees))\s*$/i.test(value)
    // Alert-recipient creation is stateful too; a new batch must not reuse a
    // previous recipient's review state.
    || startsRecipientBatch && /\b(?:add|adding|create|creating|register|registering)\b/i.test(value);
}

function registrationUiFromState(state) {
  if (state?.workflow !== 'register_new_user' || !state.currentStep || ['completed', 'cancelled', 'registering'].includes(state.status)) return null;
  const step = state.currentStep;
  if (step === 'employeeReview' || step === 'review') return { type: 'review', phase: step === 'employeeReview' ? 'employee' : 'final', workflow: 'register_new_user', step, currentStep: step, values: { ...(state.values || {}) }, faceEnrollment: { front: Boolean(state.faceEnrollment?.front), left: Boolean(state.faceEnrollment?.left), right: Boolean(state.faceEnrollment?.right) } };
  if (step.endsWith('Face')) return { type: 'face_upload', workflow: 'register_new_user', step: 'face.front', currentStep: 'face.front', field: 'face.front', inputType: 'image', actions: ['camera', 'upload'], required: true, values: { ...(state.values || {}) }, faceEnrollment: { front: Boolean(state.faceEnrollment?.front), left: Boolean(state.faceEnrollment?.left), right: Boolean(state.faceEnrollment?.right) } };
  const labels = { firstName: 'First Name', lastName: 'Last Name', employeeId: 'Employee ID', email: 'Email', designation: 'Designation', department: 'Department', location: 'Location', vehicleNumber: 'Vehicle Number' };
  const optional = ['employeeId', 'email', 'location', 'vehicleNumber'].includes(step);
  return { type: 'form_step', workflow: 'register_new_user', step, currentStep: step, field: step, label: labels[step] || step, inputType: step === 'email' ? 'email' : 'text', required: !optional, allowSkip: optional, values: { ...(state.values || {}) }, faceEnrollment: { front: Boolean(state.faceEnrollment?.front), left: Boolean(state.faceEnrollment?.left), right: Boolean(state.faceEnrollment?.right) } };
}

function loadActiveId() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

export function useConversations() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(loadActiveId);
  const [messages, setMessages] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef(null);
  const controllersRef = useRef(new Set());
  const workflowRevisionRef = useRef(0);
  const activeIdRef = useRef(activeId);
  const selectedRequestRef = useRef(0);
  const attachmentUrlsRef = useRef(new Set());

  const hydrateMessages = useCallback(async (nextMessages, conversationId, signal, { reset = true } = {}) => {
    if (reset) {
      attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      attachmentUrlsRef.current.clear();
    }
    const hydrated = await Promise.all((nextMessages || []).map(async (message) => {
      const attachments = await Promise.all((message.attachments || []).map(async (attachment) => {
        if (!attachment?.attachmentId || attachment.url) return attachment;
        try {
          const url = await fetchAssistantAttachment(conversationId, attachment.attachmentId, { signal });
          attachmentUrlsRef.current.add(url);
          return { ...attachment, url };
        } catch {
          return attachment;
        }
      }));
      return attachments.length ? { ...message, attachments } : message;
    }));
    return hydrated;
  }, []);

  const loadHistoryPage = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const result = await listAssistantConversations({ page, limit: PAGE_SIZE, search: historySearch });
      setConversations(result?.conversations || []);
      setHistoryPagination(result?.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch {
      setConversations([]);
      setHistoryPagination({ page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } finally {
      setHistoryLoading(false);
    }
  }, [historySearch]);

  useEffect(() => {
    const timer = setTimeout(() => loadHistoryPage(historyPage), 250);
    return () => clearTimeout(timer);
  }, [historyPage, loadHistoryPage]);

  const changeHistorySearch = useCallback((value) => {
    setHistorySearch(value);
    setHistoryPage(1);
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // Storage availability must not stop the assistant from working.
    }
  }, [activeId]);

  const selectChat = useCallback(async (id) => {
    if (!id) return;
    // Let a response for the previous chat finish in the background. Its
    // completion refreshes history but cannot replace this chat's messages.
    abortRef.current = null;
    setSending(false);
    const requestId = ++selectedRequestRef.current;
    activeIdRef.current = id;
    setActiveId(id);
    setThreadLoading(true);
    try {
      const conversation = await getAssistantConversation(id);
      const hydrated = await hydrateMessages(conversation?.messages || [], id);
      if (requestId === selectedRequestRef.current) setMessages(hydrated);
    } catch {
      if (requestId === selectedRequestRef.current) {
        setActiveId(null);
        setMessages([]);
      }
    } finally {
      if (requestId === selectedRequestRef.current) setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) selectChat(activeId);
    // Restore the last open server-side chat once when the page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
      attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      attachmentUrlsRef.current.clear();
    },
    []
  );

  const newChat = useCallback(() => {
    ++selectedRequestRef.current;
    // Starting another chat must not discard an answer already being
    // generated for the previous conversation.
    abortRef.current = null;
    setSending(false);
    setThreadLoading(false);
    activeIdRef.current = null;
    setActiveId(null);
    setMessages([]);
  }, []);

  const deleteChat = useCallback(
    async (id) => {
      await deleteAssistantConversation(id);
      if (activeId === id) {
        abortRef.current?.abort();
        abortRef.current = null;
        setSending(false);
        ++selectedRequestRef.current;
        activeIdRef.current = null;
        setActiveId(null);
        setMessages([]);
      }

      const nextPage = conversations.length === 1 && historyPage > 1 ? historyPage - 1 : historyPage;
      if (nextPage !== historyPage) setHistoryPage(nextPage);
      else await loadHistoryPage(nextPage);
    },
    [activeId, conversations.length, historyPage, loadHistoryPage]
  );

  const renameChat = useCallback(async (id, title) => {
    const renamed = await renameAssistantConversation(id, title);
    setConversations((current) =>
      current.map((conversation) => (conversation.id === id ? { ...conversation, ...renamed } : conversation))
    );
    return renamed;
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  }, []);

  // Some UI-only actions, such as exports, are fulfilled by the frontend and
  // do not need a round trip through the assistant/MCP query planner.
  const addLocalTurn = useCallback((text, assistantText, ui) => {
    setMessages((current) => [
      ...current,
      { id: uid(), role: 'user', text: String(text || ''), at: new Date().toISOString() },
      { id: uid(), role: 'assistant', text: String(assistantText || ''), at: new Date().toISOString(), ...(ui ? { ui } : {}) },
    ]);
  }, []);

  const send = useCallback(
    async (raw, { attachments = [], action, workflow, step, incidentContext, attachmentCount = attachments.length } = {}) => {
      const text = String(raw || '').trim();
      if (!text || sending) return;
      if (/^(?:cancel|stop|close|exit)(?:\s+(?:user\s+)?registration)?$/i.test(text)) workflowRevisionRef.current += 1;
      const freshWorkflow = startsFreshWorkflow(text);

      const optimisticMessage = {
        id: uid(),
        role: 'user',
        text,
        at: new Date().toISOString(),
        ...(attachments.length ? { attachments } : {}),
      };
      setMessages((current) => [...current, optimisticMessage]);
      setSending(true);

      const controller = new AbortController();
      // A new workflow gets a clean conversation so old messages and field
      // values cannot affect registration/report collection.
      const sourceConversationId = freshWorkflow ? null : activeId;
      const sourceViewRequest = selectedRequestRef.current;
      controllersRef.current.add(controller);
      abortRef.current = controller;
      try {
        const result = await askAssistant({
          message: text,
          conversationId: sourceConversationId,
          resetWorkflow: freshWorkflow,
          action,
          incidentContext,
          workflow,
          step,
          attachments,
          attachmentCount,
          signal: controller.signal,
        });
        const exportUis = result?.ui?.type === 'multi_export'
          ? result.ui.exports
          : result?.ui?.type === 'export' ? [result.ui] : [];
        if (exportUis.length) {
          import('@/page/user/Assistant/assistantLogExport').then(async ({ runAssistantLogExport }) => {
            // Run downloads serially. A burst of programmatic downloads can
            // be collapsed to the first file by the browser download guard.
            for (const exportUi of exportUis) {
              const formats = Array.isArray(exportUi.formats) && exportUi.formats.length
                ? exportUi.formats
                : [exportUi.format];
              for (const format of formats.filter(Boolean)) {
                // Use the same page-level exporters as the manual log pages
                // and the export buttons rendered in the chatbot result card.
                // This keeps filtering, filenames, and report layouts aligned.
                await runAssistantLogExport(exportUi, format);
                await new Promise((resolve) => setTimeout(resolve, 350));
              }
            }
          }).catch(() => undefined);
        }
        const persistedId = result?.conversation?.id;
        const stillViewingSource = sourceViewRequest === selectedRequestRef.current;
        if (stillViewingSource) {
          if (persistedId) {
            activeIdRef.current = persistedId;
            setActiveId(persistedId);
          }

          const userMessage = {
            ...(result?.userMessage || optimisticMessage),
            // Keep the durable server attachment references when available.
            // The selected File objects are only a temporary optimistic
            // fallback and must not replace the paths returned by the API.
            ...(attachments.length && !result?.userMessage?.attachments?.length ? { attachments } : {}),
          };
          const assistantMessage =
            result?.assistantMessage || {
              id: uid(),
              role: 'assistant',
              text: result?.text || '',
              at: new Date().toISOString(),
              ...(result?.ui ? { ui: result.ui } : {}),
            };
          const messageWithUi = assistantMessage.ui || !result?.ui
            ? assistantMessage
            : { ...assistantMessage, ui: result.ui };
          // Mark only the live response as an automatic export. Persisted
          // messages loaded later must not start downloads again.
          const liveMessageWithUi = messageWithUi;
          const responseState = result?.workflowState;
          const responseUi = registrationUiFromState(responseState);
          const matchingUi = liveMessageWithUi.ui?.workflow === 'register_new_user' && liveMessageWithUi.ui?.currentStep === responseState?.currentStep;
          const normalizedAssistantMessage = responseUi && responseState?.workflow === 'register_new_user' && !['success', 'error'].includes(liveMessageWithUi.ui?.type) && !matchingUi
            ? { ...liveMessageWithUi, ui: responseUi }
            : liveMessageWithUi;
          const hydratedUserMessage = persistedId
            ? (await hydrateMessages([userMessage], persistedId, undefined, { reset: false }))[0]
            : userMessage;
          setMessages((current) => freshWorkflow
            ? [hydratedUserMessage, normalizedAssistantMessage]
            : [...current.filter((message) => message.id !== optimisticMessage.id), hydratedUserMessage, normalizedAssistantMessage]);
        } else if (persistedId && activeIdRef.current === persistedId) {
          const conversation = await getAssistantConversation(persistedId);
          setMessages(await hydrateMessages(conversation?.messages || [], persistedId));
        }

        if (historyPage !== 1) setHistoryPage(1);
        else await loadHistoryPage(1);
        return result;
      } catch (error) {
        const aborted =
          error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED';
        if (!aborted) {
          const persistedId = error?.response?.data?.body?.data?.conversationId || sourceConversationId;
          const stillViewingSource = sourceViewRequest === selectedRequestRef.current;
          if (persistedId) {
            try {
              const conversation = await getAssistantConversation(persistedId);
              const recoveredMessages = await hydrateMessages(conversation?.messages || [], persistedId);
              if (stillViewingSource || activeIdRef.current === persistedId) {
                activeIdRef.current = persistedId;
                setActiveId(persistedId);
                // A storage/provider failure can return a conversation shell
                // before the just-submitted turn is visible in the read path.
                // Never replace a non-empty optimistic thread with that empty
                // shell; the error message below keeps the user in context.
                setMessages((current) => recoveredMessages.length ? recoveredMessages : current);
              }
            } catch {
              if (stillViewingSource) {
                setMessages((current) => [
                  ...current,
                  {
                    id: uid(),
                    role: 'assistant',
                    error: true,
                    at: new Date().toISOString(),
                    text: error?.response?.data?.body?.message || error?.message || "Couldn't reach the assistant.",
                  },
                ]);
              }
            }
          } else if (stillViewingSource) {
            setMessages((current) => [
              ...current,
              {
                id: uid(),
                role: 'assistant',
                error: true,
                at: new Date().toISOString(),
                text: error?.response?.data?.body?.message || error?.message || "Couldn't reach the assistant.",
              },
            ]);
          }
          if (historyPage !== 1) setHistoryPage(1);
          else await loadHistoryPage(1);
        }
      } finally {
        controllersRef.current.delete(controller);
        if (abortRef.current === controller) abortRef.current = null;
        if (sourceViewRequest === selectedRequestRef.current) setSending(false);
      }
    },
    [activeId, historyPage, hydrateMessages, loadHistoryPage, sending]
  );

  const uploadRegisterFace = useCallback(async ({ angle, file }) => {
    if (!activeId || !file || sending || uploading) return;
    const { uploadRegisterUserFace } = await import('@/helpers/assistant');
    const revision = workflowRevisionRef.current;
    setUploading(true);
    try {
      const result = await uploadRegisterUserFace({ conversationId: activeId, angle, file });
      if (revision !== workflowRevisionRef.current) return null;
      if (result?.assistantMessage || result?.userMessage) setMessages((current) => {
        const next = result.userMessage
          ? current.map((message, index, all) => index === all.findLastIndex((item) => item.role === 'user') ? result.userMessage : message)
          : current;
        const last = current.at(-1);
        const sameStep = Boolean(result.assistantMessage) && last?.role === 'assistant' && last.ui?.workflow === 'register_new_user' && last.ui?.currentStep === result.assistantMessage.ui?.currentStep;
        return result.assistantMessage
          ? (sameStep ? [...next.slice(0, -1), result.assistantMessage] : [...next, result.assistantMessage])
          : next;
      });
      if (result?.userMessage && activeId) {
        const hydratedUserMessage = await hydrateMessages([result.userMessage], activeId, undefined, { reset: false });
        setMessages((current) => current.map((message, index, all) => index === all.findLastIndex((item) => item.role === 'user') ? hydratedUserMessage[0] : message));
      }
      if (historyPage !== 1) setHistoryPage(1);
      else await loadHistoryPage(1);
      return result;
    } catch (error) {
      setMessages((current) => [...current, {
        id: uid(),
        role: 'assistant',
        error: true,
        at: new Date().toISOString(),
        text: error?.response?.data?.body?.message || error?.message || 'The image upload failed. Please try again.',
      }]);
      return null;
    } finally {
      setUploading(false);
    }
  }, [activeId, historyPage, hydrateMessages, loadHistoryPage, sending, uploading]);

  const uploadRegisterFaces = useCallback(async ({ files, conversationId: requestedConversationId }) => {
    const targetConversationId = requestedConversationId || activeId;
    if (!targetConversationId || !files?.length || uploading) return;
    const { uploadRegisterUserFaces } = await import('@/helpers/assistant');
    const revision = workflowRevisionRef.current;
    setUploading(true);
    try {
      const result = await uploadRegisterUserFaces({ conversationId: targetConversationId, files });
      if (revision !== workflowRevisionRef.current) return null;
      if (result?.assistantMessage || result?.userMessage) setMessages((current) => {
        const next = result.userMessage
          ? current.map((message, index, all) => index === all.findLastIndex((item) => item.role === 'user') ? result.userMessage : message)
          : current;
        const last = current.at(-1);
        const sameStep = Boolean(result.assistantMessage) && last?.role === 'assistant' && last.ui?.workflow === 'register_new_user' && last.ui?.currentStep === result.assistantMessage.ui?.currentStep;
        return result.assistantMessage
          ? (sameStep ? [...next.slice(0, -1), result.assistantMessage] : [...next, result.assistantMessage])
          : next;
      });
      if (result?.userMessage) {
        const hydratedUserMessage = await hydrateMessages([result.userMessage], targetConversationId, undefined, { reset: false });
        setMessages((current) => current.map((message, index, all) => index === all.findLastIndex((item) => item.role === 'user') ? hydratedUserMessage[0] : message));
      }
      if (historyPage !== 1) setHistoryPage(1);
      else await loadHistoryPage(1);
      return result;
    } catch (error) {
      setMessages((current) => [...current, { id: uid(), role: 'assistant', error: true, at: new Date().toISOString(), text: error?.response?.data?.body?.message || error?.message || 'The face images upload failed. Please select Front, Left, and Right images.' }]);
      return null;
    } finally {
      setUploading(false);
    }
  }, [activeId, historyPage, hydrateMessages, loadHistoryPage, sending, uploading]);

  const changeHistoryPage = useCallback((page) => {
    setHistoryPage((current) => Math.max(1, Number(page) || current));
  }, []);

  const active = conversations.find((conversation) => conversation.id === activeId) || null;

  return {
    conversations,
    activeId,
    active,
    messages,
    sending,
    uploading,
    historyLoading,
    threadLoading,
    historyPage,
    historyPagination,
    changeHistoryPage,
    historySearch,
    changeHistorySearch,
    newChat,
    selectChat,
    deleteChat,
    renameChat,
    send,
    uploadRegisterFace,
    uploadRegisterFaces,
    stop,
    addLocalTurn,
  };
}

export default useConversations;
