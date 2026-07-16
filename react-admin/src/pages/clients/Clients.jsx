import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import Topbar from '../../layout/Topbar'
import ClientsTable from './components/ClientsTable'
import Pagination from './components/Pagination'
import LoadingState from '../../components/UI/LoadingState'
import { getClients } from './apis/get'
import { notifyApiError } from '../../utils/apiError'

const DEFAULT_PAGE_SIZE = 10

// Rotating avatar gradients so rows are visually distinct.
const AVATAR_COLORS = [
  'from-blue-500 to-purple-500',
  'from-purple-500 to-pink-500',
  'from-teal-400 to-cyan-500',
  'from-pink-500 to-rose-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-green-500',
]

// Map an API admin record → the shape ClientRow expects.
// adminId and userId are intentionally dropped.
const mapAdmin = (admin, index) => ({
  id: admin.adminId,
  name: admin.name,
  email: admin.email,
  plan: admin.plan,
  cameras: admin.cameras,
  expireDate: admin.expireDate,
  status: admin.status,
  avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
})

const Clients = () => {
  const [clients, setClients] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  // Server-side sort. Only name/email are sortable (see ClientsTable).
  const [sortBy, setSortBy] = useState('')
  const [sortOrder, setSortOrder] = useState('asc')

  // Toggle direction when re-clicking the same column; new column starts asc.
  const handleSort = (key) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortOrder('asc')
    }
    setPage(0)
  }

  // Debounce the search input, and reset to the first page on a new search.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  // Fetch a page whenever the page or the debounced search changes.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await getClients(page * pageSize, pageSize, debouncedQuery, sortBy, sortOrder)
        if (cancelled) return
        const data = res?.body?.data ?? res?.data ?? {}
        const admins = Array.isArray(data.admins) ? data.admins : []
        setClients(admins.map(mapAdmin))
        setTotal(data.totalCount ?? admins.length)
      } catch (err) {
        if (cancelled) return
        setError(notifyApiError(err, 'Failed to load clients'))
        setClients([])
        setTotal(0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [page, pageSize, debouncedQuery, sortBy, sortOrder])

  return (
    <>
      <Topbar eyebrow="PLATFORM" title="Clients" />

      <div className="px-8 py-6">
        {/* Controls */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients by name or email…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/8 dark:bg-white/4 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-purple-400/60"
            />
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400 dark:text-gray-500">
              {total} {total === 1 ? 'client' : 'clients'}
            </span>
            {/* <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus size={16} strokeWidth={2.4} />
              Onboard Client
            </button> */}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        ) : loading ? (
          <LoadingState message="Loading clients…" />
        ) : (
          <>
            <ClientsTable
              clients={clients}
              searching={debouncedQuery.length > 0}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
            {total > 0 && (
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
        )}
      </div>
    </>
  )
}

export default Clients
