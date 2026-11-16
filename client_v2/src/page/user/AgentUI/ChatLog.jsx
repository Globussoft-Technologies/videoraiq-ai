import { ArrowDown, Check, Copy, Edit3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AgentMarkdown from './AgentMarkdown';
import AgentReport from './AgentReport';
import RunActivity from './RunActivity';
import ProposalCard from './ProposalCard';
import ZoneSnapshot from './ZoneSnapshot';
import ActionResult from './ActionResult';

function Question({ message, onSend, sending }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(message.text || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const input = useRef(null);
  const group = useRef(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  useEffect(() => {
    if (!editing) return undefined;
    const onOutside = (event) => {
      if (!group.current?.contains(event.target) && value.trim() === String(message.text || '').trim()) setEditing(false);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [editing, value, message.text]);
  const copyQuestion = async () => {
    try {
      await navigator.clipboard.writeText(String(message.text || ''));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { /* Clipboard permission can be unavailable. */ }
  };
  const submit = async (event) => {
    event.preventDefault();
    const revised = value.trim();
    if (!revised || saving || sending) return;
    setSaving(true);
    setError('');
    try {
      const result = await onSend(revised);
      if (!result) throw new Error('Wait for the current answer before sending another question.');
      setEditing(false);
    } catch (failure) { setError(failure?.message || 'Could not send the message.'); }
    finally { setSaving(false); }
  };
  return <div ref={group} className="agent-message-group me">
    {editing ? <form className="agent-inline-edit" onSubmit={submit}>
      <textarea ref={input} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false); if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) submit(event); }} aria-label="Edit question" rows={3} />
      {error && <p role="alert">{error}</p>}
      <div className="agent-inline-edit-actions"><button type="button" onClick={() => { setEditing(false); setValue(message.text || ''); setError(''); }}>Cancel</button><button type="submit" disabled={!value.trim() || saving || sending}>{saving ? 'Sending…' : 'Send message'}</button></div>
    </form> : <><div className="agent-message me"><span>{message.text}</span></div><div className="agent-message-actions"><button type="button" onClick={copyQuestion} title={copied ? 'Copied' : 'Copy question'} aria-label={copied ? 'Copied question' : 'Copy question'}>{copied ? <Check size={13} /> : <Copy size={13} />}</button><button type="button" onClick={() => setEditing(true)} title="Edit question" aria-label="Edit question"><Edit3 size={13} /></button></div></>}
  </div>;
}

function resolveDeviceNames(text, entityNames) {
  const raw = String(text || '');
  const ids = [...raw.matchAll(/\b[0-9a-f]{24}\b/gi)];
  if (!ids.length) return raw;
  const allResolved = ids.every(([id]) => entityNames.get(id.toLowerCase()));
  const fallback = /\bNVRs?\b/i.test(raw) && !/\bcameras?\b/i.test(raw) ? 'NVR name unavailable'
    : /\bcameras?\b/i.test(raw) && !/\bNVRs?\b/i.test(raw) ? 'Camera name unavailable' : 'Device name unavailable';
  let display = raw.replace(/`?\b([0-9a-f]{24})\b`?/gi, (_match, id) => entityNames.get(id.toLowerCase()) || fallback);
  if (allResolved) {
    display = display.replace(/\s*\(by their record IDs\)/gi, '');
    display = display.replace(/The system currently exposes the NVRs by their IDs rather than descriptive names\.\s*/gi, '');
  }
  return display;
}

function MessageText({ text, role, entityNames, theme }) {
  if (role === 'user') return <span>{text}</span>;
  const withoutActionIds = String(text || '').replace(/\bAction(?:\s+ID)?\s*[:#]?\s*(?:[0-9a-f]{8}-[0-9a-f-]{27,36}|[0-9a-f]{24})\b/gi, 'Change');
  return <AgentMarkdown text={resolveDeviceNames(withoutActionIds, entityNames)} theme={theme} />;
}

function messageTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ChatLog({ messages, sending, onSend, onRecover, onStop, onReview, onNewChat, entityNames = new Map(), theme }) {
  const logRef = useRef(null);
  const stickToBottom = useRef(true);
  const previousUserCount = useRef(messages.filter((message) => message.role === 'user').length);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const updateScroll = () => {
    const log = logRef.current;
    if (!log) return;
  const away = log.scrollHeight - log.scrollTop - log.clientHeight > 300;
    stickToBottom.current = !away;
    setShowScrollDown(away);
  };
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const userCount = messages.filter((message) => message.role === 'user').length;
    if (userCount > previousUserCount.current) stickToBottom.current = true;
    previousUserCount.current = userCount;
    if (stickToBottom.current) log.scrollTop = log.scrollHeight;
    updateScroll();
  }, [messages, sending]);
  const scrollToLatest = () => {
    const log = logRef.current;
    if (!log) return;
    stickToBottom.current = true;
    log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    setShowScrollDown(false);
  };
  return <div className="agent-log-shell"><section ref={logRef} className="agent-log flex flex-col" aria-live="polite" onScroll={updateScroll}>
    {messages.map((message) => message.role === 'user' ? <Question key={message.id} message={message} onSend={onSend} sending={sending} /> : <div className={`agent-message-group ai ${['queued', 'running', 'verification_pending'].includes(message.status) ? 'agent-message-working' : ''}`} key={message.id}>
      {messageTime(message.at) && <div className="agent-response-meta"><time dateTime={message.at}>{messageTime(message.at)}</time></div>}
      {((!message.report && !message.actionResult && message.text) || (message.runId && ['queued', 'running', 'verification_pending'].includes(message.status)) || message.errorCode || (message.status === 'approval_required' && message.proposal) || message.attachments?.length > 0) && <div className={`agent-message ai ${message.error ? 'error' : ''}`}>
        {message.runId && ['queued', 'running', 'verification_pending'].includes(message.status) && <RunActivity runId={message.runId} active status={message.status} />}
        {!message.report && !message.actionResult && message.text ? <MessageText text={message.text} role={message.role} entityNames={entityNames} theme={theme} /> : null}
        {message.errorCode && <div className={`agent-report-warning ${message.errorCode === 'CANCELLED' ? 'cancelled' : ''}`} role="alert">{message.errorMessage || ({ MODEL_UNCONFIGURED: "The agent's AI model is not configured on the server.", RUN_TIMEOUT: 'The request took longer than its time budget. Progress was saved, so it can be recovered.', RUN_FAILED: 'The request failed unexpectedly. Progress was saved, so it can be recovered.', CANCELLED: 'The request was cancelled.' })[message.errorCode] || 'The request could not be completed.'} <code>{message.errorCode}</code></div>}
        {message.status === 'approval_required' && message.proposal && <ProposalCard proposal={message.proposal} entityNames={entityNames} onReview={onReview} onNewChat={onNewChat} />}
        {message.attachments?.length > 0 && <div className="agent-message-attachments">{message.attachments.map((attachment, index) => <div key={attachment.attachmentId || index}>{attachment.url && /^image\//.test(attachment.mimeType || attachment.type || '') ? <img src={attachment.url} alt={attachment.fileName || 'Attached image'} /> : <span>{attachment.fileName || attachment.name || 'Attachment'}</span>}</div>)}</div>}
      </div>}
      {message.report && <AgentReport report={message.report} sources={message.sources} actionResult={message.actionResult} entityNames={entityNames} theme={theme} />}
      {message.missingProposal && <div className="agent-report-warning" role="alert">No approval proposal was returned. The zone was not created and the detection was not enabled. Check the camera in Detection Settings before trying again.</div>}
      {!message.report && message.actionResult && <div className="agent-action-response">
        {message.text && <div className="agent-action-answer"><MessageText text={message.text} role={message.role} entityNames={entityNames} theme={theme} /></div>}
        <ActionResult action={message.actionResult} entityNames={entityNames} />
        {message.zonePreviewActionId && ['completed', 'verification_pending'].includes(message.status) && <ZoneSnapshot actionId={message.zonePreviewActionId} />}
        {message.zoneSnapshots?.length > 0 && <div className="agent-zone-gallery">{message.zoneSnapshots.map((snapshot) => <ZoneSnapshot key={snapshot.url} src={snapshot.url} label={snapshot.label} />)}</div>}
      </div>}
      {(message.report || !message.actionResult) && message.zonePreviewActionId && ['completed', 'verification_pending'].includes(message.status) && <ZoneSnapshot actionId={message.zonePreviewActionId} />}
      {(message.report || !message.actionResult) && message.zoneSnapshots?.length > 0 && <div className="agent-zone-gallery">{message.zoneSnapshots.map((snapshot) => <ZoneSnapshot key={snapshot.url} src={snapshot.url} label={snapshot.label} />)}</div>}
      {message.runId && (['recoverable', 'verification_pending'].includes(message.status) || (['queued', 'running', 'recoverable'].includes(message.status) && !message.proposal)) && <div className="agent-run-controls">{['recoverable', 'verification_pending'].includes(message.status) && <button type="button" onClick={() => onRecover?.(message.runId)}>{message.status === 'recoverable' ? 'Recover' : 'Poll backend'}</button>}{['queued', 'running', 'recoverable'].includes(message.status) && !message.proposal && <button type="button" onClick={() => onStop?.(message.runId)}>Stop</button>}</div>}
    </div>)}
    {sending && !messages.some((message) => message.role === 'assistant' && ['queued', 'running', 'verification_pending'].includes(message.status)) && <div className="agent-message-group ai agent-message-working" role="status"><div className="agent-message ai"><RunActivity active status="queued" /></div></div>}
  </section>{showScrollDown && <button type="button" className="agent-log-jump" onClick={scrollToLatest} aria-label="Jump to latest message" title="Jump to latest message"><ArrowDown size={17} strokeWidth={2.2} /></button>}</div>;
}
