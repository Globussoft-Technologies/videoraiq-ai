import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Eye,
  Laptop,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldOff,
  Smartphone,
  Tablet,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Topbar from '../../layout/Topbar'
import LoadingState from '../../components/UI/LoadingState'
import Pagination from '../clients/components/Pagination'
import { notifyApiError, notifyApiSuccess } from '../../utils/apiError'
import {
  blockSession,
  bulkDeleteSessions,
  deleteSession,
  getAdminSessions,
  getSessionDetails,
  getSessionSummary,
  logoutSession,
  unblockSession,
} from './apis'

const DEFAULT_PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'logged_out', label: 'Logged Out' },
]

const statusClass = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
  blocked: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20',
  logged_out: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/8 dark:text-gray-300 dark:ring-white/10',
  expired: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
}

const formatDate = (value) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const shortId = (value = '') => {
  const text = String(value || '')
  return text.length > 10 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text || '--'
}

const deviceType = (device = {}) => {
  const value = [
    device.deviceType,
    device.deviceName,
    device.operatingSystem,
    device.userAgent,
  ].filter(Boolean).join(' ').toLowerCase()

  if (/(ipad|tablet|tab|kindle|silk|playbook)/.test(value)) return 'tablet'
  if (/android/.test(value) && !/mobile/.test(value)) return 'tablet'
  if (/(mobile|iphone|android|phone|ipod|windows phone)/.test(value)) return 'phone'
  return 'desktop'
}

const DeviceIcon = ({ device, size = 18, className = '' }) => {
  const type = deviceType(device)
  if (type === 'phone') return <Smartphone size={size} strokeWidth={2.2} className={className} />
  if (type === 'tablet') return <Tablet size={size} strokeWidth={2.2} className={className} />
  return <Laptop size={size} strokeWidth={2.2} className={className} />
}

const readListData = (res) => res?.body?.data ?? res?.data ?? []
const readPageData = (res) => res?.body?.data ?? res?.data ?? {}

const ownerKey = (session) =>
  `${session.userType || 'admin'}:${String(session.memberId || session.adminId || '')}`

const StatCard = ({ label, value, Icon, tone = 'purple', onClick, active = false }) => {
  const tones = {
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
    gray: 'bg-gray-100 text-gray-700 dark:bg-white/8 dark:text-gray-300',
  }

  const ringTones = {
    purple: 'border-purple-300 ring-2 ring-purple-400/30 dark:border-purple-500/40',
    green: 'border-emerald-300 ring-2 ring-emerald-400/30 dark:border-emerald-500/40',
    red: 'border-red-300 ring-2 ring-red-400/30 dark:border-red-500/40',
    gray: 'border-gray-300 ring-2 ring-gray-400/30 dark:border-gray-500/40',
  }

  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm dark:bg-[#0b0d13] ${
        active ? ringTones[tone] : 'border-gray-200 dark:border-white/8'
      } ${
        onClick ? 'transition-colors hover:border-purple-200 hover:bg-purple-50/40 dark:hover:border-purple-500/20 dark:hover:bg-purple-500/6' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-600">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={19} strokeWidth={2.2} />
        </span>
      </div>
    </Component>
  )
}

const EmptyState = ({ label }) => (
  <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center dark:border-white/10 dark:bg-[#0b0d13]">
    <Laptop size={34} strokeWidth={1.8} className="text-gray-300 dark:text-gray-600" />
    <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
  </div>
)

const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${
      statusClass[status] || statusClass.logged_out
    }`}
  >
    {String(status || 'unknown').replace('_', ' ')}
  </span>
)

const SessionSummary = ({ rows = [], loading = false, selectedOwner = '', onSelectOwner, onClearOwner }) => {
  if (loading) return <LoadingState message="Loading session summary..." />
  if (rows.length === 0) return <EmptyState label="No session summary found" />

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-white/8">
        <div className="flex items-center gap-2">
          <Users size={18} strokeWidth={2.2} className="text-purple-600 dark:text-purple-300" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Logged Sessions by Admin/User</h2>
        </div>
        {selectedOwner && (
          <button
            type="button"
            onClick={onClearOwner}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/6 dark:hover:text-white"
          >
            Clear profile
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-white/6">
        {rows.map((row) => {
          const active = String(row.ownerId) === selectedOwner

          return (
          <button
            key={`${row.userType}:${row.ownerId}`}
            type="button"
            onClick={() => onSelectOwner(row)}
            className={`block w-full px-5 py-4 text-left transition-colors ${
              active
                ? 'bg-purple-50 dark:bg-purple-500/10'
                : 'hover:bg-gray-50 dark:hover:bg-white/4'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white">{row.ownerName}</p>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold capitalize text-gray-600 dark:bg-white/8 dark:text-gray-300">
                    {row.userType}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                  {row.ownerEmail || shortId(row.ownerId)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300">
                  {row.sessionCount} total
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {row.activeCount} active
                </span>
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {row.blockedCount} blocked
                </span>
              </div>
            </div>
          </button>
          )
        })}
      </div>
    </div>
  )
}

