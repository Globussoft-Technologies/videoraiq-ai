import ClientRow from './ClientRow'
import EmptyState from './EmptyState'

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'plan', label: 'Plan' },
  { key: 'cameras', label: 'Cameras' },
  { key: 'expireDate', label: 'Expire Date' },
  { key: 'status', label: 'Status' },
]

const ClientsTable = ({ clients = [], searching = false }) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,2fr)_150px_100px_150px_110px] gap-4 border-b border-gray-200 px-6 py-3 dark:border-white/8">
        {COLUMNS.map((col) => (
          <span
            key={col.key}
            className="font-mono text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase dark:text-gray-600"
          >
            {col.label}
          </span>
        ))}
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
