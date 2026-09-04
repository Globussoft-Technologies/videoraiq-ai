import React from 'react';

/**
 * Full-bleed "Processing Video…" overlay shown over the clip stage while an
 * uploaded clip is being uploaded / processed / analysed by the DS pipeline.
 *
 * Props:
 *   title      headline, e.g. "Processing Video…"
 *   subtitle   status line under the waveform
 *   progress   0–100; when null the bar runs indeterminate
 */
// Builds one seamless period of a sine ribbon as a smooth closed path: the
// top edge sampled left→right, the bottom edge (same sine, offset down by
// `thickness`, phase-shifted so the band tapers to a point at each zero
// crossing) sampled right→left back to the start. Sampling actual sine
// values (not hand-placed Bézier handles) guarantees the tile's right edge
// matches its left edge exactly, so two tiles placed side by side never
// show a seam or spike. `phase` (radians) offsets where each layer's crests
// fall, so several layers of this same tile width overlap and cross each
// other like layered silk instead of stacking as one flat band.
function ribbonPath(width, cycles, midY, amplitude, thickness, phase = 0, steps = 48) {
  const top = [];
  const bottom = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * width;
    const angle = (i / steps) * cycles * Math.PI * 2 + phase;
    const y = midY + Math.sin(angle) * amplitude;
    // Ribbon thickness eases only modestly at each crest/trough — enough to
    // suggest a twisting silk band without ever reading as a thin wire — and
    // is fullest at the zero crossings.
    const localThickness = thickness * (0.72 + 0.28 * Math.abs(Math.cos(angle)));
    top.push([x, y - localThickness / 2]);
    bottom.push([x, y + localThickness / 2]);
  }
  const toPath = (points) => points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const bottomReversed = bottom.slice().reverse();
  return `${toPath(top)} ${toPath(bottomReversed).replace('M', 'L')} Z`;
}

// Each entry is one silk layer: phase offset (so crests land at different x
// positions across layers), amplitude/thickness (varied so layers read as
// distinct widths), a gradient + opacity, and its own scroll duration so
// layers visibly drift past each other instead of moving as one rigid unit.
const WAVE_LAYERS = [
  { phase: 0, amplitude: 22, thickness: 16, gradient: 'vq-wave-fill-1', opacity: 0.55, duration: 7.5, reverse: false },
  { phase: Math.PI * 0.6, amplitude: 26, thickness: 20, gradient: 'vq-wave-fill-2', opacity: 0.75, duration: 6, reverse: false },
  { phase: Math.PI * 1.15, amplitude: 20, thickness: 14, gradient: 'vq-wave-fill-3', opacity: 0.6, duration: 8.5, reverse: true },
  { phase: Math.PI * 1.7, amplitude: 24, thickness: 22, gradient: 'vq-wave-fill-1', opacity: 0.9, duration: 5, reverse: false },
];

