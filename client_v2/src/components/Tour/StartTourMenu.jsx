import { useCallback, useRef, useState } from 'react';
import { Compass, Play } from 'lucide-react';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { useTour } from '@/context/TourContext';
import { SHELL_TOUR } from '@/lib/tour/steps';

// The menu shows five modules at a time and scrolls past that, so the row
// height has to be fixed for the cut to land between rows rather than through
// one. These two numbers are the whole layout contract.
const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;

/**
 * "Start a Tour" — the manual entry point, in the header for every user.
 *
 * Deliberately not gated on `onboarded`: someone who finished (or skipped)
 * onboarding months ago is exactly who needs to revisit a module. Picking one
 * runs it as a single-module tour, which never touches the onboarding flag.
 */
export default function StartTourMenu() {
  const { modules, startModuleTour, active } = useTour();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, open, close);

  // The shell orientation pass is offered alongside the real modules — it is
  // the answer to "how do I get around", which is a common reason to reopen
  // the tour at all.
  const entries = [
    { key: SHELL_TOUR.key, label: SHELL_TOUR.label, group: 'ORIENTATION' },
    ...modules.map((m) => ({ key: m.key, label: m.label, group: m.group })),
  ];

  const pick = (key) => {
    setOpen(false);
    startModuleTour(key);
  };

  return (
    <div ref={ref} style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        type="button"
        data-tour="hdr-start-tour"
        onClick={() => setOpen((o) => !o)}
        disabled={active}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Start a tour"
        title={active ? 'A tour is already running' : 'Start a tour of any module'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          height: 36,
          padding: '0 12px',
          borderRadius: 9,
          border: '1px solid var(--bd)',
          background: open ? 'var(--bg1solid)' : 'var(--bg2)',
          color: active ? 'var(--tx3)' : 'var(--tx2)',
          fontFamily: 'var(--ui)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: active ? 'not-allowed' : 'pointer',
          opacity: active ? 0.6 : 1,
          whiteSpace: 'nowrap',
          transition: 'background .12s,color .12s',
        }}
      >
        <Compass size={15} strokeWidth={1.8} />
        <span className="vq-tour-btn-label">Start a Tour</span>
      </button>

      {open && (
        <div
          className="vq-fadeup"
          role="menu"
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 268,
            background: 'var(--bg1solid)',
            border: '1px solid var(--bd2)',
            borderRadius: 12,
            boxShadow: '0 18px 50px rgba(0,0,0,.5)',
            zIndex: 70,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--bd)',
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              letterSpacing: '.14em',
              fontWeight: 600,
              color: 'var(--tx2)',
            }}
          >
            CHOOSE A MODULE
          </div>

          <div
            className="vq-scroll"
            style={{
              maxHeight: ROW_HEIGHT * VISIBLE_ROWS,
              overflowY: 'auto',
              padding: 6,
            }}
          >
            {entries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="menuitem"
                onClick={() => pick(entry.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  height: ROW_HEIGHT - 4,
                  padding: '0 9px',
                  borderRadius: 8,
                  border: 0,
                  background: 'transparent',
                  color: 'var(--tx)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'var(--ui)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Play size={12} strokeWidth={2} style={{ flex: '0 0 auto', color: 'var(--blue)' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {entry.label}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 9.5,
                      fontFamily: 'var(--mono)',
                      letterSpacing: '.1em',
                      color: 'var(--tx3)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {entry.group}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
