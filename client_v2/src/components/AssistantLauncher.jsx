import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { LAUNCHER_LABEL } from '@/page/user/Assistant/assistant.copy';

/**
 * Floating entry point to the AI Assistant, pinned to the bottom-right of the
 * content area.
 *
 * It is positioned inside <main> rather than fixed to the viewport so it tracks
 * the content column instead of the window — the sidebar can collapse or turn
 * into a drawer without the button ever landing on it. The right inset clears
 * the page's own scrollbar.
 */
export default function AssistantLauncher({ to = '/assistant' }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        bottom: 20,
        zIndex: 55,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        onClick={() => navigate(to)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={`Open ${LAUNCHER_LABEL}`}
        title={`Open ${LAUNCHER_LABEL}`}
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          width: 54,
          height: 54,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: 'linear-gradient(135deg,var(--blue),var(--violet))',
          border: '1px solid rgba(255,255,255,.22)',
          boxShadow: hover
            ? '0 14px 34px rgba(139,92,246,.55), 0 0 0 6px rgba(139,92,246,.13)'
            : '0 10px 26px rgba(99,102,241,.42)',
          transform: hover ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'transform .18s ease, box-shadow .18s ease',
        }}
      >
        <MessageCircle size={23} strokeWidth={1.9} style={{ color: '#fff' }} />
        {/* Small accent bead — mirrors the reference launcher's top-right dot. */}
        <span
          className="vq-glowpulse"
          style={{
            position: 'absolute',
            top: -1,
            right: -1,
            width: 15,
            height: 15,
            borderRadius: '50%',
            background: 'var(--magenta)',
            border: '2.5px solid var(--bg1solid)',
          }}
        />
      </button>

      {/* Label pill, tucked under the button so the two read as one control. */}
      <span
        style={{
          pointerEvents: 'none',
          position: 'relative',
          zIndex: 1,
          marginTop: -8,
          padding: '3px 11px',
          borderRadius: 999,
          background: 'var(--bg1solid)',
          border: '1px solid var(--bd2)',
          color: 'var(--tx)',
          fontFamily: 'var(--ui)',
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '.02em',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(0,0,0,.28)',
        }}
      >
        {LAUNCHER_LABEL}
      </span>
    </div>
  );
}
