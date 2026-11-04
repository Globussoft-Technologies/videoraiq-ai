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
  if (code === 'AGENT_PROXY_KEY_REQUIRED') return 'VideoraAI service authentication needs to be configured. Contact your administrator.';
  if (code === 'AGENT_PROXY_KEY_REJECTED') return 'VideoraAI service gateway rejected its key. Contact your administrator.';
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
  const statusText = {
    verification_pending: 'Applied. Not confirmed yet: check the camera in the dashboard.',
    recoverable: 'Something went wrong; nothing more will happen without a new request.',
    failed: 'Could not complete this request.',
    cancelled: 'Cancelled. Nothing was changed.',
  }[run.status];
  const actionResult = run.result?.action_result;
  const results = actionResult?.normalized_target_results || actionResult?.targets || [];
  const failures = results.filter((target) => target.status === 'failed' || target.result?.status === 'failed')
    .map((target) => [target.label || target.cameraName || target.channelId, target.message || target.result?.message || target.errorCode || target.result?.errorCode].filter(Boolean).join(': '));
  const text = [answer, statusText, ...failures].filter(Boolean).join('\n\n');
  return [
    { id: `${id}-user`, role: 'user', text: run.message || '', at },
    ...(text ? [{ id: `${id}-agent`, role: 'assistant', text, at, error: run.status === 'failed', recoverableRunId: run.status === 'recoverable' ? id : null }] : []),
  ];
}

