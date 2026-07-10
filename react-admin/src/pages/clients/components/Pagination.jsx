import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const ROWS_OPTIONS = [10, 20, 50]

// Build the list of page numbers to show, with ellipsis gaps.
// Always shows first & last; a window of pages around the current one.
// Returns a mix of numbers and the string '…'.
const buildPages = (current, totalPages) => {
  // current is 1-indexed here for readability.
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(totalPages - 1, current + 1)

  if (left > 2) pages.push('…')
  for (let p = left; p <= right; p++) pages.push(p)
  if (right < totalPages - 1) pages.push('…')

  pages.push(totalPages)
  return pages
}

// Server-side pagination. `page` is 0-indexed.
const Pagination = ({ page, pageSize, total, onPageChange, onPageSizeChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = page + 1 // 1-indexed for display
  const [goTo, setGoTo] = useState('')

  const goToPage = () => {
    const n = parseInt(goTo, 10)
    if (Number.isNaN(n)) return
    const clamped = Math.min(Math.max(1, n), totalPages)
    onPageChange(clamped - 1)
    setGoTo('')
  }

  const arrow =
    'flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/4 dark:text-gray-300 dark:hover:bg-white/8'

  const pages = buildPages(current, totalPages)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
      {/* Left: total */}
      <p className="text-sm text-gray-400 dark:text-gray-500">
        {total === 0 ? (
          'No results'
        ) : (
          <>
            Total <span className="font-medium text-gray-600 dark:text-gray-300">{total}</span>
          </>
        )}
      </p>

      {/* Center: numbered pages */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={arrow}
          disabled={current <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} strokeWidth={2.2} />
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span
              key={`ellipsis-${i}`}
              className="px-1.5 text-sm text-gray-400 dark:text-gray-600 select-none"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p - 1)}
              aria-current={p === current ? 'page' : undefined}
              className={`flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors ${
                p === current
                  ? 'border-transparent bg-linear-to-r from-blue-600 to-purple-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/4 dark:text-gray-300 dark:hover:bg-white/8'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          className={arrow}
          disabled={current >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={15} strokeWidth={2.2} />
        </button>
      </div>

      {/* Right: go-to + rows */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 dark:text-gray-500">Go to</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={goTo}
            onChange={(e) => setGoTo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goToPage()}
            placeholder="Page"
            className="h-8 w-16 rounded-lg border border-gray-200 bg-white px-2 text-center text-sm text-gray-900 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/10 dark:bg-white/4 dark:text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={goToPage}
            className="h-8 rounded-lg bg-linear-to-r from-blue-600 to-purple-600 px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Go
          </button>
        </div>

        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 dark:text-gray-500">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/10 dark:bg-white/4 dark:text-white"
            >
              {ROWS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}

export default Pagination
