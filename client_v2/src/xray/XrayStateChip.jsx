import { STATUS } from './session';

/**
 * The session-state chip, bottom-left of the stage — and the disclosure control
 * for the telemetry strip above it.
 *
 * Design gate Q3: the telemetry ships, but **collapsed**. The chip is the resting
 * state; `seq / offset / behind-live / mask rate` expands out of it. That is the
 * only way anyone diagnoses "the mask looks off" on a customer site without a
 * rebuild, and it stays out of the way until asked for.
 *
 * Contract §7's states are the only vocabulary here. `lost` is amber rather than
 * red on purpose — an object behind a pillar is normal, and alarming the user
 * about it would be a lie about severity.
 */
const SKIN = {
  [STATUS.PREPARING]: { led: '#f5a623', text: 'PREPARING' },
  [STATUS.READY]: { led: '#22d3ee', text: 'READY' },
  [STATUS.TRACKING]: { led: '#22c55e', text: 'TRACKING' },
  [STATUS.LOST]: { led: '#f5a623', text: 'RE-ACQUIRING' },
  [STATUS.ENDED]: { led: '#ff4d4d', text: 'ENDED' },
};

const cell = {
  padding: '4px 8px', color: '#cdd8ec', display: 'flex', gap: 6, alignItems: 'center',
};
const divided = { ...cell, borderLeft: '1px solid rgba(255,255,255,.1)' };
const label = { color: '#7c88a5', fontWeight: 500 };
const figure = { color: '#fff', fontVariantNumeric: 'tabular-nums' };

export default function XrayStateChip({ status, reason, telemetry, expanded, onToggle }) {
  const skin = SKIN[status];
  if (!skin) return null; // idle: no session, nothing to report

  const live = status !== STATUS.ENDED;

  return (
    <>
      {expanded && live && (
        <div
          style={{
            position: 'absolute', left: 10, bottom: 44, zIndex: 5,
            display: 'flex', alignItems: 'stretch',
            fontFamily: 'var(--mono)', fontSize: 10,
            borderRadius: 7, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,.12)',
            background: 'rgba(8,11,17,.78)', backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
          }}
        >
          <div style={cell}>
            <span style={label}>seq</span>
            <span style={figure}>{telemetry?.seq ?? '—'}</span>
          </div>
          <div style={divided}>
            <span style={label}>off</span>
            <span style={figure}>
              {Number.isFinite(telemetry?.offset) ? `${telemetry.offset.toFixed(2)}s` : '—'}
            </span>
          </div>
          <div style={divided}>
            <span style={label}>behind</span>
            <span style={figure}>
              {Number.isFinite(telemetry?.framesBehindLive) ? `${telemetry.framesBehindLive} fr` : '—'}
            </span>
          </div>
          <div style={divided}>
            <span style={label}>masks</span>
            <span style={figure}>
              {Number.isFinite(telemetry?.frameRate) ? `${telemetry.frameRate.toFixed(1)}/s` : '—'}
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!!expanded}
        aria-label={`X-Ray status: ${skin.text}. ${expanded ? 'Hide' : 'Show'} stream details`}
        style={{
          position: 'absolute', left: 10, bottom: 10, zIndex: 5,
          display: 'inline-flex', alignItems: 'center', gap: 7,
          height: 26, padding: '0 8px 0 10px', borderRadius: 13,
          fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.04em',
          background: 'rgba(8,11,17,.72)', border: '1px solid rgba(255,255,255,.14)',
          color: '#dbe6f5', backdropFilter: 'blur(6px)', cursor: 'pointer',
        }}
      >
        {/* Announced politely rather than assertively: these transitions are
            frequent and mostly benign, and `assertive` would interrupt whatever
            the user is actually doing on this page. */}
        <span role="status" aria-live="polite" style={{ display: 'contents' }}>
          <span
            aria-hidden="true"
            style={{
              width: 6, height: 6, borderRadius: '50%', flex: 'none',
              background: skin.led, boxShadow: `0 0 7px ${skin.led}`,
            }}
          />
          {status === STATUS.ENDED && reason ? `${skin.text} · ${reason}` : skin.text}
        </span>
        {live && (
          <svg
            viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ opacity: 0.5, transform: expanded ? 'rotate(180deg)' : undefined }}
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        )}
      </button>
    </>
  );
}
