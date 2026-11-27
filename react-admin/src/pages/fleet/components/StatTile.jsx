import { Link } from 'react-router-dom'

// Header stat tile: big value + label, with a soft tinted glow in the corner.
const StatTile = ({ Icon, value, label, tint, glow, to }) => {
  return (
    <Link to={to} className="relative block overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-purple-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 dark:border-white/8 dark:bg-[#0b0d13] dark:hover:border-purple-400">
      {/* Corner glow */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl ${glow}`}
      />

      <span className={`relative flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
        <Icon size={17} strokeWidth={2} />
      </span>

      <p className="relative mt-3 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="relative mt-0.5 text-xs text-gray-400 dark:text-gray-500">{label}</p>
    </Link>
  )
}

export default StatTile
