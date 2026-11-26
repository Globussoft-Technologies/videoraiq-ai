import { RefreshCw } from 'lucide-react'

// Display the exact API window in the viewer's local timezone.
const formatTime = (iso, includeDate = false) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString([], {
    ...(includeDate ? { day: '2-digit', month: 'short', year: 'numeric', timeZoneName: 'short' } : {}),
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const AlertsGraph = ({ buckets = [], total = 0, hours = 24, from = '', to = '', filtered = false, status = 'active', onStatusChange, onRefresh, refreshing = false, error = '' }) => {
  const max = Math.max(1, ...buckets.map((b) => b.count || 0))
  const midpoint = buckets[Math.floor(buckets.length / 2)]?.from
  const measure = status === 'all' ? 'All' : 'Active'

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {measure} Alerts · last {hours}h
          </h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{filtered ? 'Across matching clients.' : 'Across all client sites.'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-sm font-semibold text-amber-500 dark:text-amber-400">{total}</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={refreshing ? 'Refreshing Fleet Overview' : 'Refresh Fleet Overview'}
            title="Refresh Fleet Overview"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-wait dark:border-white/15 dark:bg-white/5 dark:text-gray-300 dark:hover:border-purple-400/60 dark:hover:bg-purple-500/10 dark:hover:text-purple-300"
          >
            <RefreshCw size={15} aria-hidden="true" className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="mt-3 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-white/15 dark:bg-white/5" role="group" aria-label="Alert count type">
        {['active', 'all'].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onStatusChange?.(option)}
            disabled={refreshing}
            aria-pressed={status === option}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-wait ${status === option ? 'bg-white text-gray-900 shadow-sm dark:bg-white/15 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'}`}
          >
            {option === 'all' ? 'All' : 'Active'}
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {buckets.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
          No alert data for this window.
        </p>
      ) : (
        <>
          {/* Bars */}
          <div className="mt-4 flex h-28 items-end gap-1">
            {buckets.map((b, i) => {
              const count = b.count || 0
              const pct = (count / max) * 100
              return (
                <div
                  key={b.from || i}
                  title={`${formatTime(b.from, true)} to ${formatTime(b.to, true)}: ${count} ${measure.toLowerCase()} alert${count === 1 ? '' : 's'}`}
                  role="img"
                  aria-label={`${count} ${measure.toLowerCase()} alert${count === 1 ? '' : 's'} from ${formatTime(b.from, true)} to ${formatTime(b.to, true)}`}
                  className="group flex h-full flex-1 items-end"
                >
                  <span
                    className="w-full rounded-t bg-amber-300 transition-colors group-hover:bg-amber-400 dark:bg-amber-400/70 dark:group-hover:bg-amber-400"
                    style={{ height: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                  />
                </div>
              )
            })}
          </div>

          {/* Baseline */}
          <div className="mt-1 h-px w-full bg-gray-200 dark:bg-white/10" />

          {/* The ticks use the exact interval boundaries, not rounded UTC hours. */}
          <div className="mt-1.5 flex justify-between font-mono text-[9px] text-gray-500 dark:text-gray-400">
            <span>{formatTime(from)}</span>
            <span>{formatTime(midpoint)}</span>
            <span>{formatTime(to)}</span>
          </div>
          <div className="mt-3 flex justify-between gap-3 border-t border-gray-100 pt-2 text-[10px] leading-relaxed dark:border-white/8">
            <div>
              <span className="block text-gray-400 dark:text-gray-500">From</span>
              <span className="text-gray-600 dark:text-gray-300">{formatTime(from, true)}</span>
            </div>
            <div className="text-right">
              <span className="block text-gray-400 dark:text-gray-500">To</span>
              <span className="text-gray-600 dark:text-gray-300">{formatTime(to, true)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default AlertsGraph
