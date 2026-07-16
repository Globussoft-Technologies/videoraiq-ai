// Categorical hues assigned in fixed order by plan index — never cycled past
// the list, and never re-assigned when the set changes.
const PLAN_COLORS = [
  { dot: 'bg-cyan-400', bar: 'bg-cyan-400' },
  { dot: 'bg-blue-500', bar: 'bg-blue-500' },
  { dot: 'bg-purple-500', bar: 'bg-purple-500' },
  { dot: 'bg-amber-500', bar: 'bg-amber-500' },
  { dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  { dot: 'bg-pink-500', bar: 'bg-pink-500' },
]

const ClientsByPlan = ({ rows = [] }) => {
  const max = Math.max(1, ...rows.map((r) => r.clients || 0))

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Clients by Plan</h2>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">No plan data.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {rows.map((row, i) => {
            const c = PLAN_COLORS[i % PLAN_COLORS.length]
            const count = row.clients || 0
            return (
              <div key={row.plan || i}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
                    <span className="truncate text-sm text-gray-700 dark:text-gray-300">
                      {row.plan || 'No plan'}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">
                    {count}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/8">
                  <span
                    className={`block h-full rounded-full ${c.bar}`}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ClientsByPlan
