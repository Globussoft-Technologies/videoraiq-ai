import Pagination from '@/components/Pagination';

/** Footer row: total count, page controls, and rows-per-page selector. */
const UsersPagination = ({ show, currentPage, totalPages, totalCount, limit, onPageChange, onLimitChange }) => {
  if (!show) return null;
  return (
    <div className="mt-6 pt-4 border-t border-[var(--bd)] grid items-center gap-4" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
      <div className="text-sm text-[var(--tx2)] bg-[var(--bg2)] px-2.5 py-1.5 rounded-md inline-flex items-center gap-2 w-fit">
        Total users -
        <span className="text-[var(--blue)] font-medium bg-[var(--blue)]/10 px-2.5 py-1 rounded-md">
          {totalCount}
        </span>
      </div>
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} className="flex justify-center" />
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-xs text-[var(--tx3)] whitespace-nowrap">Rows:</span>
        <select
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className="h-9 border border-[var(--bd)] rounded-lg text-xs text-[var(--tx)] bg-[var(--bg2)] px-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
        >
          {[10, 20, 30, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default UsersPagination;
