const AVATAR_COLORS = [
  'from-blue-500 to-purple-500',
  'from-emerald-500 to-green-500',
  'from-teal-400 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-pink-500 to-rose-500',
]

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const TopAlertClients = ({ clients = [] }) => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">
        Top Clients by Alert Volume
      </h2>

      {clients.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          No alerts in this window.
        </p>
      ) : (
        <ul className="flex flex-col">
          {clients.map((c, i) => (
            <li
              key={c.adminId || i}
              className="flex items-center gap-3 border-b border-gray-100 py-3 last:border-b-0 dark:border-white/5"
            >
              <span className="w-3 shrink-0 font-mono text-xs text-gray-400 dark:text-gray-600">
                {c.rank ?? i + 1}
              </span>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-linear-to-br text-[10px] font-semibold text-white ${
                  AVATAR_COLORS[i % AVATAR_COLORS.length]
                }`}
              >
                {getInitials(c.name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
                {c.name || 'Client'}
              </span>
              <span className="shrink-0 font-mono text-xs font-semibold text-amber-500 dark:text-amber-400">
                {c.alerts}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default TopAlertClients