const ProfileSessionHeader = ({ profile, loading = false }) => {
  if (loading) return <LoadingState message="Loading profile..." />
  if (!profile) return <EmptyState label="Profile not found" />

  return (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{profile.ownerName}</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold capitalize text-gray-600 dark:bg-white/8 dark:text-gray-300">
              {profile.userType}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {profile.ownerEmail || shortId(profile.ownerId)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-purple-50 px-3 py-1.5 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300">
            {profile.sessionCount} total
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            {profile.activeCount} active
          </span>
          <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {profile.blockedCount} blocked
          </span>
        </div>
      </div>
    </div>
  )
}

const ActionModal = ({ action, onClose, onConfirm, busy }) => {
  const [reason, setReason] = useState('')
  if (!action) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#12151d]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <action.Icon size={19} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{action.title}</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{action.description}</p>
          </div>
        </div>

        {action.needsReason && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reason"
            className="mt-4 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/8 dark:bg-white/4 dark:text-white dark:placeholder:text-gray-500"
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/6"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={busy}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? 'Working...' : action.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const DetailsModal = ({ session, onClose }) => {
  if (!session) return null
  const rows = [
    ['Session ID', session.sessionId],
    ['Device ID', session.deviceId],
    ['Device', session.deviceName],
    ['Browser', session.browser],
    ['Operating System', session.operatingSystem],
    ['IP Address', session.ipAddress],
    ['Login Time', formatDate(session.loginTime)],
    ['Last Active', formatDate(session.lastActiveAt)],
    ['Logout Time', formatDate(session.logoutTime)],
    ['Blocked At', formatDate(session.blockedAt)],
    ['Block Reason', session.blockReason],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#12151d]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/8">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-600">
              Session Details
            </p>
            <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{session.deviceName || 'Unknown Device'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
          >
            Close
          </button>
        </div>

        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 dark:border-white/8 dark:bg-white/4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">{label}</p>
                <p className="mt-1 break-words text-sm font-medium text-gray-900 dark:text-white">{value || '--'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const SessionManagement = () => {
  const navigate = useNavigate()
  const { ownerType, ownerId } = useParams()
  const detailMode = Boolean(ownerType && ownerId)
  const [sessions, setSessions] = useState([])
  const [summary, setSummary] = useState([])
  // Unfiltered summary for just this owner — feeds the profile card's total/active/
  // blocked counts so they stay the person's real totals and never shift when the
  // status filter on the table below is changed (that filter only affects `summary`/
  // the table, never this).
  const [profileSummary, setProfileSummary] = useState(null)
  const [profileSummaryLoading, setProfileSummaryLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [status, setStatus] = useState('')
  const [userType, setUserType] = useState('')
  const [selectedOwner, setSelectedOwner] = useState('')
  const [summarySearch, setSummarySearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [details, setDetails] = useState(null)
  const [selectedSessionIds, setSelectedSessionIds] = useState([])

  const stats = useMemo(() => {
    const active = sessions.filter((session) => session.status === 'active').length
    const blocked = sessions.filter((session) => session.status === 'blocked').length
    return { active, blocked }
  }, [sessions])

  const visibleSummary = useMemo(() => {
    const query = summarySearch.trim().toLowerCase()
    return summary.filter((row) => {
      if (detailMode && String(row.ownerId) !== ownerId) return false
      if (!detailMode && selectedOwner && String(row.ownerId) !== selectedOwner) return false
      if (!query) return true
      return [row.ownerName, row.ownerEmail, row.userType, row.ownerId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [detailMode, ownerId, summary, selectedOwner, summarySearch])

  const ownerOptions = useMemo(
    () =>
      summary.map((row) => ({
        id: String(row.ownerId),
        label: `${row.ownerName} (${row.userType})`,
      })),
    [summary]
  )

  const ownerBySession = useMemo(() => {
    const owners = new Map()
    summary.forEach((row) => {
      owners.set(`${row.userType}:${String(row.ownerId)}`, row)
    })
    return owners
  }, [summary])

  const selectedOwnerFilter = detailMode
    ? ownerId
    : ownerOptions.some((option) => option.id === selectedOwner)
      ? selectedOwner
      : ''
  const userTypeFilter = detailMode ? ownerType : userType
  const visibleSessionIds = useMemo(() => sessions.map((session) => session.sessionId).filter(Boolean), [sessions])
  const allVisibleSelected = visibleSessionIds.length > 0 && visibleSessionIds.every((id) => selectedSessionIds.includes(id))
  const someVisibleSelected = visibleSessionIds.some((id) => selectedSessionIds.includes(id))

  const loadSessions = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getAdminSessions({
        skip: page * pageSize,
        limit: pageSize,
        status,
        userType: userTypeFilter,
        userId: selectedOwnerFilter,
        deviceId: '',
      })
      const data = readPageData(res)
      setSessions(Array.isArray(data.data) ? data.data : [])
      setTotal(data.totalCount ?? 0)
      setSelectedSessionIds([])
    } catch (err) {
      setError(notifyApiError(err, 'Failed to load sessions'))
      setSessions([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    setSummaryLoading(true)
    try {
      const res = await getSessionSummary({ status, userType, deviceId: '' })
      const data = readListData(res)
      setSummary(Array.isArray(data) ? data : [])
    } catch (err) {
      notifyApiError(err, 'Failed to load session summary')
      setSummary([])
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await getAdminSessions({
          skip: page * pageSize,
          limit: pageSize,
          status,
          userType: userTypeFilter,
          userId: selectedOwnerFilter,
          deviceId: '',
        })
        if (cancelled) return
        const data = readPageData(res)
        setSessions(Array.isArray(data.data) ? data.data : [])
        setTotal(data.totalCount ?? 0)
      } catch (err) {
        if (cancelled) return
        setError(notifyApiError(err, 'Failed to load sessions'))
        setSessions([])
        setTotal(0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [page, pageSize, status, userTypeFilter, selectedOwnerFilter])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setSummaryLoading(true)
      try {
        const res = await getSessionSummary({ status, userType, deviceId: '' })
        if (cancelled) return
        const data = readListData(res)
        setSummary(Array.isArray(data) ? data : [])
      } catch (err) {
        if (cancelled) return
        notifyApiError(err, 'Failed to load session summary')
        setSummary([])
      } finally {
        if (!cancelled) setSummaryLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [status, userType])

  const loadProfileSummary = async () => {
    if (!detailMode) return
    setProfileSummaryLoading(true)
    try {
      const res = await getSessionSummary({ status: '', userType: '', deviceId: '' })
      const data = readListData(res)
      const rows = Array.isArray(data) ? data : []
      setProfileSummary(rows.find((row) => String(row.ownerId) === ownerId) || null)
    } catch (err) {
      notifyApiError(err, 'Failed to load profile summary')
      setProfileSummary(null)
    } finally {
      setProfileSummaryLoading(false)
    }
  }

  useEffect(() => {
    if (!detailMode) return undefined
    let cancelled = false

    const load = async () => {
      setProfileSummaryLoading(true)
      try {
        const res = await getSessionSummary({ status: '', userType: '', deviceId: '' })
        if (cancelled) return
        const data = readListData(res)
        const rows = Array.isArray(data) ? data : []
        setProfileSummary(rows.find((row) => String(row.ownerId) === ownerId) || null)
      } catch (err) {
        if (cancelled) return
        notifyApiError(err, 'Failed to load profile summary')
        setProfileSummary(null)
      } finally {
        if (!cancelled) setProfileSummaryLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [detailMode, ownerId])

  const refreshAll = async () => {
    await Promise.all([loadSessions(), loadSummary(), loadProfileSummary()])
  }

  const selectOwnerProfile = (row) => {
    navigate(`/session-management/${row.userType}/${row.ownerId}`)
    setPage(0)
  }

  const clearOwnerProfile = () => {
    setSelectedOwner('')
    navigate('/session-management')
    setPage(0)
  }

  const openDetails = async (sessionId) => {
    try {
      const res = await getSessionDetails(sessionId)
      setDetails(res?.body?.data ?? res?.body ?? res?.data ?? null)
    } catch (err) {
      notifyApiError(err, 'Failed to load session details')
    }
  }

  const runAction = async (reason) => {
    if (!action) return
    setActionBusy(true)
    try {
      const res = await action.run(reason)
      notifyApiSuccess(res, action.success)
      setAction(null)
      setSelectedSessionIds([])
      await refreshAll()
    } catch (err) {
      notifyApiError(err, action.failure)
    } finally {
      setActionBusy(false)
    }
  }

  const toggleSessionSelection = (sessionId) => {
    setSelectedSessionIds((ids) =>
      ids.includes(sessionId) ? ids.filter((id) => id !== sessionId) : [...ids, sessionId]
    )
  }

  const toggleVisibleSelection = () => {
    setSelectedSessionIds((ids) => {
      if (allVisibleSelected) return ids.filter((id) => !visibleSessionIds.includes(id))
      return Array.from(new Set([...ids, ...visibleSessionIds]))
    })
  }

  const confirmBulkDelete = () => {
    if (!selectedSessionIds.length) return
    setAction({
      Icon: Trash2,
      title: 'Delete selected sessions?',
      description: `This permanently removes ${selectedSessionIds.length} selected session${selectedSessionIds.length === 1 ? '' : 's'}. Active browsers using deleted sessions will be logged out on their next session check.`,
      confirmLabel: 'Delete Selected',
      success: 'Selected sessions deleted successfully',
      failure: 'Failed to delete selected sessions',
      run: () => bulkDeleteSessions(selectedSessionIds),
    })
  }

  const deviceDisplayLabel = (device) =>
    device?.deviceName ||
    [device?.browser, device?.operatingSystem].filter(Boolean).join(' on ') ||
    'Unknown Device'

  // Session-level block/unblock — scoped to just this one session row. Blocking
  // the whole device (every session/future login from that browser) was removed
  // in favor of this: the per-row lock icon blocks only this session, so it
  // lands in "Blocked Sessions" — there's no separate device-level block anymore.
  const confirmBlockSession = (session) => {
    if (!session) return
    const deviceLabel = deviceDisplayLabel(session)
    setAction({
      Icon: ShieldOff,
      title: `Block this ${deviceLabel} session?`,
      description: `This blocks only this session. Other sessions on ${deviceLabel} (past or future logins) are not affected.`,
      confirmLabel: 'Block Session',
      needsReason: true,
      success: 'Session blocked successfully',
      failure: 'Failed to block session',
      run: (reason) => blockSession(session.sessionId, reason),
    })
  }

  const confirmUnblockSession = (session) => {
    if (!session) return
    const deviceLabel = deviceDisplayLabel(session)
    setAction({
      Icon: Unlock,
      title: `Unblock this ${deviceLabel} session?`,
      description: 'This removes the block on this session so its browser can be used again.',
      confirmLabel: 'Unblock Session',
      success: 'Session unblocked successfully',
      failure: 'Failed to unblock session',
      run: () => unblockSession(session.sessionId),
    })
  }

  const actionsFor = (session) => {
    const deviceLabel = deviceDisplayLabel(session)
    const deviceAction =
      session.status === 'blocked'
        ? {
            key: 'unblock-session',
            label: `Unblock ${deviceLabel}`,
            Icon: Unlock,
            onClick: () => confirmUnblockSession(session),
            className: 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10',
          }
        : {
            key: 'block-session',
            label: `Block ${deviceLabel}`,
            Icon: ShieldOff,
            onClick: () => confirmBlockSession(session),
            className: 'text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10',
          }

    return [
      {
      key: 'details',
      label: 'View session details',
      Icon: Eye,
      onClick: () => openDetails(session.sessionId),
      className: 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/6 dark:hover:text-white',
    },
    {
      key: 'logout',
      label: 'Logout session',
      Icon: LogOut,
      disabled: session.status !== 'active',
      onClick: () =>
        setAction({
          Icon: LogOut,
          title: 'Logout session?',
          description: 'This will end this browser session for the selected user.',
          confirmLabel: 'Logout',
          success: 'Session logged out successfully',
          failure: 'Failed to logout session',
          run: () => logoutSession(session.sessionId),
        }),
      className: 'text-amber-600 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10',
    },
    deviceAction,
    {
      key: 'delete-session',
      label: 'Delete session',
      Icon: Trash2,
      onClick: () =>
        setAction({
          Icon: Trash2,
          title: 'Delete session?',
          description: 'This permanently removes this session row. If the session is still active, that browser will be logged out on its next session check.',
          confirmLabel: 'Delete',
          success: 'Session deleted successfully',
          failure: 'Failed to delete session',
          run: () => deleteSession(session.sessionId),
        }),
      className: 'text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10',
    },
  ]
  }

  return (
    <>
      <Topbar eyebrow="SECURITY" title="Session Management" />

      <div className="px-8 py-6">
        {detailMode && (
          <button
            type="button"
            onClick={clearOwnerProfile}
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-300 dark:hover:bg-white/6 dark:hover:text-white"
          >
            <ArrowLeft size={16} strokeWidth={2.2} />
            All users
          </button>
        )}

        {!detailMode && (
          <div className="mb-5 grid gap-4 md:grid-cols-3">
            <StatCard
              label="All Users"
              value={summary.length}
              Icon={Users}
              tone="gray"
              active={status === ''}
              onClick={() => {
                setStatus('')
                setPage(0)
              }}
            />
            <StatCard
              label="Active Sessions"
              value={stats.active}
              Icon={Laptop}
              tone="green"
              active={status === 'active'}
              onClick={() => {
                setStatus((current) => (current === 'active' ? '' : 'active'))
                setPage(0)
              }}
            />
            <StatCard
              label="Blocked Sessions"
              value={stats.blocked}
              Icon={LockKeyhole}
              tone="red"
              active={status === 'blocked'}
              onClick={() => {
                setStatus((current) => (current === 'blocked' ? '' : 'blocked'))
                setPage(0)
              }}
            />
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {!detailMode ? (
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-white/8 dark:bg-[#0b0d13]">
              {[
                ['', 'Sessions'],
                ['blocked', 'Blocked Sessions'],
              ].map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setStatus(value)
                    setPage(0)
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    status === value
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/6 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-600">
              Profile Sessions
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!detailMode && (
              <>
                <div className="relative">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                  />
                  <input
                    type="text"
                    value={summarySearch}
                    onChange={(e) => setSummarySearch(e.target.value)}
                    placeholder="Search admin or user"
                    className="h-10 w-56 rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-200 dark:placeholder:text-gray-500"
                  />
                </div>
                  <select
                    value={userType}
                    onChange={(e) => {
                      setUserType(e.target.value)
                      setSelectedOwner('')
                      setPage(0)
                    }}
                    className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-200"
                  >
                    <option value="">All Accounts</option>
                    <option value="admin">Admins</option>
                    <option value="user">Users</option>
                  </select>
                {ownerOptions.length > 0 ? (
                  <select
                    value={selectedOwner}
                    onChange={(e) => {
                      setSelectedOwner(e.target.value)
                      setPage(0)
                    }}
                    className="h-10 max-w-56 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-200"
                  >
                    <option value="">All Admins/Users</option>
                    {ownerOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-400 dark:border-white/8 dark:bg-white/4 dark:text-gray-500"
                  >
                    No admins/users
                  </button>
                )}
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value)
                    setPage(0)
                  }}
                  className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-200"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            {!detailMode && (
              <button
                type="button"
                onClick={refreshAll}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-300 dark:hover:bg-white/6"
              >
                <RefreshCw size={16} strokeWidth={2.2} />
                Refresh
              </button>
            )}
          </div>
        </div>

        <>
            {detailMode ? (
              <>
                <ProfileSessionHeader
                  profile={profileSummary}
                  loading={profileSummaryLoading}
                />
                <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value)
                      setPage(0)
                    }}
                    className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-200"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={refreshAll}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-300 dark:hover:bg-white/6"
                  >
                    <RefreshCw size={16} strokeWidth={2.2} />
                    Refresh
                  </button>
                </div>
              </>
            ) : (
              <SessionSummary
                rows={visibleSummary}
                loading={summaryLoading}
                selectedOwner={selectedOwnerFilter}
                onSelectOwner={selectOwnerProfile}
                onClearOwner={clearOwnerProfile}
              />
            )}

            {detailMode && (
              error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </div>
              ) : loading ? (
                <LoadingState message="Loading sessions..." />
              ) : sessions.length === 0 ? (
                <EmptyState label="No sessions found" />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-white/8">
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                      {selectedSessionIds.length} selected
                    </p>
                    <button
                      type="button"
                      onClick={confirmBulkDelete}
                      disabled={!selectedSessionIds.length}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/20 dark:bg-[#0b0d13] dark:text-red-300 dark:hover:bg-red-500/10"
                    >
                      <Trash2 size={15} strokeWidth={2.2} />
                      Delete selected
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1240px] w-full text-left">
                      <thead className="border-b border-gray-200 dark:border-white/8">
                        <tr className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-600">
                          <th className="w-12 px-5 py-3">
                            <input
                              type="checkbox"
                              aria-label="Select all visible sessions"
                              checked={allVisibleSelected}
                              ref={(input) => {
                                if (input) input.indeterminate = !allVisibleSelected && someVisibleSelected
                              }}
                              onChange={toggleVisibleSelection}
                              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-white/20 dark:bg-white/5"
                            />
                          </th>
                          <th className="px-5 py-3">Device</th>
                          <th className="px-5 py-3">Owner</th>
                          <th className="px-5 py-3">User Type</th>
                          <th className="px-5 py-3">IP Address</th>
                          <th className="px-5 py-3">Login Time</th>
                          <th className="px-5 py-3">Last Active</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-white/6">
                        {sessions.map((session) => {
                          const owner = ownerBySession.get(ownerKey(session))
                          const selected = selectedSessionIds.includes(session.sessionId)
                          return (
                            <tr
                              key={session.sessionId}
                              className={`text-sm text-gray-600 dark:text-gray-300 ${selected ? 'bg-purple-50/50 dark:bg-purple-500/6' : ''}`}
                            >
                              <td className="px-5 py-4">
                                <input
                                  type="checkbox"
                                  aria-label={`Select session ${shortId(session.sessionId)}`}
                                  checked={selected}
                                  onChange={() => toggleSessionSelection(session.sessionId)}
                                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-white/20 dark:bg-white/5"
                                />
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300">
                                    <DeviceIcon device={session} size={18} />
                                  </span>
                                  <div className="min-w-0" title={session.deviceId}>
                                    <p className="font-semibold text-gray-900 dark:text-white">{session.deviceName || 'Unknown Device'}</p>
                                    <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">
                                      deviceId - {String(session.deviceId || '').slice(-10) || '--'}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <p className="font-semibold text-gray-900 dark:text-white">
                                  {owner?.ownerName || shortId(session.memberId || session.adminId)}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
                                  {owner?.ownerEmail || shortId(session.memberId || session.adminId)}
                                </p>
                              </td>
                              <td className="px-5 py-4 capitalize">{session.userType || '--'}</td>
                              <td className="px-5 py-4 font-mono text-xs">{session.ipAddress || '--'}</td>
                              <td className="px-5 py-4">{formatDate(session.loginTime)}</td>
                              <td className="px-5 py-4">{formatDate(session.lastActiveAt)}</td>
                              <td className="px-5 py-4">
                                <StatusBadge status={session.status} />
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex justify-end gap-1.5">
                                  {actionsFor(session).map(({ key, label, Icon, onClick, disabled, className }) => (
                                    <button
                                      key={key}
                                      type="button"
                                      title={label}
                                      aria-label={label}
                                      onClick={onClick}
                                      disabled={disabled}
                                      className={`group relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
                                    >
                                      <Icon size={16} strokeWidth={2.2} />
                                      <span className="pointer-events-none absolute -top-8 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-semibold text-white shadow-lg group-hover:block dark:bg-white dark:text-gray-900">
                                        {label}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {detailMode && total > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(0)
                }}
              />
            )}
        </>
      </div>

      <ActionModal action={action} onClose={() => setAction(null)} onConfirm={runAction} busy={actionBusy} />
      <DetailsModal session={details} onClose={() => setDetails(null)} />
    </>
  )
}

export default SessionManagement
