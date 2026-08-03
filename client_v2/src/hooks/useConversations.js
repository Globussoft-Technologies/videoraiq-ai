import { useCallback, useEffect, useRef, useState } from 'react';
import { askAssistant } from '@/helpers/assistant';

/**
 * Conversation state for the AI Assistant page.
 *
 * Threads live in localStorage rather than on the server: there is no
 * assistant API yet, so persisting client-side is what makes "Chat history"
 * survive a reload today. When the backend lands, swap the load/save pair for
 * fetches — the rest of the hook's surface (newChat/selectChat/send) doesn't
 * change.
 */
const STORE_KEY = 'vq_assistant_conversations';
const ACTIVE_KEY = 'vq_assistant_active_id';
/** Keeps one runaway paste from bloating localStorage; the rail ellipsises anyway. */
const MAX_TITLE_CHARS = 90;

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function loadConversations() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function loadActiveId() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

export function useConversations() {
  const [conversations, setConversations] = useState(loadConversations);
  const [activeId, setActiveId] = useState(loadActiveId);
  const [sending, setSending] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(conversations));
    } catch {
      /* ignore quota / private-mode failures */
    }
  }, [conversations]);

  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  }, [activeId]);

  // Abort an in-flight request if the page unmounts mid-answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  const active = conversations.find((c) => c.id === activeId) || null;
  const messages = active?.messages || [];

  /**
   * "New chat" only clears the active selection — no empty thread is written.
   * A conversation is created on the first actual send, so the history rail
   * never accumulates untitled 0-message rows.
   */
  const newChat = useCallback(() => setActiveId(null), []);

  const selectChat = useCallback((id) => setActiveId(id), []);

  const deleteChat = useCallback((id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
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

      const now = new Date().toISOString();
      const userMsg = { id: uid(), role: 'user', text, at: now };

      // Resolve the target thread from the current render's state (not inside a
      // setState updater) so the updaters stay pure — StrictMode invokes them
      // twice in dev and any side effect in there would double-fire.
      const existing = conversations.find((c) => c.id === activeId) || null;
      const targetId = existing?.id || uid();
      const history = existing ? existing.messages.map(({ role, text: t }) => ({ role, text: t })) : [];

      if (existing) {
        setConversations((prev) =>
          prev.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, userMsg], updatedAt: now } : c))
        );
      } else {
        setConversations((prev) => [
          { id: targetId, title: text.slice(0, MAX_TITLE_CHARS), messages: [userMsg], createdAt: now, updatedAt: now },
          ...prev,
        ]);
        setActiveId(targetId);
      }

      setSending(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const { text: reply } = await askAssistant({ message: text, history, signal: controller.signal });
        const at = new Date().toISOString();
        const botMsg = { id: uid(), role: 'assistant', text: reply, at };
        setConversations((prev) =>
          prev.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, botMsg], updatedAt: at } : c))
        );
      } catch (err) {
        // A user-triggered stop is not a failure — don't leave an error bubble.
        const aborted = err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';
        if (!aborted) {
          const at = new Date().toISOString();
          const errMsg = {
            id: uid(),
            role: 'assistant',
            error: true,
            at,
            text:
              err?.response?.data?.body?.message ||
              err?.message ||
              "Couldn't reach the assistant. Please try again.",
          };
          setConversations((prev) =>
            prev.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, errMsg], updatedAt: at } : c))
          );
        }
      } finally {
        abortRef.current = null;
        setSending(false);
      }
    },
    [activeId, conversations, sending]
  );

  return { conversations, activeId, active, messages, sending, newChat, selectChat, deleteChat, send, stop };
}

export default useConversations;
