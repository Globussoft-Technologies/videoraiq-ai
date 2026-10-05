import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { LAUNCHER_LABEL } from '@/page/user/Assistant/assistant.copy';
import AssistantPage from '@/page/user/Assistant/AssistantPage';

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
  const location = useLocation();
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('vq_assistant_launcher_position'));
      return saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom) ? saved : { right: 24, bottom: 20 };
    } catch { return { right: 24, bottom: 20 }; }
  });
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('compact');
  const dragRef = useRef(null);
  const movedRef = useRef(false);

  useEffect(() => {
    if (location.state?.assistantClosed) {
      setOpen(false);
      setMode('compact');
    }
  }, [location.state]);

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
      const next = {
        right: Math.min(Math.max(8, window.innerWidth - 70), Math.max(8, drag.right - dx)),
        bottom: Math.min(Math.max(8, window.innerHeight - 70), Math.max(8, drag.bottom - dy)),
      };
      drag.position = next;
      setPosition(next);
    };
    const stop = () => {
      setDragging(false);
      const next = dragRef.current?.position;
      if (next) {
        try { localStorage.setItem('vq_assistant_launcher_position', JSON.stringify(next)); } catch { /* ignore */ }
      }
      dragRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  }, [dragging]);

  const onLauncherClick = (event) => {
    if (movedRef.current) { event.preventDefault(); event.stopPropagation(); return; }
    setMode('compact');
    setOpen(true);
  };

  const expandAssistant = () => {
    navigate(to, {
      state: {
        assistantMode: 'full',
        assistantReturnTo: `${location.pathname}${location.search}${location.hash}`,
      },
    });
  };

  if (location.pathname === to || location.pathname.startsWith(`${to}/`)) return null;

  return (
    <>
      {open && (
        <AssistantPage
          mode={mode}
          onModeChange={mode === 'compact' ? expandAssistant : setMode}
          onClose={() => setOpen(false)}
        />
      )}
      {!open && <div
      style={{
        position: 'fixed',
        right: position.right,
        bottom: position.bottom,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onPointerDown={(event) => {
          movedRef.current = false;
          dragRef.current = { x: event.clientX, y: event.clientY, right: position.right, bottom: position.bottom, position };
          setDragging(true);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onClick={(event) => {
          if (movedRef.current) { event.preventDefault(); event.stopPropagation(); return; }
          onLauncherClick(event);
        }}
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
          cursor: dragging ? 'grabbing' : 'pointer',
          background: 'linear-gradient(135deg,var(--blue),var(--violet))',
          border: '1px solid rgba(255,255,255,.22)',
          boxShadow: hover
            ? '0 14px 34px rgba(139,92,246,.55), 0 0 0 6px rgba(139,92,246,.13)'
            : '0 10px 26px rgba(99,102,241,.42)',
          transform: hover ? 'translateY(-2px)' : 'translateY(0)',
          transition: dragging ? 'none' : 'transform .18s ease, box-shadow .18s ease',
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
      </div>}
    </>
  );
}
