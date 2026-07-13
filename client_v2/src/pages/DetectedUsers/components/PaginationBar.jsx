import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ROWS_OPTIONS } from '../detectedUtils';

// Pagination footer matching the V2 log pages: a "Total" badge, gradient active
// page buttons, a go-to input and a rows-per-page selector. Theme-aware.
const PaginationBar = ({
  page,
  totalPages,
  onPageChange,
  limit,
  onLimitChange,
  totalCount = 0,
  totalLabel = 'Total',
  rowsOptions = ROWS_OPTIONS,
}) => {
  const [pageInput, setPageInput] = useState('');

  const handlePageChange = (p) => {
    if (p < 1 || p > totalPages || p === page) return;
    onPageChange(p);
  };

  const handleGoToPage = () => {
    const p = parseInt(pageInput, 10);
    if (!Number.isFinite(p)) return;
    handlePageChange(Math.min(Math.max(p, 1), totalPages));
    setPageInput('');
  };

  const pages = (() => {
    const arr = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) arr.push(i);
    } else if (page <= 3) {
      for (let i = 1; i <= 4; i++) arr.push(i);
      if (totalPages > 5) arr.push('...');
      arr.push(totalPages);
    } else if (page >= totalPages - 2) {
      arr.push(1);
      if (totalPages > 5) arr.push('...');
      for (let i = totalPages - 3; i <= totalPages; i++) arr.push(i);
    } else {
      arr.push(1, '...');
      for (let i = page - 1; i <= page + 1; i++) arr.push(i);
      arr.push('...', totalPages);
    }
    return arr;
  })();

  const edgeBtn = (disabled) =>
    `flex items-center justify-center w-8 h-8 rounded ${
      disabled
        ? 'text-[var(--tx3)] cursor-not-allowed'
        : 'text-[var(--tx2)] hover:bg-[var(--bg2)] cursor-pointer'
    }`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 items-center gap-4">
      {/* Total badge */}
      <div className="text-sm text-[var(--tx2)] bg-[var(--bg2)] px-3 py-1.5 font-normal rounded-[8px] w-fit inline-flex items-center gap-2">
        {totalLabel} -{' '}
        <span className="text-[var(--violet)] font-semibold bg-[var(--violet)]/10 px-2.5 py-1 rounded-md">
          {totalCount}
        </span>
      </div>

      {/* Page numbers */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
          className={edgeBtn(page === 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pages.map((p, index) =>
          p === '...' ? (
            <span
              key={`ellipsis-${index}`}
              className="flex items-center justify-center w-8 h-8 text-[var(--tx3)]"
            >
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => handlePageChange(p)}
              className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium cursor-pointer ${
                page === p
                  ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white'
                  : 'text-[var(--tx2)] hover:bg-[var(--bg2)]'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => handlePageChange(page + 1)}
          disabled={page === totalPages}
          className={edgeBtn(page === totalPages)}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Go-to + rows */}
      <div className="flex items-center justify-center lg:justify-end gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--tx2)] whitespace-nowrap">Go to:</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGoToPage()}
            placeholder="Page"
            className="h-9 w-16 border border-[var(--bd)] rounded-lg text-xs text-[var(--tx)] bg-[var(--bg2)] px-2 focus:outline-none focus:border-[var(--brand)]"
          />
          <button
            type="button"
            onClick={handleGoToPage}
            disabled={pageInput === ''}
            className="h-9 px-3 rounded-lg text-xs font-medium bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 transition-opacity cursor-pointer"
          >
            Go
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--tx2)] whitespace-nowrap">Rows:</span>
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="h-9 border border-[var(--bd)] rounded-lg text-xs text-[var(--tx)] bg-[var(--bg2)] px-2 cursor-pointer focus:outline-none focus:border-[var(--brand)]"
          >
            {rowsOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default PaginationBar;