const toMessages = (conversation) => (conversation?.runs || []).flatMap(runMessages);
const toConversation = (item) => ({
  id: item.id || item.conversation_id,
  title: item.runs?.[0]?.message?.slice(0, 50) || item.first_message?.slice?.(0, 50) || 'New chat',
  preview: item.runs?.at(-1)?.message || '',
  messageCount: Array.isArray(item.runs) ? toMessages(item).length : item.messageCount ?? null,
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
  const [threadLoading, setThreadLoading] = useState(() => Boolean(activeId));
  const [threadError, setThreadError] = useState('');
  const [approval, setApproval] = useState(null);
  const [hasPendingApproval, setHasPendingApproval] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const selected = useRef(activeId);
  const watch = useRef(0);
  const pendingRuns = useRef(new Map());
  const sendingChats = useRef(new Set());
  const messageCache = useRef(new Map());
  const mountedRef = useRef(true);
  const detailCache = useRef(new Map());
  const listRevision = useRef(0);
  const approvals = useRef(new Map());
  const dismissed = useRef(new Set());

  const syncApproval = (conversationId, run, timezone) => {
    const prepared = run?.status === 'approval_required' ? (run.actions || []).filter((action) => action.status === 'prepared') : [];
    if (prepared.length) approvals.current.set(conversationId, { runId: run.id || run.run_id, proposals: prepared, timezone });
    else approvals.current.delete(conversationId);
    if (selected.current === conversationId && mountedRef.current) {
      const next = approvals.current.get(conversationId);
      setHasPendingApproval(Boolean(next));
      setApproval(next && next.proposals.find((proposal) => !dismissed.current.has(proposal.actionId)) ? next : null);
    }
  };

  const showMessages = (id, next) => {
    messageCache.current.set(id, next);
    if (selected.current === id && mountedRef.current) setMessages(next);
  };

  const showSending = (id) => {
    if (selected.current === id && mountedRef.current) setSending(sendingChats.current.has(id) || pendingRuns.current.has(id));
  };

  const refreshList = useCallback(async () => {
    const revision = ++listRevision.current;
    const result = await agentApi.list();
    const items = (result.items || []).map((item) => {
      const id = item.id || item.conversation_id;
      const detail = detailCache.current.get(id);
      return toConversation({ ...item, runs: detail?.runs || item.runs });
    });
    if (revision !== listRevision.current) return items;
    setConversations((current) => {
      const listed = new Set(items.map((item) => item.id));
      const local = current.filter((item) => !listed.has(item.id) && (sendingChats.current.has(item.id) || pendingRuns.current.has(item.id)));
      return [...local, ...items.map((item) => {
        const prior = current.find((entry) => entry.id === item.id);
        return prior && (sendingChats.current.has(item.id) || pendingRuns.current.has(item.id))
          ? { ...item, title: item.title === 'New chat' ? prior.title : item.title, messageCount: Math.max(item.messageCount || 0, prior.messageCount || 0) }
          : item;
      })];
    });
    const missing = (result.items || []).filter((item) => {
      const id = item.id || item.conversation_id;
      return id !== selected.current && !detailCache.current.has(id) && !Array.isArray(item.runs);
    });
    void (async () => {
      for (let offset = 0; offset < missing.length && revision === listRevision.current; offset += 5) {
        const batch = await Promise.all(missing.slice(offset, offset + 5).map(async (item) => {
          const id = item.id || item.conversation_id;
          try {
            const detail = await agentApi.get(id);
            detailCache.current.set(id, detail);
            return toConversation({ ...item, runs: detail.runs });
          } catch { return null; }
        }));
        if (revision !== listRevision.current) return;
        const updates = new Map(batch.filter(Boolean).map((item) => [item.id, item]));
        if (updates.size) setConversations((current) => current.map((item) => {
          const update = updates.get(item.id);
          const original = items.find((entry) => entry.id === item.id);
          return update && item.updatedAt === original?.updatedAt ? { ...item, ...update } : item;
        }));
      }
    })();
    return items;
  }, []);

  const selectChat = useCallback(async (id) => {
    if (!id) return;
    selected.current = id;
    const revision = ++watch.current;
    setActiveId(id);
    const cached = detailCache.current.get(id);
    setThreadLoading(!cached);
    setMessages(messageCache.current.get(id) || (cached ? toMessages(cached) : []));
    setSending(sendingChats.current.has(id) || pendingRuns.current.has(id));
    setThreadError('');
    setDecisionError('');
    const known = approvals.current.get(id);
    known?.proposals.forEach((proposal) => dismissed.current.delete(proposal.actionId));
    setHasPendingApproval(Boolean(known));
    setApproval(known && known.proposals.some((proposal) => !dismissed.current.has(proposal.actionId)) ? known : null);
    try {
      const detail = await agentApi.get(id);
      if (selected.current !== id || watch.current !== revision) return;
      detailCache.current.set(id, detail);
      if (!sendingChats.current.has(id) && !pendingRuns.current.has(id)) showMessages(id, toMessages(detail));
      setConversations((current) => current.map((item) => item.id === id ? { ...item, title: item.title === 'New chat' ? toConversation(detail).title : item.title, messageCount: toMessages(detail).length } : item));
      const latest = detail.runs?.at(-1);
      if (latest?.status === 'approval_required') {
        const fresh = await agentApi.run(latest.id || latest.run_id);
        if (selected.current !== id || watch.current !== revision) return;
        (fresh.actions || []).forEach((proposal) => dismissed.current.delete(proposal.actionId));
        syncApproval(id, fresh, detail.timezone);
      } else if (latest) syncApproval(id, latest, detail.timezone);
      if (running(latest?.status)) follow(latest.id || latest.run_id, id);
      else showSending(id);
    } catch (error) {
      if (selected.current === id && watch.current === revision) setThreadError(publicError(error));
    } finally { if (selected.current === id && watch.current === revision) setThreadLoading(false); }
  }, []);

  async function follow(runId, conversationId) {
    if (pendingRuns.current.has(conversationId)) return;
    pendingRuns.current.set(conversationId, runId);
    showSending(conversationId);
    while (mountedRef.current && pendingRuns.current.get(conversationId) === runId) {
      try {
        const run = await agentApi.run(runId);
        if (!mountedRef.current || pendingRuns.current.get(conversationId) !== runId) return;
        if (run.status === 'approval_required') {
          syncApproval(conversationId, run, detailCache.current.get(conversationId)?.timezone);
          pendingRuns.current.delete(conversationId);
          showSending(conversationId);
          agentApi.get(conversationId).then((detail) => {
            if (!mountedRef.current) return;
            detailCache.current.set(conversationId, detail);
            showMessages(conversationId, toMessages(detail));
            syncApproval(conversationId, run, detail.timezone);
          }).catch(() => {});
          return;
        }
        if (!running(run.status)) {
          const detail = await agentApi.get(conversationId);
          if (!mountedRef.current || pendingRuns.current.get(conversationId) !== runId) return;
          detailCache.current.set(conversationId, detail);
          const next = toMessages(detail);
          showMessages(conversationId, next);
          syncApproval(conversationId, run, detail.timezone);
          setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messageCount: next.length } : item));
          pendingRuns.current.delete(conversationId);
          showSending(conversationId);
          refreshList().catch(() => {});
          return;
        }
      } catch (error) {
        if (selected.current === conversationId) setThreadError(publicError(error));
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    if (selected.current) selectChat(selected.current);
    const loadingRevision = watch.current;
    refreshList().then((items) => {
      if (!mounted || watch.current !== loadingRevision) return;
      if (selected.current && !items.some((item) => item.id === selected.current)) {
        selected.current = null;
        setActiveId(null);
        setMessages([]);
      }
      if (!selected.current && items[0]) selectChat(items[0].id);
    }).catch((error) => { if (mounted) setHistoryError(publicError(error)); })
      .finally(() => { if (mounted) setHistoryLoading(false); });
    return () => { mounted = false; mountedRef.current = false; pendingRuns.current.clear(); ++watch.current; ++listRevision.current; };
  }, [refreshList, selectChat]);

  useEffect(() => { try { if (activeId) sessionStorage.setItem(ACTIVE_KEY, activeId); else sessionStorage.removeItem(ACTIVE_KEY); } catch { /* Optional tab preference. */ } }, [activeId]);

  const newChat = useCallback(async () => {
    selected.current = null;
    ++watch.current;
    setActiveId(null);
    setMessages([]);
    setThreadLoading(false);
    setSending(false);
    setThreadError('');
    setApproval(null);
    setHasPendingApproval(false);
    return null;
  }, []);

  const deleteChat = useCallback(async (id) => {
    await agentApi.remove(id);
    detailCache.current.delete(id);
    messageCache.current.delete(id);
    pendingRuns.current.delete(id);
    approvals.current.delete(id);
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

  const dismissApproval = useCallback((actionId) => {
    dismissed.current.add(actionId);
    const current = approvals.current.get(selected.current);
    setHasPendingApproval(Boolean(current));
    setApproval(current && current.proposals.some((proposal) => !dismissed.current.has(proposal.actionId)) ? current : null);
  }, []);

  const reopenApproval = useCallback(() => {
    const current = approvals.current.get(selected.current);
    if (current) {
      current.proposals.forEach((proposal) => dismissed.current.delete(proposal.actionId));
      setApproval({ ...current });
    }
  }, []);

  const decide = useCallback(async (proposal, decision) => {
    const conversationId = selected.current;
    const current = approvals.current.get(conversationId);
    if (!current?.proposals.some((item) => item.actionId === proposal.actionId && item.proposalVersion === proposal.proposalVersion && item.digest === proposal.digest)) throw new Error('This proposal changed. Review the latest version.');
    setDecisionError('');
    try {
      const result = await agentApi.decision(proposal.actionId, { decision, proposalVersion: proposal.proposalVersion, digest: proposal.digest });
      dismissed.current.add(proposal.actionId);
      const remaining = current.proposals.filter((item) => item.actionId !== proposal.actionId);
      if (remaining.length) approvals.current.set(conversationId, { ...current, proposals: remaining });
      else approvals.current.delete(conversationId);
      if (selected.current === conversationId) setApproval(remaining.length ? { ...current, proposals: remaining } : null);
      if (selected.current === conversationId) setHasPendingApproval(Boolean(remaining.length));
      follow(result.run_id || current.runId, conversationId);
      return result;
    } catch (error) {
      const code = error?.response?.data?.errorCode;
      if (['ACTION_NOT_DECISIONABLE', 'PROPOSAL_CHANGED', 'PROPOSAL_MISMATCH', 'ACTION_EXPIRED', 'EXPIRED'].includes(code)) {
        try {
          const run = await agentApi.run(current.runId);
          if (['ACTION_EXPIRED', 'EXPIRED'].includes(code)) {
            approvals.current.delete(conversationId);
            if (selected.current === conversationId) { setApproval(null); setHasPendingApproval(false); }
          } else syncApproval(conversationId, run, current.timezone);
          if (run.status !== 'approval_required' && selected.current === conversationId) selectChat(conversationId);
        } catch { /* Keep the original decision error visible. */ }
      }
      const message = ['ACTION_EXPIRED', 'EXPIRED'].includes(code) ? 'This proposal expired; nothing was changed. Ask again to prepare a new one.'
        : ['PROPOSAL_CHANGED', 'PROPOSAL_MISMATCH'].includes(code) ? 'The proposal changed. Review the updated version before deciding.'
        : code === 'ACTION_NOT_DECISIONABLE' ? 'This proposal was already decided. Its status has been refreshed.'
        : code === 'CONSENT_REQUIRED' ? 'Please approve again using this dialog.'
        : error?.response?.status === 403 ? "You don't have permission to approve this change."
        : error?.response?.status === 401 ? 'Your session expired. Please log in again.'
        : "Couldn't send the decision. Check its status and try again.";
      setDecisionError(message);
      throw new Error(message);
    }
  }, []);

  const recover = useCallback(async (runId) => {
    const id = selected.current;
    await agentApi.recover(runId);
    follow(runId, id);
  }, []);

  const send = useCallback(async (raw, { attachments = [] } = {}) => {
    const message = String(raw || '').trim();
    const origin = selected.current;
    const chatKey = origin || 'new';
    if (origin && approvals.current.has(origin)) { reopenApproval(); return false; }
    if (!message || sendingChats.current.has(chatKey) || (origin && pendingRuns.current.has(origin))) return false;
    if (attachments.length) throw new Error('The agent chat API does not support attachments.');
    if (message.length > 16000) throw new Error('Messages must be 16,000 characters or fewer.');
    sendingChats.current.add(chatKey);
    showSending(origin);
    let id = origin;
    const key = requestId();
    try {
      if (!id) {
        const created = await agentApi.create();
        id = created.conversation_id;
        if (selected.current === origin) {
          selected.current = id;
          setActiveId(id);
        }
      }
      sendingChats.current.delete(chatKey);
      sendingChats.current.add(id);
      showSending(id);
      showMessages(id, [...(messageCache.current.get(id) || toMessages(detailCache.current.get(id))), { id: `${key}-user`, role: 'user', text: message, at: new Date().toISOString() }]);
      let accepted;
      try { accepted = await agentApi.send(id, message, key); }
      catch (error) {
        if (error.response) throw error;
        accepted = await agentApi.send(id, message, key);
      }
      setConversations((current) => {
        const existing = current.find((item) => item.id === id);
        const now = new Date().toISOString();
        return [{ ...existing, id, title: existing?.title && existing.title !== 'New chat' ? existing.title : message.slice(0, 50), preview: message, messageCount: (existing?.messageCount ?? 0) + 1, createdAt: existing?.createdAt || now, updatedAt: now, lastActivityAt: now }, ...current.filter((item) => item.id !== id)];
      });
      follow(accepted.run_id, id);
      return accepted;
    } catch (error) {
      const message = publicError(error);
      if (id) showMessages(id, [...(messageCache.current.get(id) || []), { id: `${key}-error`, role: 'assistant', text: message, at: new Date().toISOString(), error: true }]);
      throw new Error(message);
    } finally {
      sendingChats.current.delete(chatKey);
      if (id) sendingChats.current.delete(id);
      showSending(id || origin);
    }
  }, [reopenApproval]);

  return { conversations, activeId, messages, sending, historyLoading, historyError, threadLoading, threadError,
    newChat, selectChat, deleteChat, renameChat, send, approval, hasPendingApproval, decisionError, dismissApproval, reopenApproval, decide, recover };
}
