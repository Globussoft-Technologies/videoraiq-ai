import { useNavigate } from 'react-router-dom'

// Status values come straight from the API: active / inactive / expired.
const STATUS_STYLES = {
  active: { dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400', label: 'Active' },
  inactive: { dot: 'bg-gray-400', text: 'text-gray-500 dark:text-gray-400', label: 'Inactive' },
  expired: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: 'Expired' },
}

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const ClientRow = ({ client }) => {
  const navigate = useNavigate()
  const {
    id,
    name,
    email,
    plan,
    cameras = 0,
    expireDate,
    status,
    avatarColor = 'from-blue-500 to-purple-500',
  } = client

  const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.inactive

  const openConfig = () => {
    if (!id) return
    navigate(`/clients/${id}`, { state: { name, email, plan, avatarColor } })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openConfig}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openConfig()
        }
      }}
      className="grid cursor-pointer grid-cols-[minmax(0,2.4fr)_minmax(0,2fr)_150px_100px_150px_110px] items-center gap-4 border-b border-gray-100 px-6 py-4 transition-colors last:border-b-0 hover:bg-gray-50/70 focus:bg-gray-50/70 focus:outline-none dark:border-white/5 dark:hover:bg-white/3 dark:focus:bg-white/3">
      {/* Name */}
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br text-xs font-semibold text-white ${avatarColor}`}
        >
          {getInitials(name)}
        </span>
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          {name || '—'}
        </p>
      </div>

      {/* Email */}
      <p className="truncate text-sm text-gray-500 dark:text-gray-400">{email || '—'}</p>

      {/* Plan */}
      <p className="truncate text-sm text-gray-500 dark:text-gray-400">{plan || '—'}</p>

      {/* Cameras */}
      <p className="text-sm">
        <span className="font-semibold text-gray-900 dark:text-white">{cameras}</span>
      </p>

      {/* Expire date */}
      <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(expireDate)}</p>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
        <span className={`text-sm font-medium ${statusStyle.text}`}>{statusStyle.label}</span>
      </div>
    </div>
  )
}

export default ClientRow
