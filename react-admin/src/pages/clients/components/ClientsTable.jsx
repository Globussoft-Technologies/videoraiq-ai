import { ArrowUp, ArrowDown, ArrowDownUp } from 'lucide-react'
import ClientRow from './ClientRow'
import EmptyState from './EmptyState'

// `sortKey` maps to the API's sortBy values. Only DB-backed fields are
// sortable — plan / cameras / expireDate / status are enriched after the
// query server-side, so the API can't order by them.
const COLUMNS = [
  { key: 'name', label: 'Name', sortKey: 'name' },
  { key: 'email', label: 'Email', sortKey: 'email' },
  { key: 'plan', label: 'Plan' },
  { key: 'cameras', label: 'Cameras' },
  { key: 'expireDate', label: 'Expire Date' },
  { key: 'status', label: 'Status' },
]

const ClientsTable = ({ clients = [], searching = false, sortBy, sortOrder, onSort }) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,2fr)_150px_100px_150px_110px] gap-4 border-b border-gray-200 px-6 py-3 dark:border-white/8">
        {COLUMNS.map((col) => {
          const headerClass =
            'font-mono text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase dark:text-gray-600'

          if (!col.sortKey) {
            return (
              <span key={col.key} className={headerClass}>
                {col.label}
              </span>
            )
          }

          const active = sortBy === col.sortKey
          const Icon = !active ? ArrowDownUp : sortOrder === 'asc' ? ArrowUp : ArrowDown

          return (
            <button
              key={col.key}
              type="button"
              onClick={() => onSort(col.sortKey)}
              title={`Sort by ${col.label}`}
              className={`group flex items-center gap-1 text-left transition-colors ${headerClass} ${
                active
                  ? 'text-purple-600 dark:text-purple-300'
                  : 'hover:text-gray-600 dark:hover:text-gray-400'
              }`}
            >
              {col.label}
              <Icon
                size={12}
                strokeWidth={2.5}
                className={active ? '' : 'opacity-40 group-hover:opacity-70'}
              />
            </button>
          )
        })}
      </div>

      {/* Body */}
      {clients.length === 0 ? (
        <EmptyState searching={searching} />
      ) : (
        clients.map((client) => <ClientRow key={client.id} client={client} />)
      )}
    </div>
  )
}

export default ClientsTable
