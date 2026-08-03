import { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { COMPOSER_PLACEHOLDER, COMPOSER_FOOTNOTE } from './assistant.copy';

const MAX_TEXTAREA_H = 168;

/**
 * Message input. Grows with its content up to a cap, then scrolls internally —
 * so a long question never pushes the thread off screen.
 *
 * Enter sends, Shift+Enter inserts a newline (the convention every chat UI uses).
 */
export default function Composer({ value, onChange, onSend, onStop, sending = false, autoFocus = true }) {
  const taRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const canSend = value.trim().length > 0 && !sending;

  // Re-measure on every change so the box tracks wrapped lines, not keystrokes.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_H)}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_H ? 'auto' : 'hidden';
  }, [value]);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    if (!canSend) return;
    onSend(value);
  };

  return (
    <div
      style={{
        flex: '0 0 auto',
        borderTop: '1px solid var(--bd)',
        background: 'var(--headerglass)',
        backdropFilter: 'blur(10px)',
        padding: '16px 22px 14px',
      }}
    >
      {/* Same 22px gutter as the thread above, so the input's edges line up
          with where the messages start and end. */}
      <div style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            padding: '9px 9px 9px 16px',
            borderRadius: 14,
            background: 'var(--bg2)',
            border: `1px solid ${focused ? 'var(--blue)' : 'var(--bd2)'}`,
            boxShadow: focused ? '0 0 0 3px rgba(59,130,246,.13)' : 'none',
            transition: 'border-color .15s, box-shadow .15s',
          }}
        >
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={COMPOSER_PLACEHOLDER}
            aria-label="Message the AI Assistant"
            className="vq-scroll"
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 26,
              maxHeight: MAX_TEXTAREA_H,
              padding: '4px 0',
              resize: 'none',
              background: 'transparent',
              border: 0,
              outline: 'none',
              color: 'var(--tx)',
              fontFamily: 'var(--ui)',
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          />

          {sending ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              style={{
                flex: '0 0 auto',
                width: 40,
                height: 40,
                borderRadius: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: 'var(--bg3)',
                border: '1px solid var(--bd2)',
                color: 'var(--tx2)',
              }}
            >
              <Square size={14} strokeWidth={2.4} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              title="Send"
              aria-label="Send message"
              style={{
                flex: '0 0 auto',
                width: 40,
                height: 40,
                borderRadius: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: canSend ? 'pointer' : 'not-allowed',
                color: '#fff',
                background: canSend
                  ? 'linear-gradient(135deg,var(--blue),var(--violet))'
                  : 'var(--toggleoff)',
                border: canSend ? '1px solid rgba(255,255,255,.18)' : '1px solid var(--bd)',
                boxShadow: canSend ? '0 6px 18px rgba(99,102,241,.32)' : 'none',
                transition: 'background .15s, box-shadow .15s',
              }}
            >
              <Send size={16} strokeWidth={1.9} />
            </button>
          )}
        </div>

        <div style={{ marginTop: 9, textAlign: 'center', fontSize: 11, color: 'var(--tx3)' }}>
          {COMPOSER_FOOTNOTE}
        </div>
      </div>
    </div>
  );
}
