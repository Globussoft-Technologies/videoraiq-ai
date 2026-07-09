import { Loader2 } from 'lucide-react'

// Shared loading placeholder: a spinner + message inside a tall card.
// Used by the data-backed pages (Clients, Client Config, Detection Catalog).
const LoadingState = ({ message = 'Loading…' }) => {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <Loader2
        size={36}
        strokeWidth={2}
        className="animate-spin text-purple-500 dark:text-purple-400"
      />
      <p className="text-sm text-gray-400 dark:text-gray-500">{message}</p>
    </div>
  )
}

export default LoadingState
