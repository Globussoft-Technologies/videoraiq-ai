import { useCallback, useEffect, useRef, useState } from 'react';
import { agentApi } from './agentApi';

const ACTIVE_KEY = 'vq_detection_agent_active_id';
const running = (status) => status === 'queued' || status === 'running';
const locks = new Set(['queued', 'running', 'approval_required', 'verification_pending', 'recoverable']);
const timestamp = (value) => value == null ? new Date().toISOString()
  : typeof value === 'number' ? new Date(value * 1000).toISOString() : value;
const requestId = () => crypto.randomUUID().replace(/-/g, '');

function publicError(error) {
  const code = error?.response?.data?.errorCode;
  const status = error?.response?.status;
  if (code === 'RUN_PENDING') return 'Another request is still in progress.';
  if (code === 'IDEMPOTENCY_CONFLICT') return 'That message id was already used for different text.';
  if (code === 'CONSENT_REQUIRED') return 'Review the pending proposal to continue.';
  if (code === 'AGENT_PROXY_KEY_REQUIRED') return 'VideoraAI service authentication needs to be configured. Contact your administrator.';
  if (code === 'AGENT_PROXY_KEY_REJECTED') return 'VideoraAI service gateway rejected its key. Contact your administrator.';
  if (code === 'AGENT_NOT_ENABLED_FOR_USER' || status === 403) return "The assistant isn't enabled for your account.";
  if (code === 'AGENT_DISABLED' || status === 503) return 'The assistant is not enabled.';
  if (code === 'RATE_LIMITED' || status === 429) return 'Message limit reached. Try again later.';
  if (status === 401) return 'Session ended. Please sign in again.';
  if (status === 404) return 'Conversation unavailable. It may have been deleted.';
  if (code === 'INVALID_MESSAGE' || code === 'INVALID_REQUEST' || status === 422) return 'The request was not valid.';
  if (status === 504 || code === 'AGENT_TIMEOUT') return 'The agent did not answer in time.';
  if (!error?.response) return 'The service is not reachable.';
  return 'The agent is unavailable. Try again later.';
}

