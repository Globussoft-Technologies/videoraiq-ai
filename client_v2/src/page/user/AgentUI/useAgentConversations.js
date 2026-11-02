import { useCallback, useEffect, useRef, useState } from 'react';
import { agentApi } from './agentApi';

const ACTIVE_KEY = 'vq_detection_agent_active_id';
const running = (status) => status === 'queued' || status === 'running';
const timestamp = (value) => value == null ? new Date().toISOString()
  : typeof value === 'number' ? new Date(value * 1000).toISOString() : value;
const requestId = () => crypto.randomUUID().replace(/-/g, '');

function publicError(error) {
  const code = error?.response?.data?.errorCode;
  const status = error?.response?.status;
  if (code === 'RUN_PENDING') return 'Please wait for the current answer, or press Stop.';
  if (code === 'AGENT_NOT_ENABLED_FOR_USER' || status === 403) return "The assistant isn't enabled for your account.";
  if (code === 'AGENT_DISABLED' || status === 503) return 'The assistant is not enabled.';
  if (code === 'RATE_LIMITED') return error.response.data.message || 'Please try again later.';
  if (status === 401) return 'Your session expired. Please log in again.';
  if (status === 404) return 'This conversation no longer exists.';
  if (code === 'INVALID_MESSAGE' || code === 'INVALID_REQUEST') return "That message couldn't be sent.";
  return 'The assistant is temporarily unavailable. Please try again.';
}

function runMessages(run) {
  const id = run.id || run.run_id;
  const at = timestamp(run.created_at || run.createdAt);
  const report = run.result?.report;
  const answer = report?.answer || run.result?.message || '';
  const notes = [...(report?.warnings || []), ...(report?.clarification ? [report.clarification] : [])];
  const statusText = {
    approval_required: 'Waiting for your approval. Nothing has changed yet.',
    verification_pending: 'Applied. Not verified yet: check the camera in the dashboard.',
    recoverable: 'Something went wrong temporarily.',
    failed: 'Could not complete this request.',
    cancelled: 'Stopped.',
  }[run.status];
  const outcome = run.result?.action_result?.display_status || run.result?.action_result?.status;
  const outcomeText = {
    completed: 'Applied and verified.', verification_pending: 'Applied. Not verified yet: check the camera in the dashboard.',
    partially_failed: 'Partly applied: check each camera.', failed: 'Not applied.',
    cancelled: 'Cancelled: nothing changed.', expired: 'Expired before approval: nothing changed.',
  }[outcome];
  const footer = [report?.time_window, report?.timezone, report?.coverage && `Coverage: ${report.coverage}`].filter(Boolean).join(' · ');
  const text = [answer, ...notes, outcomeText, statusText, footer].filter(Boolean).join('\n\n');
  return [
    { id: `${id}-user`, role: 'user', text: run.message || '', at },
    ...(text ? [{ id: `${id}-agent`, role: 'assistant', text, at, error: run.status === 'failed' }] : []),
  ];
}

const toMessages = (conversation) => (conversation?.runs || []).flatMap(runMessages);
const toConversation = (item) => ({
  id: item.id || item.conversation_id,
  title: item.runs?.[0]?.message?.slice(0, 50) || item.first_message?.slice?.(0, 50) || 'New chat',
  preview: item.runs?.at(-1)?.message || '',
  createdAt: timestamp(item.created_at || item.createdAt),
  updatedAt: timestamp(item.updated_at || item.updatedAt || item.created_at),
  lastActivityAt: timestamp(item.updated_at || item.updatedAt || item.created_at),
});

