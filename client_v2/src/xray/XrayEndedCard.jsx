import { TONE, endedCardFor } from './endedReason';

/**
 * The card an ended session leaves behind: what happened, why, and one press
 * back to a working X-ray.
 *
 * **What this replaces.** Until now an ended session showed its raw machine
 * reason in the status chip and then cleared itself after four seconds, on a
 * timer. Two things were wrong with that. `object_lost` and `capacity_reclaimed`
 * are unrelated events needing different responses from the user, and a
 * self-dismissing message is one the user may never have read — leaving them
 * looking at a stream with no mask and no account of why. Dismissal is now
 * theirs: this card stays until they act on it.
 *
 * Anchored under the pill, where the popover sits, for the same reason — X-ray's
 * own chrome belongs together and off the middle of the video, which on this
 * page is what the user is trying to draw zones on. It can never collide with
 * the popover: that only renders while the session is live, and this only when
 * it is not.
 */

const TONE_STYLE = {
  [TONE.NOTICE]: { accent: '#22d3ee', wash: 'rgba(34,211,238,.09)', edge: 'rgba(34,211,238,.34)' },
  [TONE.WARN]: { accent: '#fbbf24', wash: 'rgba(245,166,35,.09)', edge: 'rgba(245,166,35,.34)' },
  [TONE.ERROR]: { accent: '#ff6b6b', wash: 'rgba(255,77,77,.09)', edge: 'rgba(255,77,77,.34)' },
};

export default function XrayEndedCard({ reason, errorCode = null, onRestart, onDismiss }) {
  const card = endedCardFor(reason, errorCode);
  const tone = TONE_STYLE[card.tone] ?? TONE_STYLE[TONE.ERROR];

  return (
    <div
      // `alert`, so the explanation is announced rather than only shown — a
      // session can end while the user is looking at the right-hand rail.
      // Focus is deliberately NOT taken: this page has text inputs for zone
      // names, and stealing the caret mid-word to announce a timeout would be a
      // worse interruption than the one it reports.
      role="alert"
      aria-label={`X-Ray ended: ${card.title}`}
      style={{
        position: 'absolute', left: 10, top: 46, width: 286, zIndex: 7,
        padding: '13px 14px', borderRadius: 12,
        background: 'rgba(8,11,17,.93)', border: `1px solid ${tone.edge}`,
        backdropFilter: 'blur(14px)', boxShadow: '0 22px 54px -16px rgba(0,0,0,.76)',
        color: '#e9edf7', fontFamily: 'var(--ui)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 6, height: 6, borderRadius: '50%', flex: 'none',
            background: tone.accent, boxShadow: `0 0 8px ${tone.accent}`,
          }}
        />
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.09em',
          textTransform: 'uppercase', color: tone.accent,
        }}>
          X-Ray ended
        </span>
        {/* The machine reason, kept visible on purpose. It is the one string
            that makes a support conversation short, and it is the same token
            the service and Mongo recorded (contract §7). */}
        <span style={{
          marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9,
          color: '#6b7794', letterSpacing: '.03em',
        }}>
          {card.reason}
        </span>
      </div>

      <div style={{
        fontFamily: 'var(--disp)', fontSize: 13.5, fontWeight: 600, lineHeight: 1.3,
      }}>
        {card.title}
      </div>
      <p style={{
        margin: '5px 0 0', fontSize: 11.5, lineHeight: 1.55, color: '#aab6cd',
      }}>
        {card.detail}
      </p>

      <div style={{
        marginTop: 12, padding: '10px 0 0', borderTop: `1px solid ${tone.edge}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {/* Every reason's way back is a *new* session — `ended` is terminal and
            the service has already freed the GPU state (contract §4/§7) — so the
            labels say what the user gets, not that a session is being created. */}
        <button
          type="button"
          onClick={onRestart}
          style={{
            flex: 1, font: 'inherit', fontSize: 11.5, fontWeight: 600,
            padding: '7px 10px', borderRadius: 8, border: 0, cursor: 'pointer',
            background: 'linear-gradient(135deg,#0e7490,#6d28d9)', color: '#fff',
          }}
        >
          {card.action}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            font: 'inherit', fontSize: 11.5, padding: '7px 10px', borderRadius: 8,
            cursor: 'pointer', background: 'transparent',
            border: '1px solid rgba(255,255,255,.18)', color: '#aab6cd',
          }}
        >
          Close
        </button>
      </div>

      <div style={{
        marginTop: 7, fontFamily: 'var(--mono)', fontSize: 9, color: '#6b7794',
      }}>
        Esc closes X-Ray
      </div>
    </div>
  );
}
