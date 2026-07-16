// Fixed-order categorical hues — assigned by index, never recycled per render.
const BAR_COLORS = [
  { bar: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  { bar: 'bg-cyan-400', text: 'text-cyan-600 dark:text-cyan-400' },
  { bar: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400' },
  { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  { bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  { bar: 'bg-pink-500', text: 'text-pink-600 dark:text-pink-400' },
]

const DetectionsByType = ({ rows = [] }) => {
  const max = Math.max(1, ...rows.map((r) => r.count || 0))

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <div className="mb-4 flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Detections Running by Type
        </h2>
        <span className="font-mono text-[10px] tracking-wide text-gray-400 dark:text-gray-600">
          fleet-wide cameras
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          No detections running.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row, i) => {
            const c = BAR_COLORS[i % BAR_COLORS.length]
            const count = row.count || 0
            return (
              <div
                key={row.settingType || i}
                className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_36px] items-center gap-3"
              >
                <span
                  title={row.name}
                  className="truncate text-xs text-gray-500 dark:text-gray-400"
                >
                  {row.name}
                </span>
                <span className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/8">
                  <span
                    className={`block h-full rounded-full ${c.bar}`}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span className={`text-right font-mono text-xs font-semibold ${c.text}`}>
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DetectionsByType
