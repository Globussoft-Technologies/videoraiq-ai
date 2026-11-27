// Donut built from SVG stroke-dasharray — no chart library needed.
// Segments are status-coloured and always paired with a text label + value,
// so state is never carried by colour alone.
const SEGMENTS = [
  { key: 'running', label: 'Online', stroke: '#0ca30c', dot: 'bg-green-500' },
  { key: 'stopped', label: 'Offline', stroke: '#d03b3b', dot: 'bg-red-500' },
  { key: 'idle', label: 'Idle capacity', stroke: '#9ca3af', dot: 'bg-gray-400' },
]

const RADIUS = 42
const CIRCUM = 2 * Math.PI * RADIUS

const CameraHealth = ({ health, provisioned, filtered = false }) => {
  const running = health?.running || 0
  const stopped = health?.stopped || 0
  const idle = health?.idleCapacity || 0
  const confirmed = running + stopped
  const unconfirmed = Math.max(provisioned - confirmed, 0)
  // The displayed Offline count covers every provisioned camera not confirmed online.
  const offline = stopped + unconfirmed
  const values = { running, stopped: offline, idle }
  const chartTotal = running + offline + idle
  const onlinePct = provisioned > 0 ? (running / provisioned) * 100 : 0
  const onlineLabel = running > 0 && onlinePct < 1 ? '<1%' : `${Math.round(onlinePct)}%`
  const hasStatus = confirmed > 0
  const weights = SEGMENTS.map(({ key }) => values[key] > 0 ? Math.max(values[key] / chartTotal, 0.025) : 0)
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)

  // Walk the segments, accumulating each arc's dash offset from the ones before it.
  const arcs = SEGMENTS.reduce((acc, s, index) => {
    const value = values[s.key]
    const frac = weightTotal > 0 ? weights[index] / weightTotal : 0
    const offset = acc.reduce((sum, a) => sum + a.dash, 0)
    acc.push({ ...s, value, dash: frac * CIRCUM, offset })
    return acc
  }, [])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">Camera Health</h2>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {filtered ? 'Matching clients right now.' : 'Fleet-wide status right now.'}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-6">
        {/* Donut */}
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
            {/* Track */}
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="11"
              className="stroke-gray-100 dark:stroke-white/8"
            />
            {chartTotal > 0 &&
              arcs.map((a) =>
                a.value > 0 ? (
                  <circle
                    key={a.key}
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    fill="none"
                    stroke={a.stroke}
                    strokeWidth="11"
                    strokeDasharray={`${a.dash} ${CIRCUM - a.dash}`}
                    strokeDashoffset={-a.offset}
                    strokeLinecap="butt"
                  >
                    <title>{`${a.label}: ${a.value}`}</title>
                  </circle>
                ) : null
              )}
          </svg>

          {/* Centre label */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-gray-900 dark:text-white">{hasStatus ? onlineLabel : '—'}</span>
            <span className="font-mono text-[10px] font-medium text-gray-600 dark:text-gray-300">
              {hasStatus ? `${running}/${provisioned} online` : 'No confirmed status'}
            </span>
          </div>
        </div>

        {/* Legend — label + value beside each colour */}
        <ul className="flex flex-col gap-2">
          {arcs.map((a) => (
            <li key={a.key} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${a.dot}`} />
              <span className="text-gray-600 dark:text-gray-300">{a.label}</span>
              <span className="ml-auto pl-4 font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">
                {a.value.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default CameraHealth
