import { lostFadeSec } from './maskBuffer';

/**
 * The X-ray settings popover — design gate Q4: a popover hanging off the pill,
 * not a panel in the right rail, which on a real camera is already full of zone
 * settings.
 *
 * **The constraint that shaped this file.** The user's follow-up to Q4 was
 * *"what happens when we expand mid session, tracking should continue"*. It does,
 * and only because of where this component sits: the session hook and the mask
 * overlay are mounted by `XrayMode`, and this is a presentational sibling that
 * reads props and calls setters. Opening it re-renders **this** and nothing else.
 *
 * The anti-pattern to never introduce: mounting the overlay inside this subtree,
 * or keying `useXraySession` on popover state. Either unmounts on close, which
 * fires `DELETE /sessions/:id` and kills the GPU-side track. The
 * `session restarts` row below exists so that regression is *visible* and not
 * merely testable — it must read 0 however many times this is opened.
 *
 * Anchored inside the stage, so it survives the page's fullscreen mode.
 */

/**
 * The sensitivity labels, with the window read from `maskBuffer` rather than
 * retyped, so the number the user is shown is the number the draw loop uses.
 *
 * **These used to say "50 / 25 / 10 frames", and that was a lie.** Frames is the
 * unit of `lostAfterFrames`, which is the *service's* threshold for giving up on
 * a track (contract §7) and is not something this slider can move. What it moves
 * is how long the overlay keeps showing an object's last outline once the mask
 * stream stops mentioning it — a client-side fade, measured in seconds of video.
 */
const LOST_LABELS = ['patient', 'normal', 'eager'];
const lostLabel = (index) => `${LOST_LABELS[index] ?? 'normal'} · ${lostFadeSec(index)} s`;
const GLOW_OPTIONS = [['soft', 'Soft'], ['bold', 'Bold'], ['max', 'Max']];

const row = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.07)', fontSize: 11,
};
const key = { color: '#8e9cb8' };
const value = {
  fontFamily: 'var(--mono)', fontSize: 11, color: '#e9edf7',
  fontVariantNumeric: 'tabular-nums',
};

export default function XrayPopover({
  status, session, framesBehindLive, trackingForSec, sessionRestarts,
  glow, onGlow, smoothing, onSmoothing, lostSensitivity, onLostSensitivity,
}) {
  return (
    <div
      role="dialog"
      aria-label="X-Ray settings"
      style={{
        position: 'absolute', left: 10, top: 46, width: 262, zIndex: 6,
        padding: '13px 14px', borderRadius: 12,
        background: 'rgba(8,11,17,.9)', border: '1px solid rgba(255,255,255,.14)',
        backdropFilter: 'blur(14px)', boxShadow: '0 22px 54px -16px rgba(0,0,0,.72)',
        color: '#e9edf7', fontFamily: 'var(--ui)',
      }}
    >
      <div style={{
        margin: '0 0 10px', fontFamily: 'var(--disp)', fontSize: 12.5, fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        X-Ray
        <span style={{
          marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9,
          letterSpacing: '.07em', color: '#22d3ee',
        }}>
          {String(status).toUpperCase()}
        </span>
      </div>

      <div style={row}><span style={key}>Session</span>
        <b style={value}>{session?.sessionId ? `${String(session.sessionId).slice(0, 8)}…` : '—'}</b></div>
      <div style={row}><span style={key}>Source</span>
        <b style={value}>{session ? `${session.width}×${session.height}` : '—'}</b></div>
      <div style={row}><span style={key}>Mask rate</span>
        <b style={value}>{session?.frameRate ? `${session.frameRate.toFixed(1)} /s` : '—'}</b></div>
      <div style={row}><span style={key}>Tracking for</span>
        <b style={value}>{trackingForSec === null ? 'not tracking' : `${trackingForSec.toFixed(1)}s`}</b></div>
      <div style={row}><span style={key}>Behind live</span>
        <b style={value}>{Number.isFinite(framesBehindLive) ? `${framesBehindLive} fr` : '—'}</b></div>
      <div style={{ ...row, borderBottom: 0 }}>
        <span style={key}>Session restarts</span>
        <b style={{ ...value, color: sessionRestarts === 0 ? '#4ade80' : '#fbbf24' }}>
          {sessionRestarts}
        </b>
      </div>

      {/* ---- the two controls, both purely client-side in v1 ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11.5, fontWeight: 500 }}>Glow</span>
          <span style={{ display: 'inline-flex', borderRadius: 7, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,.16)' }}>
            {GLOW_OPTIONS.map(([option, label]) => (
              <button
                key={option}
                type="button"
                onClick={() => onGlow(option)}
                aria-pressed={glow === option}
                style={{
                  font: 'inherit', fontSize: 10.5, padding: '3px 8px', cursor: 'pointer',
                  border: 0, borderLeft: option === 'soft' ? 0 : '1px solid rgba(255,255,255,.12)',
                  background: glow === option ? 'linear-gradient(135deg,#0e7490,#6d28d9)' : 'transparent',
                  color: glow === option ? '#fff' : '#8e9cb8',
                  fontWeight: glow === option ? 600 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <label htmlFor="xray-smoothing" style={{ fontSize: 11.5, fontWeight: 500 }}>
            Mask smoothing
          </label>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#22d3ee' }}>
            {smoothing.toFixed(2)}
          </span>
        </div>
        <input
          id="xray-smoothing" type="range" min="0" max="1" step="0.01"
          value={smoothing}
          onChange={(event) => onSmoothing(Number(event.target.value))}
          style={{ width: '100%', accentColor: '#22d3ee', cursor: 'pointer' }}
        />
        <p style={{ margin: 0, fontSize: 10, color: '#8e9cb8', lineHeight: 1.5 }}>
          Rounds the outline and damps per-frame jitter. Cosmetic only — it never
          changes what was detected.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <label htmlFor="xray-lost" style={{ fontSize: 11.5, fontWeight: 500 }}>
            Lost sensitivity
          </label>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#22d3ee' }}>
            {lostLabel(lostSensitivity)}
          </span>
        </div>
        <input
          id="xray-lost" type="range" min="0" max="2" step="1"
          value={lostSensitivity}
          onChange={(event) => onLostSensitivity(Number(event.target.value))}
          style={{ width: '100%', accentColor: '#22d3ee', cursor: 'pointer' }}
        />
        <p style={{ margin: 0, fontSize: 10, color: '#8e9cb8', lineHeight: 1.5 }}>
          Once an object disappears, how long its last outline lingers — dashed
          and fading — before the overlay clears it. Patient leaves a trace
          behind a pillar; eager shows nothing where nothing is. It does not
          change when the server gives up on the track.
        </p>
      </div>

      {/*
        Explaining an absence, per the plan: do not ship a slider that does
        nothing. A click-seeded SAM3 track reports a constant score, so there is
        no confidence to threshold — a slider over it would move and change
        nothing, which is worse than its absence.
      */}
      <div style={{
        marginTop: 11, padding: '9px 10px', borderRadius: 8,
        background: 'rgba(245,166,35,.08)', border: '1px solid rgba(245,166,35,.26)',
        fontSize: 10, lineHeight: 1.55, color: '#c9d3e6',
      }}>
        <b style={{
          display: 'block', color: '#fbbf24', fontFamily: 'var(--mono)', fontSize: 9,
          letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 3,
        }}>
          No confidence slider — on purpose
        </b>
        A click-seeded track has no honest confidence to threshold; SAM3 reports a
        constant. A slider that changed nothing would be worse than its absence.
      </div>
    </div>
  );
}
