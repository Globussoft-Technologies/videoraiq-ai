import { Link } from 'react-router-dom'

const ClientBreakdownRow = ({ to, label, count, max, color }) => (
  <Link
    to={to}
    className="block rounded-md hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-500 dark:hover:bg-white/5"
  >
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
        {label}
      </span>
      <span className="shrink-0 font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">
        {count}
      </span>
    </div>
    <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/8">
      <span className={`block h-full rounded-full ${color}`} style={{ width: `${(count / max) * 100}%` }} />
    </div>
  </Link>
)

export default ClientBreakdownRow
