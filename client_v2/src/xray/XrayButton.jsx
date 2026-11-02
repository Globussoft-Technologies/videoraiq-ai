import { Loader2, ScanEye } from 'lucide-react';
import { MODE } from './buttonState';

/**
 * The X-Ray pill. Presentational only — every word and every enabled/disabled
 * decision arrives in `view`, from `deriveButtonState`.
 *
 * Placement (design gate Q1): on the stream, top-left. That is the one corner
 * `DetectionZoneMarking.jsx` leaves empty (its points/fullscreen cluster is
 * top-right at `:1171`), and sitting inside the stage means the control survives
 * the page's fullscreen mode instead of being left behind on the document.
 *
 * Ink (design gate): cyan `--cyan` #22d3ee. Zone marking already owns amber for
 * saved zones, blue for an in-progress drawing and green for a line-crossing
 * reference point, and all three can share the canvas with X-ray — cyan is the
 * only accent in `theme/tokens.css` it never uses. The active fill borrows
 * `ZoneToolbar.jsx:36`'s gradient idiom but runs cyan→violet rather than
 * blue→violet, so "X-Ray on" cannot be mistaken for "drawing".
 */
export default function XrayButton({ view, onToggle }) {
  const { mode, label, tooltip, disabled, pressed } = view;

  const base = {
    height: 30,
    padding: '0 13px 0 10px',
    borderRadius: 15,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    fontFamily: 'var(--ui)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '.01em',
    border: '1px solid rgba(255,255,255,.17)',
    background: 'rgba(8,11,17,.72)',
    color: '#e9edf7',
    backdropFilter: 'blur(8px)',
    cursor: 'pointer',
    transition: 'box-shadow .18s, border-color .18s',
  };

  const skin = {
    [MODE.IDLE]: {},
    [MODE.STARTING]: {
      background: 'rgba(8,11,17,.82)',
      borderColor: 'rgba(34,211,238,.35)',
      color: '#cfe9f3',
      cursor: 'default',
    },
    [MODE.ACTIVE]: {
      background: 'linear-gradient(135deg,#0e7490,#6d28d9)',
      borderColor: 'rgba(34,211,238,.55)',
      color: '#fff',
      boxShadow: '0 0 0 1px rgba(34,211,238,.25), 0 6px 22px -6px rgba(34,211,238,.5)',
    },
    [MODE.DISABLED]: {
      // Reuses the theme's own disabled inks so the pill greys out correctly in
      // both light and dark (`theme/tokens.css` defines these per theme).
      background: 'var(--disabled-bg)',
      borderColor: 'var(--disabled-bd)',
      color: 'var(--disabled-tx)',
      backdropFilter: 'none',
      boxShadow: 'none',
      cursor: 'not-allowed',
    },
  }[mode];

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      /**
       * `aria-disabled`, not the `disabled` attribute.
       *
       * The design rule for this control is that a refused press explains
       * itself — five distinct reasons live in `buttonState.js` for exactly
       * that. A real `disabled` button is removed from the tab order, so none
       * of them ever reach a keyboard or screen-reader user: `title` is
       * hover-only, and an unfocusable element's `aria-label` is not announced.
       * The reason existed and was unreachable for anyone not using a mouse.
       *
       * `aria-disabled` keeps the pill focusable and announced as unavailable,
       * with the reason read out, while `onClick` above is what actually makes
       * it inert. WAI-ARIA's own guidance for a control whose unavailability
       * needs explaining.
       */
      aria-disabled={disabled || undefined}
      // Hover affordance for pointer users; the aria-label carries the same
      // words for everyone else.
      title={tooltip}
      aria-label={`${label}. ${tooltip}`}
      aria-pressed={pressed}
      style={{ ...base, ...skin }}
    >
      {mode === MODE.STARTING ? (
        <Loader2
          size={13}
          aria-hidden="true"
          style={{ flex: 'none', animation: 'vq-spin 0.9s linear infinite' }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            flex: 'none',
            background: mode === MODE.ACTIVE ? '#22d3ee'
              : mode === MODE.DISABLED ? 'var(--disabled-bd)' : '#7c88a5',
            boxShadow: mode === MODE.ACTIVE ? '0 0 8px #22d3ee' : 'none',
          }}
        />
      )}
      {mode !== MODE.STARTING && <ScanEye size={14} strokeWidth={1.8} aria-hidden="true" />}
      {label}
    </button>
  );
}
