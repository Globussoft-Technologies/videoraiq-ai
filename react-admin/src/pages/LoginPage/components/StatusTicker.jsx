const TICKER_ITEMS = [
  '162 PROVISIONED',
  '302 DETECTIONS RUNNING',
  '730 ALERTS / 24H',
  'MRR $4,647',
  'ALL REGIONS OPERATIONAL',
  '6 CLIENTS ONLINE',
  '192 CAMERAS LICENSED',
]

const StatusTicker = () => {
  const text = TICKER_ITEMS.join('   ·   ')
  return (
    <div className="absolute inset-x-0 top-0 z-6 flex h-8.5 items-center overflow-hidden border-b border-blue-400/10 bg-slate-950/50 backdrop-blur-sm">
      <div
        className="flex whitespace-nowrap font-mono text-[10.5px] tracking-wider text-slate-400"
        style={{ animation: 'vq-ticker 26s linear infinite' }}
      >
        <span className="px-2">{text}</span>
        <span className="px-2">{text}</span>
      </div>
    </div>
  )
}

export default StatusTicker