function runMessages(run) {
  const id = run.id || run.run_id;
  const at = timestamp(run.created_at || run.createdAt);
  const report = run.result?.report;
  const answer = report?.answer || run.result?.message || '';
  const missingProposal = run.status === 'completed'
    && /\b(?:prepared a proposal|initiated the request to create)\b/i.test(answer)
    && !run.result?.proposal
    && !(run.actions || []).some((action) => action.status === 'prepared' || action.status === 'completed')
    && !run.result?.action_result;
  const statusText = {
    verification_pending: 'Applied. Not confirmed yet: check the camera in the dashboard.',
    recoverable: 'The request was interrupted. You can recover it from the saved progress.',
    failed: 'Could not complete this request.',
    cancelled: 'Cancelled. Nothing was changed.',
  }[run.status];
  const actionResult = run.result?.action_result;
  const zoneAction = run.actions?.find((action) => action.kind === 'zone' && action.status !== 'cancelled');
  const zonePreviewActionId = zoneAction?.actionId || zoneAction?.action_id
    || (actionResult?.kind === 'zone' ? actionResult.actionId || actionResult.action_id : null)
    || (run.result?.proposal?.kind === 'zone' ? run.result.proposal.actionId : null);
  const errorText = run.result?.errorCode ? ({ MODEL_UNCONFIGURED: "The agent's AI model is not configured on the server.", RUN_TIMEOUT: 'The request took longer than its time budget. Progress was saved, so it can be recovered.', RUN_FAILED: 'The request failed unexpectedly. Progress was saved, so it can be recovered.', CANCELLED: 'The request was cancelled.' })[run.result.errorCode] || run.result.message : '';
  const results = actionResult?.normalized_target_results || actionResult?.targets || [];
  const failures = results.filter((target) => target.status === 'failed' || target.result?.status === 'failed')
    .map((target) => [target.label || target.cameraName || target.channelId, target.message || target.result?.message || target.errorCode || target.result?.errorCode].filter(Boolean).join(': '));
  const text = [answer, statusText, ...failures].filter(Boolean).join('\n\n');
  return [
    { id: `${id}-user`, role: 'user', text: run.message || '', at },
...(text || report || actionResult || locks.has(run.status) || run.result?.errorCode ? [{ id: `${id}-agent`, role: 'assistant', text: errorText ? '' : text, at, report, sources: run.result?.sources || [], proposal: run.result?.proposal, actionResult, zonePreviewActionId, status: run.status, missingProposal, runId: id, errorCode: run.result?.errorCode, errorMessage: errorText, error: run.status === 'failed', recoverableRunId: run.status === 'recoverable' ? id : null }] : []),
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
  const [activeId, setActiveId] = useState(() => { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } });
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const [uncertain, setUncertain] = useState(null);
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

  const syncApproval = (conversationId, run, timezone, autoOpen = true) => {
    const prepared = run?.status === 'approval_required' ? (run.actions || []).filter((action) => action.status === 'prepared') : [];
    if (prepared.length) approvals.current.set(conversationId, { runId: run.id || run.run_id, proposals: prepared, timezone });
    else approvals.current.delete(conversationId);
    if (selected.current === conversationId && mountedRef.current) {
      const next = approvals.current.get(conversationId);
      setHasPendingApproval(Boolean(next));
      setApproval(autoOpen && next && next.proposals.find((proposal) => !dismissed.current.has(proposal.actionId)) ? next : null);
    }
  };

  const showMessages = (id, next) => {
    messageCache.current.set(id, next);
    if (selected.current === id && mountedRef.current) setMessages(next);
  };

  const showSending = (id) => {
    if (selected.current === id && mountedRef.current) setSending(sendingChats.current.has(id) || pendingRuns.current.has(id) || Boolean(uncertainRef.current?.conversationId === id));
  };
  const uncertainRef = useRef(null);

  const refreshList = useCallback(async () => {
    const revision = ++listRevision.current;
    const result = await agentApi.list();
    const items = (result.items || []).map((item) => {
      const id = item.id || item.conversation_id;
      const detail = detailCache.current.get(id);
      const cachedTitle = (() => { try { return localStorage.getItem(`vq_agent_title_${id}`); } catch { return null; } })();
      const editedTitle = (() => { try { return localStorage.getItem(`vq_agent_edited_title_${id}`); } catch { return null; } })();
      return { ...toConversation({ ...item, runs: detail?.runs || item.runs }), title: editedTitle || detail?.runs?.[0]?.message?.replace(/\s+/g, ' ').slice(0, 80) || cachedTitle || 'New chat', activeRun: item.active_run, createdAt: timestamp(item.created_at) };
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
            const title = detail.runs?.[0]?.message?.replace(/\s+/g, ' ').slice(0, 80) || 'New chat';
            try { localStorage.setItem(`vq_agent_title_${id}`, title); } catch { /* Cache is optional. */ }
            const editedTitle = (() => { try { return localStorage.getItem(`vq_agent_edited_title_${id}`); } catch { return null; } })();
            return { ...toConversation({ ...item, runs: detail.runs }), title: editedTitle || title };
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
    setSending(sendingChats.current.has(id) || pendingRuns.current.has(id) || uncertainRef.current?.conversationId === id);
    setThreadError('');
    setDecisionError('');
    const known = approvals.current.get(id);
    setHasPendingApproval(Boolean(known));
    setApproval(null);
    try {
      const detail = await agentApi.get(id);
      if (selected.current !== id || watch.current !== revision) return;
      detailCache.current.set(id, detail);
      if (!sendingChats.current.has(id) && !pendingRuns.current.has(id)) showMessages(id, toMessages(detail));
      const title = detail.runs?.[0]?.message?.replace(/\s+/g, ' ').slice(0, 80) || 'New chat';
      try { localStorage.setItem(`vq_agent_title_${id}`, title); } catch { /* Cache is optional. */ }
      const editedTitle = (() => { try { return localStorage.getItem(`vq_agent_edited_title_${id}`); } catch { return null; } })();
      setConversations((current) => current.map((item) => item.id === id ? { ...item, title: editedTitle || title, messageCount: toMessages(detail).length } : item));
      const latest = detail.runs?.at(-1);
      const reason = { queued: 'The agent is working…', running: 'The agent is working…', approval_required: 'Approve or cancel the pending proposal to continue', verification_pending: 'Verifying the last change…', recoverable: 'Recover or cancel the interrupted request to continue' }[latest?.status] || '';
      setLockReason(reason);
      if (reason) setSending(true);
      if (latest?.status === 'approval_required') {
        const fresh = await agentApi.run(latest.id || latest.run_id);
        if (selected.current !== id || watch.current !== revision) return;
        syncApproval(id, fresh, detail.timezone, false);
      } else if (latest) syncApproval(id, latest, detail.timezone, false);
      if (running(latest?.status) || latest?.status === 'verification_pending') follow(latest.id || latest.run_id, id);
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
      if (document.hidden) { await new Promise((resolve) => setTimeout(resolve, 5000)); continue; }
      try {
        const run = await agentApi.run(runId);
        showMessages(conversationId, (messageCache.current.get(conversationId) || []).map((entry) => entry.runId === runId ? { ...entry, status: run.status, proposal: run.result?.proposal || entry.proposal, actionResult: run.result?.action_result || entry.actionResult } : entry));
        if (selected.current === conversationId) setLockReason({ queued: 'The agent is working…', running: 'The agent is working…', verification_pending: 'Verifying the last change…' }[run.status] || '');
        if (!mountedRef.current || pendingRuns.current.get(conversationId) !== runId) return;
        if (run.status === 'approval_required') {
          syncApproval(conversationId, run, detailCache.current.get(conversationId)?.timezone);
          pendingRuns.current.delete(conversationId);
          showSending(conversationId);
          if (selected.current === conversationId) setLockReason('Approve or cancel the pending proposal to continue');
          agentApi.get(conversationId).then((detail) => {
            if (!mountedRef.current) return;
            detailCache.current.set(conversationId, detail);
            showMessages(conversationId, toMessages(detail));
            syncApproval(conversationId, run, detail.timezone);
          }).catch(() => {});
          return;
        }
        if (!running(run.status) && run.status !== 'verification_pending') {
          const detail = await agentApi.get(conversationId);
          if (!mountedRef.current || pendingRuns.current.get(conversationId) !== runId) return;
          detailCache.current.set(conversationId, detail);
          const next = toMessages(detail);
          showMessages(conversationId, next);
          syncApproval(conversationId, run, detail.timezone);
          setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messageCount: next.length } : item));
          pendingRuns.current.delete(conversationId);
          showSending(conversationId);
          if (selected.current === conversationId) setLockReason(locks.has(run.status) ? ({ approval_required: 'Approve or cancel the pending proposal to continue', recoverable: 'Recover or cancel the interrupted request to continue' }[run.status] || '') : '');
          refreshList().catch(() => {});
          return;
        }
      } catch (error) {
        if (selected.current === conversationId) setThreadError(publicError(error));
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
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

  useEffect(() => { try { if (activeId) localStorage.setItem(ACTIVE_KEY, activeId); else localStorage.removeItem(ACTIVE_KEY); } catch { /* Optional preference. */ } }, [activeId]);

  const newChat = useCallback(async () => {
    selected.current = null;
    ++watch.current;
    setActiveId(null);
    setMessages([]);
    setThreadLoading(false);
    setSending(false);
    setLockReason('');
    setThreadError('');
    setApproval(null);
    setHasPendingApproval(false);
    return null;
  }, []);

  const deleteChat = useCallback(async (id) => {
    await agentApi.remove(id);
    try { localStorage.removeItem(`vq_agent_title_${id}`); } catch { /* Cache is optional. */ }
    try { localStorage.removeItem(`vq_agent_edited_title_${id}`); } catch { /* Cache is optional. */ }
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

  const renameChat = useCallback(async (id, title) => {
    const nextTitle = String(title || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!nextTitle) throw new Error('Enter a conversation title.');
    try { localStorage.setItem(`vq_agent_edited_title_${id}`, nextTitle); } catch { throw new Error('Could not save the title in this browser.'); }
    setConversations((current) => current.map((item) => item.id === id ? { ...item, title: nextTitle } : item));
  }, []);

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
  const stop = useCallback(async (runId) => {
    const id = selected.current;
    await agentApi.cancel(runId);
    if (id) selectChat(id);
  }, [selectChat]);

  const retryUncertain = useCallback(async () => {
    const pending = uncertainRef.current;
    if (!pending) return;
    try {
      const accepted = await agentApi.send(pending.conversationId, pending.message, pending.requestId);
      uncertainRef.current = null;
      setUncertain(null);
      showMessages(pending.conversationId, (messageCache.current.get(pending.conversationId) || []).map((entry) => entry.id === `${pending.requestId}-user` ? { ...entry, uncertain: false } : entry));
      follow(accepted.run_id, pending.conversationId);
    } catch (error) {
      if (error.response && error.response.status < 500 && error.response.status !== 504) {
        uncertainRef.current = null;
        setUncertain(null);
        showSending(pending.conversationId);
        throw new Error(publicError(error));
      }
      throw new Error('Delivery is still uncertain. Retry with the same message ID.');
    }
  }, []);
  const discardUncertain = useCallback(() => {
    const id = uncertainRef.current?.conversationId;
    uncertainRef.current = null;
    setUncertain(null);
    if (id) { showMessages(id, (messageCache.current.get(id) || []).filter((entry) => !entry.uncertain)); showSending(id); }
  }, []);

  const send = useCallback(async (raw, { attachments = [] } = {}) => {
    const message = String(raw || '').trim();
    const origin = selected.current;
    const chatKey = origin || 'new';
    if (origin && approvals.current.has(origin)) { reopenApproval(); return false; }
    if (!message || uncertainRef.current?.conversationId === origin || sendingChats.current.has(chatKey) || (origin && (pendingRuns.current.has(origin) || locks.has(detailCache.current.get(origin)?.runs?.at(-1)?.status)))) return false;
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
      showMessages(id, [...(messageCache.current.get(id) || toMessages(detailCache.current.get(id))), { id: `${key}-user`, role: 'user', text: message, at: new Date().toISOString(), uncertain: true }]);
      let accepted;
      try { accepted = await agentApi.send(id, message, key); }
      catch (error) {
        if (error.response && error.response.status < 500 && error.response.status !== 504) throw error;
        uncertainRef.current = { conversationId: id, message, requestId: key };
        setUncertain(uncertainRef.current);
        showSending(id);
        return { uncertain: true };
      }
      showMessages(id, (messageCache.current.get(id) || []).map((entry) => entry.id === `${key}-user` ? { ...entry, uncertain: false } : entry));
      setConversations((current) => {
        const existing = current.find((item) => item.id === id);
        const now = new Date().toISOString();
        return [{ ...existing, id, title: existing?.title && existing.title !== 'New chat' ? existing.title : message.slice(0, 50), preview: message, messageCount: (existing?.messageCount ?? 0) + 1, createdAt: existing?.createdAt || now, updatedAt: now, lastActivityAt: now }, ...current.filter((item) => item.id !== id)];
      });
      showMessages(id, [...(messageCache.current.get(id) || []).filter((entry) => entry.id !== `${key}-agent`), { id: `${key}-agent`, role: 'assistant', text: '', status: 'queued', runId: accepted.run_id, at: new Date().toISOString() }]);
      follow(accepted.run_id, id);
      return accepted;
    } catch (error) {
      const message = publicError(error);
      if (id) showMessages(id, [...(messageCache.current.get(id) || []).filter((entry) => entry.id !== `${key}-user`), { id: `${key}-error`, role: 'assistant', text: message, at: new Date().toISOString(), error: true }]);
      throw new Error(message);
    } finally {
      sendingChats.current.delete(chatKey);
      if (id) sendingChats.current.delete(id);
      showSending(id || origin);
    }
  }, [reopenApproval]);

  return { conversations, activeId, messages, sending, lockReason, uncertain, retryUncertain, discardUncertain, historyLoading, historyError, threadLoading, threadError,
    newChat, selectChat, deleteChat, renameChat, send, approval, hasPendingApproval, decisionError, dismissApproval, reopenApproval, decide, recover, stop };
}
