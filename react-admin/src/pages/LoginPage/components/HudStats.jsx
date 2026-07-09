const makeBars = (seed) =>
  Array.from({ length: 7 }, (_, i) => ({
    height: `${30 + ((seed * 13 + i * 29) % 60)}%`,
    duration: `${(1.6 + ((i * seed) % 10) / 10).toFixed(2)}s`,
    delay: `${(i * 0.12).toFixed(2)}s`,
  }))

const HUD_ITEMS = [
  { label: 'CLIENTS ONLINE', value: '6', color: '#22d3ee', bars: makeBars(3) },
  { label: 'CAMERAS LIVE', value: '162', color: '#3b82f6', bars: makeBars(7) },
  { label: 'ALERTS · 24H', value: '730', color: '#f5a623', bars: makeBars(5) },
]

const HudStats = () => {
  return (
    <div
      className="pointer-events-none absolute bottom-10 left-11 z-[6] hidden gap-3.5 lg:flex"
      style={{ animation: 'vq-fade-up 1s ease both .5s' }}
    >
      {HUD_ITEMS.map((h) => (
        <div
          key={h.label}
          className="min-w-[132px] rounded-[13px] border border-blue-400/15 bg-slate-950/55 p-3 backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 font-mono text-[8.5px] tracking-[0.12em] text-slate-400">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: h.color, boxShadow: `0 0 7px ${h.color}` }}
            />
            {h.label}
          </div>
          <div className="mt-1.5 font-display text-[22px] leading-tight font-bold text-slate-50">
            {h.value}
          </div>
          <div className="mt-2 flex h-6 items-end gap-[3px]">
            {h.bars.map((b, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm opacity-50"
                style={{
                  height: b.height,
                  background: h.color,
                  animation: `vq-bar ${b.duration} ease-in-out infinite`,
                  animationDelay: b.delay,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default HudStats
