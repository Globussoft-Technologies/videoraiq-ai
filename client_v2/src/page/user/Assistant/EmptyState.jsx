import { useState } from 'react';
import { Bot, ArrowUpRight } from 'lucide-react';
import { EMPTY_TITLE, EMPTY_SUB, SUGGESTED_PROMPTS } from './assistant.copy';

function PromptChip({ text, onPick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onPick(text)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '13px 15px',
        borderRadius: 11,
        cursor: 'pointer',
        textAlign: 'left',
        background: hover ? 'var(--bg3)' : 'var(--bg2)',
        border: `1px solid ${hover ? 'var(--blue)' : 'var(--bd2)'}`,
        color: 'var(--tx)',
        fontFamily: 'var(--ui)',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        transition: 'background .15s, border-color .15s, transform .15s',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
      <ArrowUpRight
        size={15}
        strokeWidth={1.9}
        style={{ flex: '0 0 auto', color: hover ? 'var(--blue)' : 'var(--tx3)', transition: 'color .15s' }}
      />
    </button>
  );
}

/** First-run / new-chat state: what the assistant is for, plus starter prompts. */
export default function EmptyState({ onPick }) {
  return (
    <div
      className="vq-fadeup"
      style={{
        width: '100%',
        maxWidth: 760,
        // `auto` on all sides centres this in the scroll box without the
        // flex-centering overflow clip on short viewports.
        margin: 'auto',
        padding: '36px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg,rgba(59,130,246,.18),rgba(168,85,247,.12))',
          border: '1px solid var(--bd2)',
        }}
      >
        <Bot size={27} strokeWidth={1.7} style={{ color: 'var(--blue)' }} />
      </div>

      <h1
        style={{
          margin: '20px 0 0',
          fontFamily: 'var(--disp)',
          fontWeight: 600,
          fontSize: 23,
          letterSpacing: '-.01em',
          color: 'var(--tx)',
        }}
      >
        {EMPTY_TITLE}
      </h1>
      <p
        style={{
          margin: '10px 0 0',
          maxWidth: 470,
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--tx2)',
        }}
      >
        {EMPTY_SUB}
      </p>

      <div
        className="vq-ai-suggest-grid"
        style={{
          marginTop: 28,
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 12,
        }}
      >
        {SUGGESTED_PROMPTS.map((p) => (
          <PromptChip key={p} text={p} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
