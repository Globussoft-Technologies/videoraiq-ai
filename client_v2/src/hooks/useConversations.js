import { useCallback, useEffect, useRef, useState } from 'react';
import {
  askAssistant,
  deleteAssistantConversation,
  getAssistantConversation,
  listAssistantConversations,
  renameAssistantConversation,
} from '@/helpers/assistant';

const ACTIVE_KEY = 'vq_assistant_active_id';
const PAGE_SIZE = 10;

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;

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
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const abortRef = useRef(null);
  const controllersRef = useRef(new Set());
  const activeIdRef = useRef(activeId);
  const selectedRequestRef = useRef(0);

  const loadHistoryPage = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const result = await listAssistantConversations({ page, limit: PAGE_SIZE });
      setConversations(result?.conversations || []);
      setHistoryPagination(result?.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch {
      setConversations([]);
      setHistoryPagination({ page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistoryPage(historyPage);
  }, [historyPage, loadHistoryPage]);

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
      if (requestId === selectedRequestRef.current) setMessages(conversation?.messages || []);
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

  const send = useCallback(
    async (raw) => {
      const text = String(raw || '').trim();
      if (!text || sending) return;

      const optimisticMessage = {
        id: uid(),
        role: 'user',
        text,
        at: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimisticMessage]);
      setSending(true);

      const controller = new AbortController();
      const sourceConversationId = activeId;
      const sourceViewRequest = selectedRequestRef.current;
      controllersRef.current.add(controller);
      abortRef.current = controller;
      try {
        const result = await askAssistant({
          message: text,
          conversationId: sourceConversationId,
          signal: controller.signal,
        });
        const persistedId = result?.conversation?.id;
        const stillViewingSource = sourceViewRequest === selectedRequestRef.current;
        if (stillViewingSource) {
          if (persistedId) {
            activeIdRef.current = persistedId;
            setActiveId(persistedId);
          }

          const userMessage = result?.userMessage || optimisticMessage;
          const assistantMessage =
            result?.assistantMessage || { id: uid(), role: 'assistant', text: result?.text || '', at: new Date().toISOString() };
          setMessages((current) => [
            ...current.filter((message) => message.id !== optimisticMessage.id),
            userMessage,
            assistantMessage,
          ]);
        } else if (persistedId && activeIdRef.current === persistedId) {
          const conversation = await getAssistantConversation(persistedId);
          setMessages(conversation?.messages || []);
        }

        if (historyPage !== 1) setHistoryPage(1);
        else await loadHistoryPage(1);
      } catch (error) {
        const aborted =
          error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED';
        if (!aborted) {
          const persistedId = error?.response?.data?.body?.data?.conversationId || sourceConversationId;
          const stillViewingSource = sourceViewRequest === selectedRequestRef.current;
          if (persistedId) {
            try {
              const conversation = await getAssistantConversation(persistedId);
              if (stillViewingSource || activeIdRef.current === persistedId) {
                activeIdRef.current = persistedId;
                setActiveId(persistedId);
                setMessages(conversation?.messages || []);
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
    [activeId, historyPage, loadHistoryPage, sending]
  );

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
    historyLoading,
    threadLoading,
    historyPage,
    historyPagination,
    changeHistoryPage,
    newChat,
    selectChat,
    deleteChat,
    renameChat,
    send,
    stop,
  };
}

export default useConversations;
