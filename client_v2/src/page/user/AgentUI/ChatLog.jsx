import { ArrowDown, Check, Copy, Edit3, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AgentMarkdown from './AgentMarkdown';

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

function TypingBubble() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const progress = elapsed >= 45
    ? 'This is taking longer than expected. You can keep this request running or switch chats.'
    : elapsed >= 15 ? 'Still waiting for a response. You can switch chats while this runs.'
    : elapsed >= 5 ? 'Your request is in progress…' : '';
  return <div className="agent-progress" role="status" aria-live="polite">
    <span className="agent-progress-avatar" aria-hidden="true"><Sparkles size={14} /></span>
    <span className="agent-progress-bubble">
      {progress && <span className="agent-progress-text">{progress}</span>}
      <span className="agent-dots" aria-hidden="true"><i /><i /><i /></span>
    </span>
  </div>;
}

export default function ChatLog({ messages, sending, onSend, onRecover, entityNames = new Map(), theme }) {
  const logRef = useRef(null);
  const stickToBottom = useRef(true);
  const previousUserCount = useRef(messages.filter((message) => message.role === 'user').length);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const updateScroll = () => {
    const log = logRef.current;
    if (!log) return;
    const away = log.scrollHeight - log.scrollTop - log.clientHeight > 56;
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
    {messages.map((message) => message.role === 'user' ? <Question key={message.id} message={message} onSend={onSend} sending={sending} /> : <div className="agent-message-group ai" key={message.id}>
      <div className={`agent-message ${message.role === 'user' ? 'me' : 'ai'} ${message.error ? 'error' : ''}`}>
        <MessageText text={message.text} role={message.role} entityNames={entityNames} theme={theme} />
        {message.attachments?.length > 0 && <div className="agent-message-attachments">{message.attachments.map((attachment, index) => <div key={attachment.attachmentId || index}>{attachment.url && /^image\//.test(attachment.mimeType || attachment.type || '') ? <img src={attachment.url} alt={attachment.fileName || 'Attached image'} /> : <span>{attachment.fileName || attachment.name || 'Attachment'}</span>}</div>)}</div>}
      </div>
      {message.recoverableRunId && <button type="button" className="agent-approval-reopen" onClick={() => onRecover?.(message.recoverableRunId)}>Retry request</button>}
    </div>)}
    {sending && <TypingBubble />}
  </section>{showScrollDown && <button type="button" className="agent-log-jump" onClick={scrollToLatest} aria-label="Jump to latest message" title="Jump to latest message"><ArrowDown size={17} strokeWidth={2.2} /></button>}</div>;
}
