import { ArrowDown, Check, Copy, Edit3, LoaderCircle, Square } from 'lucide-react';
import { isLabeledIdentifier } from './isLabeledIdentifier';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import AgentMarkdown, { normalizeRecordWraps } from './AgentMarkdown';
import AgentReport from './AgentReport';
import RunActivity from './RunActivity';
import ProposalCard from './ProposalCard';
import ZoneSnapshot from './ZoneSnapshot';
import ActionResult from './ActionResult';
import AgentExport from './AgentExport';

function StopRunButton({ onStop, waiting }) {
  const pending = useRef(false);
  const [submitting, setStopping] = useState(false);
  const stopping = submitting || waiting;
  const stop = async () => {
    if (pending.current) return;
    pending.current = true;
    setStopping(true);
    try {
      await onStop();
    } finally {
      pending.current = false;
      setStopping(false);
    }
  };
  return <button type="button" className="agent-stop-run" onClick={stop} disabled={stopping} aria-busy={stopping}>
    {stopping ? <LoaderCircle className="agent-download-spinner" size={14} aria-hidden="true" /> : <Square size={12} fill="currentColor" aria-hidden="true" />}
    <span>{stopping ? 'Stopping…' : 'Stop'}</span>
  </button>;
}

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

function appendKnownIdsToIdentifierPhrases(text, entityNames) {
  const entries = [...entityNames.entries()]
    .filter(([, label]) => String(label || '').trim())
    .sort((left, right) => String(right[1]).length - String(left[1]).length);
  if (!entries.length) return text;
  return String(text || '').replace(
    /\b((?:channel|camera|nvr)s?\s+id\s*[:#]?\s+)([^,.;\n)]+?)(?=[,.;\n)]|$)/gi,
    (match, prefix, rawLabel) => {
      const label = rawLabel.trim().replace(/^[*_\x60]+|[*_\x60]+$/g, '');
      const entry = entries.find(([, name]) => String(name).trim().toLowerCase() === label.toLowerCase());
      return entry ? prefix + '\x60' + entry[0] + '\x60' : match;
    },
  );
}

function appendKnownIdsToIdentifierLists(text, entityNames) {
  const entries = [...entityNames.entries()]
    .filter(([, label]) => String(label || '').trim())
    .sort((left, right) => String(right[1]).length - String(left[1]).length);
  if (!entries.length || !/\b(?:channel|camera|nvr|record|device)s?\s+ids?\b/i.test(text)) return text;
  let inIdentifierList = false;
  return String(text || '').split('\n').map((line) => {
    if (/\b(?:channel|camera|nvr|record|device)s?\s+ids?\b/i.test(line)) {
      inIdentifierList = true;
      return line;
    }
    if (!inIdentifierList) return line;
    const item = /^(\s*(?:[-*+]|\d+\.)\s+)([^:\n]+):\s*(?:\x60)?([^\x60\n]+)(?:\x60)?\s*$/.exec(line);
    if (!item) {
      if (line.trim() && !/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) inIdentifierList = false;
      return line;
    }
    const displayLabel = item[2].trim();
    const valueLabel = item[3].trim().replace(/^[*_]+|[*_]+$/g, '');
    const entry = entries.find(([, name]) => [displayLabel, valueLabel].some((candidate) => String(name).trim().toLowerCase() === candidate.toLowerCase()));
    if (!entry) return line;
    return item[1] + displayLabel + ': ' + String.fromCharCode(96) + entry[0] + String.fromCharCode(96);
  }).join('\n');
}

function resolveDeviceNames(text, entityNames) {
  const raw = String(text || '');
  const ids = [...raw.matchAll(/\b[0-9a-f]{24}\b/gi)];
  const identifierList = /\b(?:channel|camera|nvr|record|device)s?\s+ids?\b/i.test(raw);
  const allResolved = ids.length > 0 && ids.every(([id]) => entityNames.get(id.toLowerCase()));
  const idFallback = (id, offset) => {
    const lineStart = raw.lastIndexOf('\n', offset) + 1;
    const lineEnd = raw.indexOf('\n', offset);
    const line = raw.slice(lineStart, lineEnd < 0 ? raw.length : lineEnd);
    if (/\bnvrs?\b/i.test(line)) return 'NVR ID: ' + id;
    if (/\bcameras?\b/i.test(line)) return 'Camera ID: ' + id;
    if (/\brecord|incident|source\b/i.test(line)) return 'Record ID: ' + id;
    return 'Record ID: ' + id;
  };
  let display = raw.replace(/`?\b([0-9a-f]{24})\b`?/gi, (_match, id, offset) => {
    if (isLabeledIdentifier(raw, offset)) return _match;
    const lineStart = raw.lastIndexOf('\n', offset) + 1;
    const lineEnd = raw.indexOf('\n', offset);
    const line = raw.slice(lineStart, lineEnd < 0 ? raw.length : lineEnd);
    const name = entityNames.get(id.toLowerCase());
    if (identifierList && /^\s*(?:[-*+]|\d+\.)\s+[^:\n]+:\s*(?:\x60)?[0-9a-f]{24}(?:\x60)?\s*$/i.test(line)) return id;
    if (/\b(?:channel|camera|nvr)s?\s+id\b/i.test(line)) return _match;
    return name || idFallback(id, offset);
  });
  display = appendKnownIdsToIdentifierPhrases(display, entityNames);
  display = appendKnownIdsToIdentifierLists(display, entityNames);
  if (allResolved) {
    display = display.replace(/\s*\(by their record IDs\)/gi, '');
    display = display.replace(/The system currently exposes the NVRs by their IDs rather than descriptive names\.\s*/gi, '');
  }
  return display;
}

function MessageText({ text, role, entityNames, theme }) {
  if (role === 'user') return <span>{text}</span>;
  const withoutActionIds = String(text || '').replace(/\bAction(?:\s+ID)?\s*[:#]?\s*(?:[0-9a-f]{8}-[0-9a-f-]{27,36}|[0-9a-f]{24})\b/gi, 'Change');
  return <AgentMarkdown text={resolveDeviceNames(normalizeRecordWraps(withoutActionIds), entityNames)} theme={theme} />;
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
  useLayoutEffect(() => {
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
      {((!message.report && !message.actionResult && message.text) || ['queued', 'running', 'verification_pending'].includes(message.status) || message.errorCode || (message.status === 'approval_required' && message.proposal) || message.attachments?.length > 0) && <div className={`agent-message ai ${message.error ? 'error' : ''}`}>
        {['queued', 'running', 'verification_pending'].includes(message.status) && <RunActivity runId={message.runId} active status={message.status} reconnecting={message.reconnecting} stopping={message.stopping}>
          {message.runId && onStop && !message.proposal && message.status !== 'verification_pending' && <StopRunButton waiting={message.stopping} onStop={() => onStop(message.runId)} />}
        </RunActivity>}
        {!message.report && !message.actionResult && message.text ? <MessageText text={message.text} role={message.role} entityNames={entityNames} theme={theme} /> : null}
        {message.errorCode && <div className={`agent-report-warning ${message.errorCode === 'CANCELLED' ? 'cancelled' : ''}`} role="alert">{message.errorMessage || ({ MODEL_UNCONFIGURED: "The agent's AI model is not configured on the server.", RUN_TIMEOUT: 'The request took longer than its time budget. Progress was saved, so it can be recovered.', RUN_FAILED: 'The request failed unexpectedly. Progress was saved, so it can be recovered.', CANCELLED: 'The request was cancelled.' })[message.errorCode] || 'The request could not be completed.'} <code>{message.errorCode}</code></div>}
        {message.status === 'approval_required' && message.proposal && <ProposalCard proposal={message.proposal} entityNames={entityNames} onReview={onReview} onNewChat={onNewChat} />}
        {message.attachments?.length > 0 && <div className="agent-message-attachments">{message.attachments.map((attachment, index) => <div key={attachment.attachmentId || index}>{attachment.url && /^image\//.test(attachment.mimeType || attachment.type || '') ? <img src={attachment.url} alt={attachment.fileName || 'Attached image'} /> : <span>{attachment.fileName || attachment.name || 'Attachment'}</span>}</div>)}</div>}
      </div>}
      {message.report && <AgentReport report={message.report} sources={message.sources} actionResult={message.actionResult} entityNames={entityNames} theme={theme} exportUi={message.ui} />}
      {message.ui && <AgentExport ui={message.ui} exportText={message.report?.answer || message.text || ''} />}
      {message.missingProposal && <div className="agent-report-warning" role="alert">No approval proposal was returned. The zone was not created and the detection was not enabled. Check the camera in Detection Settings before trying again.</div>}
      {!message.report && message.actionResult && <div className="agent-action-response">
        {message.text && <div className="agent-action-answer"><MessageText text={message.text} role={message.role} entityNames={entityNames} theme={theme} /></div>}
        <ActionResult action={message.actionResult} entityNames={entityNames} />
        {message.zonePreviewActionId && ['completed', 'verification_pending'].includes(message.status) && <ZoneSnapshot actionId={message.zonePreviewActionId} />}
        {message.zoneSnapshots?.length > 0 && <div className="agent-zone-gallery">{message.zoneSnapshots.map((snapshot) => <ZoneSnapshot key={snapshot.url} src={snapshot.url} label={snapshot.label} />)}</div>}
      </div>}
      {(message.report || !message.actionResult) && message.zonePreviewActionId && ['completed', 'verification_pending'].includes(message.status) && <ZoneSnapshot actionId={message.zonePreviewActionId} />}
      {(message.report || !message.actionResult) && message.zoneSnapshots?.length > 0 && <div className="agent-zone-gallery">{message.zoneSnapshots.map((snapshot) => <ZoneSnapshot key={snapshot.url} src={snapshot.url} label={snapshot.label} />)}</div>}
      {message.runId && ['recoverable', 'verification_pending'].includes(message.status) && <div className="agent-run-controls">
        <button type="button" onClick={() => onRecover?.(message.runId)}>{message.status === 'recoverable' ? 'Recover' : 'Poll backend'}</button>
        {onStop && message.status === 'recoverable' && !message.proposal && <StopRunButton onStop={() => onStop(message.runId)} />}
      </div>}
    </div>)}
  </section>{showScrollDown && <button type="button" className="agent-log-jump" onClick={scrollToLatest} aria-label="Jump to latest message" title="Jump to latest message"><ArrowDown size={17} strokeWidth={2.2} /></button>}</div>;
}
