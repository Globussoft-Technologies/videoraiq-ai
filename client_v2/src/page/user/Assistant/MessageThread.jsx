import { useEffect, useRef } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';

const clock = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

/** Gradient sparkle avatar shown beside every assistant turn. */
function AssistantAvatar({ error = false }) {
  return (
    <span
      style={{
        width: 29,
        height: 29,
        borderRadius: 9,
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
        background: error
          ? 'rgba(255,77,77,.14)'
          : 'linear-gradient(135deg,var(--blue),var(--violet))',
        border: error ? '1px solid var(--crit)' : '1px solid rgba(255,255,255,.16)',
      }}
    >
      {error ? (
        <AlertTriangle size={14} strokeWidth={2} style={{ color: 'var(--crit)' }} />
      ) : (
        <Sparkles size={14} strokeWidth={2} style={{ color: '#fff' }} />
      )}
    </span>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <div
      className="vq-fadeup"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {!isUser && <AssistantAvatar error={msg.error} />}

      {/* The row spans the full width, but a single bubble is capped in absolute
          terms too — 76% of a wide monitor is an unreadable line length. */}
      <div
        style={{
          maxWidth: 'min(76%, 720px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            padding: '11px 14px',
            borderRadius: 14,
            borderTopRightRadius: isUser ? 5 : 14,
            borderTopLeftRadius: isUser ? 14 : 5,
            fontSize: 13.5,
            lineHeight: 1.65,
            // Preserve the paragraph breaks the reply comes back with; a real
            // markdown renderer can slot in here once replies contain markup.
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: isUser ? '#fff' : 'var(--tx)',
            background: isUser
              ? 'linear-gradient(135deg,var(--blue),var(--violet))'
              : msg.error
                ? 'rgba(255,77,77,.08)'
                : 'var(--bg2)',
            border: isUser
              ? '1px solid rgba(255,255,255,.16)'
              : `1px solid ${msg.error ? 'rgba(255,77,77,.35)' : 'var(--bd)'}`,
            boxShadow: isUser ? '0 6px 18px rgba(99,102,241,.22)' : 'none',
          }}
        >
          {msg.text}
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', margin: '5px 4px 0' }}>
          {clock(msg.at)}
        </span>
      </div>
    </div>
  );
}

/** Three-dot "thinking" bubble shown while a reply is in flight. */
function TypingBubble() {
  return (
    <div className="vq-fadeup" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <AssistantAvatar />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          height: 40,
          padding: '0 15px',
          borderRadius: 14,
          borderTopLeftRadius: 5,
          background: 'var(--bg2)',
          border: '1px solid var(--bd)',
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="vq-typing-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--tx2)',
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** The conversation itself, auto-scrolled to the newest turn. */
export default function MessageThread({ messages = [], sending = false }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, sending]);

  return (
    <div
      style={{
        width: '100%',
        // Full content width with the app's standard 22px page gutter, so turns
        // start at the left margin and end at the right one — aligned with the
        // composer below rather than floating in a narrow centred column.
        padding: '22px 22px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {messages.map((msg) => (
        <Bubble key={msg.id} msg={msg} />
      ))}
      {sending && <TypingBubble />}
      <div ref={endRef} />
    </div>
  );
}
