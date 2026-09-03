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
export default function VideoProcessingLoader({
  title = 'Processing Video…',
  subtitle = 'Analyzing video content, please wait',
  progress = null,
}) {
  const hasProgress = typeof progress === 'number' && Number.isFinite(progress);
  const pct = hasProgress ? Math.min(100, Math.max(0, Math.round(progress))) : null;

  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-hidden bg-black/70 p-4 backdrop-blur-sm">
      <style>{`
        /* One full tile width; the SVG holds two identical tiles so the loop is seamless. */
        @keyframes vq-wave-shift { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes vq-bar-indet {
          0% { left: -40%; width: 40%; }
          50% { width: 55%; }
          100% { left: 100%; width: 40%; }
        }
        @keyframes vq-chip-pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
        @keyframes vq-shimmer { from { transform: translateX(-100%) skewX(-16deg); } to { transform: translateX(300%) skewX(-16deg); } }
        @keyframes vq-glow-drift {
          0%,100% { opacity: .3; transform: translate(-8%, -6%) scale(1); }
          50% { opacity: .6; transform: translate(8%, 6%) scale(1.15); }
        }
      `}</style>

      {/* Full-bleed background: shimmer sweep + drifting glows across the whole video */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -inset-y-10 left-0 w-1/4"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(96,165,250,0.12) 45%, rgba(129,140,248,0.18) 55%, transparent)',
            animation: 'vq-shimmer 3s linear infinite',
          }}
        />
        <div
          className="absolute left-[6%] top-[8%] h-64 w-64 rounded-full bg-[var(--blue)]/25 blur-[80px]"
          style={{ animation: 'vq-glow-drift 6s ease-in-out infinite' }}
        />
        <div
          className="absolute bottom-[6%] right-[6%] h-64 w-64 rounded-full bg-[#818cf8]/20 blur-[80px]"
          style={{ animation: 'vq-glow-drift 7.5s ease-in-out infinite reverse' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[320px] overflow-hidden rounded-xl border border-[var(--blue)]/25 bg-[#0b0f18]/85 px-6 py-6 text-center shadow-[0_0_48px_rgba(59,130,246,0.22)]">
        {/* AI chip */}
        <div
          className="mx-auto grid h-11 w-11 place-items-center rounded-lg border-2 border-[var(--blue)] text-[var(--blue)]"
          style={{ animation: 'vq-chip-pulse 1.8s ease-in-out infinite' }}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="7" y="7" width="10" height="10" rx="1.5" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M8.5 3.5v1M15.5 3.5v1M8.5 19.5v1M15.5 19.5v1M3.5 8.5h1M3.5 15.5h1M19.5 8.5h1M19.5 15.5h1" />
          </svg>
        </div>
        <div className="mt-1.5 text-[9px] font-bold tracking-[0.2em] text-[var(--blue)]">AI</div>

        <h3 className="mt-2.5 text-base font-bold text-white">{title}</h3>

        {/* Animated waveform — two identical tiles, scrolls left→right seamlessly */}
        <div className="relative mx-auto mt-3 h-10 w-full overflow-hidden">
          <svg
            viewBox="0 0 800 40"
            preserveAspectRatio="none"
            className="absolute left-0 top-0 h-full w-[200%]"
            style={{ animation: 'vq-wave-shift 4s linear infinite' }}
          >
            <defs>
              <linearGradient id="vq-wave" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#3b82f6" stopOpacity="0.15" />
                <stop offset="0.5" stopColor="#60a5fa" stopOpacity="0.95" />
                <stop offset="1" stopColor="#3b82f6" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            {Array.from({ length: 7 }).map((_, i) => {
              const amp = 4 + i * 1.8;
              const y = 20;
              // Two identical 400-wide sine tiles (0→800) so translateX(-50%)
              // loops seamlessly, giving a continuous left→right scroll.
              const half = (x0) =>
                `${x0} ${y} C ${x0 + 50} ${y - amp}, ${x0 + 100} ${y + amp}, ${x0 + 150} ${y}` +
                ` S ${x0 + 250} ${y - amp}, ${x0 + 300} ${y}` +
                ` S ${x0 + 400} ${y + amp}, ${x0 + 400} ${y}`;
              return (
                <path
                  key={i}
                  d={`M${half(0)} L${half(400)}`}
                  fill="none"
                  stroke="url(#vq-wave)"
                  strokeWidth="1.2"
                  opacity={0.85 - i * 0.09}
                />
              );
            })}
          </svg>
        </div>

        <p className="mt-2.5 text-xs text-white/70">{subtitle}</p>

        {/* Progress */}
        <div className="mt-4 flex items-center gap-2.5">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            {hasProgress ? (
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#818cf8] transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            ) : (
              <div
                className="absolute top-0 h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#818cf8]"
                style={{ animation: 'vq-bar-indet 1.4s ease-in-out infinite' }}
              />
            )}
          </div>
          {hasProgress && (
            <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--blue)]">
              {pct}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
