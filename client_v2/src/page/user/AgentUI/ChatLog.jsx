import { useEffect, useRef } from 'react';

export default function ChatLog({ messages, sending }) {
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, sending]);
  return <section ref={logRef} className="agent-log flex flex-col" aria-live="polite">{messages.map((message) => <div className={`agent-message ${message.role === 'user' ? 'me' : 'ai'} ${message.error ? 'error' : ''}`} key={message.id}><span>{message.text}</span>{message.attachments?.length > 0 && <div className="agent-message-attachments">{message.attachments.map((attachment, index) => <div key={attachment.attachmentId || index}>{attachment.url && /^image\//.test(attachment.mimeType || attachment.type || '') ? <img src={attachment.url} alt={attachment.fileName || 'Attached image'} /> : <span>{attachment.fileName || attachment.name || 'Attachment'}</span>}</div>)}</div>}</div>)}{sending && <div className="agent-message ai" aria-label="VideoraAI is typing"><span className="agent-dots"><i /><i /><i /></span></div>}</section>;
}