export default function VideoProcessingLoader({
  title = 'Processing Video…',
  subtitle = 'Analyzing video content, please wait',
  progress = null,
}) {
  const hasProgress = typeof progress === 'number' && Number.isFinite(progress);
  const pct = hasProgress ? Math.min(100, Math.max(0, Math.round(progress))) : null;
  const layerPaths = WAVE_LAYERS.map((layer) => ribbonPath(400, 1.5, 40, layer.amplitude, layer.thickness, layer.phase));

  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-hidden bg-black/70 p-4 backdrop-blur-sm">
      <style>{`
        @keyframes vq-ribbon-shift { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes vq-ribbon-shift-rev { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        @keyframes vq-chip-pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
        @keyframes vq-dot-pulse { 0%,100% { opacity: .35; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
        @keyframes vq-label-pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
      `}</style>

      <div className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-[#2a2440] bg-[#0a0a12] px-7 py-6 text-center shadow-[0_0_50px_rgba(124,58,237,0.2)]">
        {/* AI chip */}
        <div
          className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-[#7c3aed]/70 bg-[#7c3aed]/10 text-[#a78bfa]"
          style={{ animation: 'vq-chip-pulse 1.8s ease-in-out infinite' }}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="7" y="7" width="10" height="10" rx="1.5" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M8.5 3.5v1M15.5 3.5v1M8.5 19.5v1M15.5 19.5v1M3.5 8.5h1M3.5 15.5h1M19.5 8.5h1M19.5 15.5h1" />
          </svg>
        </div>
        <div className="mt-1.5 text-[9px] font-bold tracking-[0.3em] text-[#a78bfa]">AI</div>

        <h3 className="mt-2.5 text-lg font-bold text-white">{title}</h3>
        <p className="mt-1 text-[13px] leading-snug text-[#9b94b8]">{subtitle}</p>

        {/* Flowing ribbons — several translucent silk bands layered together,
            each with its own phase, width and scroll speed/direction so they
            visibly cross and drift past one another instead of moving as one
            flat, rigid band. */}
        <div className="relative mx-auto mt-4 h-16 w-full overflow-hidden">
          <svg viewBox="0 0 800 80" className="absolute h-0 w-0">
            <defs>
              <linearGradient id="vq-wave-fill-1" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#4338ca" stopOpacity="0" />
                <stop offset="0.3" stopColor="#6d28d9" stopOpacity="0.85" />
                <stop offset="0.6" stopColor="#a78bfa" stopOpacity="0.9" />
                <stop offset="1" stopColor="#4338ca" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="vq-wave-fill-2" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#4f46e5" stopOpacity="0" />
                <stop offset="0.18" stopColor="#7c3aed" stopOpacity="0.9" />
                <stop offset="0.5" stopColor="#e9d5ff" stopOpacity="1" />
                <stop offset="0.82" stopColor="#7c3aed" stopOpacity="0.9" />
                <stop offset="1" stopColor="#4f46e5" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="vq-wave-fill-3" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#312e81" stopOpacity="0" />
                <stop offset="0.3" stopColor="#5b21b6" stopOpacity="0.6" />
                <stop offset="0.65" stopColor="#c084fc" stopOpacity="0.7" />
                <stop offset="1" stopColor="#312e81" stopOpacity="0" />
              </linearGradient>
              <filter id="vq-wave-glow" x="-30%" y="-200%" width="160%" height="500%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>
          </svg>

          {WAVE_LAYERS.map((layer, li) => (
            <svg
              key={`layer-${li}`}
              viewBox="0 0 800 80"
              preserveAspectRatio="none"
              className="absolute left-0 top-0 h-full w-[200%]"
              style={{
                animation: `${layer.reverse ? 'vq-ribbon-shift-rev' : 'vq-ribbon-shift'} ${layer.duration}s linear infinite`,
                mixBlendMode: 'screen',
              }}
            >
              {[0, 400].map((x0) => (
                <g key={`g-${x0}`} transform={`translate(${x0}, 0)`}>
                  <path d={layerPaths[li]} fill={`url(#${layer.gradient})`} filter="url(#vq-wave-glow)" opacity={layer.opacity * 0.6} />
                  <path d={layerPaths[li]} fill={`url(#${layer.gradient})`} opacity={layer.opacity} />
                </g>
              ))}
            </svg>
          ))}

          {/* Drifting particles scattered around the ribbons */}
          <svg viewBox="0 0 800 80" preserveAspectRatio="none" className="absolute left-0 top-0 h-full w-[200%]" style={{ animation: 'vq-ribbon-shift 6s linear infinite' }}>
            {[
              [50, 14], [140, 58], [220, 18], [310, 54], [390, 20],
              [450, 16], [540, 58], [620, 20], [710, 52], [790, 22],
            ].map(([cx, cy], i) => (
              <circle
                key={`dot-${i}`}
                cx={cx}
                cy={cy}
                r={1.8}
                fill="#e9d5ff"
                style={{ animation: `vq-dot-pulse ${2 + (i % 4) * 0.4}s ease-in-out ${(i % 5) * 0.2}s infinite` }}
              />
            ))}
          </svg>
        </div>

        <div
          className="mt-3.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#7a7396]"
          style={{ animation: 'vq-label-pulse 2.2s ease-in-out infinite' }}
        >
          Extracting insights...
        </div>

        {/* Progress */}
        {hasProgress && (
          <div className="mt-4 flex items-center gap-2.5">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#6d28d9] to-[#c084fc] transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-[#c4b5fd]">
              {pct}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
