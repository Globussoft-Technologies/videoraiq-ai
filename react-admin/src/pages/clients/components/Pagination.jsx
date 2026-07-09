import { ChevronLeft, ChevronRight } from 'lucide-react'

// Server-side pagination controls. `page` is 0-indexed.
const Pagination = ({ page, pageSize, total, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasPrev = page > 0
  const hasNext = page < totalPages - 1

  // Human-friendly range: "1–10 of 25"
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, total)

  const btn =
    'flex h-8 items-center gap-1 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/4 dark:text-gray-300 dark:hover:bg-white/8'

  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-sm text-gray-400 dark:text-gray-500">
        {total === 0 ? 'No results' : (
          <>
            Showing <span className="font-medium text-gray-600 dark:text-gray-300">{from}</span>–
            <span className="font-medium text-gray-600 dark:text-gray-300">{to}</span> of{' '}
            <span className="font-medium text-gray-600 dark:text-gray-300">{total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          disabled={!hasPrev}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={15} strokeWidth={2.2} />
          Prev
        </button>

        <span className="px-1 text-sm text-gray-400 dark:text-gray-500">
          Page <span className="font-medium text-gray-600 dark:text-gray-300">{page + 1}</span> of{' '}
          <span className="font-medium text-gray-600 dark:text-gray-300">{totalPages}</span>
        </span>

        <button
          type="button"
          className={btn}
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight size={15} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}

export default Pagination