export function useAgentConversations() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(() => { try { return sessionStorage.getItem(ACTIVE_KEY); } catch { return null; } });
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const selected = useRef(activeId);
  const pending = useRef(false);
  const watch = useRef(0);
  const sendingRef = useRef(false);

  const refreshList = useCallback(async () => {
    const result = await agentApi.list();
    const items = await Promise.all((result.items || []).map(async (item) => {
      if (item.runs?.length || item.first_message) return toConversation(item);
      try { return toConversation({ ...item, runs: (await agentApi.get(item.id || item.conversation_id)).runs }); }
      catch { return toConversation(item); }
    }));
    setConversations(items);
    return items;
  }, []);

  const selectChat = useCallback(async (id) => {
    selected.current = id;
    const revision = ++watch.current;
    setActiveId(id);
    setThreadLoading(true);
    setThreadError('');
    try {
      const detail = await agentApi.get(id);
      if (selected.current !== id || watch.current !== revision) return;
      setMessages(toMessages(detail));
      const latest = detail.runs?.at(-1);
      pending.current = running(latest?.status);
      setSending(pending.current);
      if (pending.current) follow(latest.id || latest.run_id, id, revision);
    } catch (error) {
      if (selected.current === id && watch.current === revision) setThreadError(publicError(error));
    } finally { if (selected.current === id && watch.current === revision) setThreadLoading(false); }
  }, []);

  async function follow(runId, conversationId, revision) {
    let cursor = 0;
    while (selected.current === conversationId && watch.current === revision) {
      try {
        const text = await agentApi.events(runId, cursor);
        for (const block of String(text || '').replace(/\r\n/g, '\n').split('\n\n')) {
          const match = block.match(/^id:\s*(\d+)/m);
          if (match) cursor = Math.max(cursor, Number(match[1]));
        }
      } catch { /* The run read below remains authoritative. */ }
      try {
        const run = await agentApi.run(runId);
        if (selected.current !== conversationId || watch.current !== revision) return;
        const detail = await agentApi.get(conversationId);
        if (selected.current !== conversationId || watch.current !== revision) return;
        setMessages(toMessages(detail));
        if (!running(run.status)) {
          pending.current = false;
          setSending(false);
          refreshList().catch(() => {});
          return;
        }
      } catch (error) {
        if (selected.current === conversationId && watch.current === revision) setThreadError(publicError(error));
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  useEffect(() => {
    let mounted = true;
    refreshList().then((items) => {
      if (!mounted) return;
      const id = selected.current && items.some((item) => item.id === selected.current) ? selected.current : items[0]?.id;
      if (id) selectChat(id);
    }).catch((error) => { if (mounted) setHistoryError(publicError(error)); })
      .finally(() => { if (mounted) setHistoryLoading(false); });
    return () => { mounted = false; ++watch.current; };
  }, [refreshList, selectChat]);

  useEffect(() => { try { if (activeId) sessionStorage.setItem(ACTIVE_KEY, activeId); else sessionStorage.removeItem(ACTIVE_KEY); } catch { /* Optional tab preference. */ } }, [activeId]);

  const newChat = useCallback(async () => {
    const result = await agentApi.create();
    const id = result.conversation_id;
    await refreshList();
    selected.current = id;
    ++watch.current;
    pending.current = false;
    setActiveId(id);
    setMessages([]);
    if (!sendingRef.current) setSending(false);
    setThreadError('');
    return id;
  }, [refreshList]);

  const deleteChat = useCallback(async (id) => {
    await agentApi.remove(id);
    const items = await refreshList();
    if (selected.current === id) {
      selected.current = null;
      ++watch.current;
      setActiveId(null);
      setMessages([]);
      setSending(false);
      if (items[0]) selectChat(items[0].id);
    }
  }, [refreshList, selectChat]);

  const renameChat = useCallback(async () => { throw new Error('Renaming agent conversations is not supported by the API.'); }, []);

  const send = useCallback(async (raw, { attachments = [] } = {}) => {
    const message = String(raw || '').trim();
    if (!message || sendingRef.current || pending.current) return false;
    if (attachments.length) throw new Error('The agent chat API does not support attachments.');
    if (message.length > 16000) throw new Error('Messages must be 16,000 characters or fewer.');
    sendingRef.current = true;
    setSending(true);
    let id = selected.current;
    const key = requestId();
    try {
      if (!id) id = await newChat();
      setSending(true);
      setMessages((current) => [...current, { id: `${key}-user`, role: 'user', text: message, at: new Date().toISOString() }]);
      let accepted;
      try { accepted = await agentApi.send(id, message, key); }
      catch (error) {
        if (error.response) throw error;
        accepted = await agentApi.send(id, message, key);
      }
      pending.current = true;
      const revision = ++watch.current;
      follow(accepted.run_id, id, revision);
      return accepted;
    } catch (error) {
      setThreadError(publicError(error));
      throw new Error(publicError(error));
    } finally {
      sendingRef.current = false;
      if (!pending.current) setSending(false);
    }
  }, [newChat]);

  return { conversations, activeId, messages, sending, historyLoading, historyError, threadLoading, threadError,
    newChat, selectChat, deleteChat, renameChat, send };
}
