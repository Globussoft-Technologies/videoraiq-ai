import { useEffect, useState } from 'react';
import Pagination from '@/components/Pagination';
import { paginateRows } from './pagination';

export function useSolderPagination(rows, resetKey) {
  const [pageSize, setSize] = useState(10);
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const page = selection.key === resetKey ? selection.page : 1;
  const result = paginateRows(rows, page, pageSize);
  const { currentPage } = result;

  // Reset for new filters, but preserve the page during background refreshes.
  // Also clamp a page immediately when the result set becomes smaller.
  useEffect(() => {
    setSelection((previous) => previous.key === resetKey && previous.page === currentPage
      ? previous : { key: resetKey, page: currentPage });
  }, [resetKey, currentPage]);

  return {
    ...result,
    pageSize,
    onPageChange: (nextPage) => setSelection({ key: resetKey, page: nextPage }),
    onPageSizeChange: (size) => {
      setSize(size);
      setSelection({ key: resetKey, page: 1 });
    },
  };
}

export default function SolderPagination({ pagination, label }) {
  const { total, start, end, currentPage, totalPages, pageSize, onPageChange, onPageSizeChange } = pagination;
  return (
    <nav aria-label={`${label} pagination`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--tx2)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          Show entries
          <select aria-label={`${label} entries per page`} value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--bd2)', cursor: 'pointer' }}>
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <span aria-live="polite">Showing {start}–{end} of {total} entries</span>
      </div>
      {total > 0 && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} className="flex justify-center" />}
    </nav>
  );
}
