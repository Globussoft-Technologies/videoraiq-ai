// Categorical hues assigned in fixed order by plan index — never cycled past
// the list, and never re-assigned when the set changes.
import ClientBreakdownRow from './ClientBreakdownRow'

const PLAN_COLORS = [
  'bg-cyan-400',
  'bg-blue-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-pink-500',
]

const ClientsByPlan = ({ rows = [], search = '' }) => {
  const max = Math.max(1, ...rows.map((r) => r.clients || 0))

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Clients by Plan</h2>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">No plan data.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {rows.map((row, i) => {
            const count = row.clients || 0
            const params = new URLSearchParams({ plan: (row.plan || 'No plan').toLowerCase() })
            if (search) params.set('search', search)
            return (
              <ClientBreakdownRow
                key={row.plan || i}
                to={`/clients?${params}`}
                label={row.plan || 'No plan'}
                count={count}
                max={max}
                color={PLAN_COLORS[i % PLAN_COLORS.length]}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ClientsByPlan
