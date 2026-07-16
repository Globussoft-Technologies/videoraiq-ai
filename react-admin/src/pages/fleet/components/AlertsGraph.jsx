// Hourly alert counts over the window. Bars carry a native tooltip per mark;
// only the first / middle / last hour are tick-labelled so the axis stays
// readable, and the window total is direct-labelled in the header.
const formatHour = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

const AlertsGraph = ({ buckets = [], total = 0, hours = 24 }) => {
  const max = Math.max(1, ...buckets.map((b) => b.count || 0))
  const lastIdx = buckets.length - 1
  const midIdx = Math.floor(lastIdx / 2)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Alerts · last {hours}h
          </h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Across all client sites.</p>
        </div>
        <span className="font-mono text-sm font-semibold text-amber-500 dark:text-amber-400">
          {total}
        </span>
      </div>

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
                  key={b.hour || i}
                  title={`${formatHour(b.hour)} — ${count} alert${count === 1 ? '' : 's'}`}
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

          {/* Selective ticks: first · middle · last */}
          <div className="mt-1.5 flex justify-between font-mono text-[9px] text-gray-400 dark:text-gray-600">
            <span>{formatHour(buckets[0]?.hour)}</span>
            <span>{formatHour(buckets[midIdx]?.hour)}</span>
            <span>Now</span>
          </div>
        </>
      )}
    </div>
  )
}

export default AlertsGraph
