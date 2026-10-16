import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { sortRows } from '@/pages/SolderLine/sorting';

export function PackingSortHeader({ column, children, sort, onSort }) {
  const active = sort?.key === column;
  const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return <button type="button" onClick={() => onSort(column)}
    title={`Sort by ${children}${active ? ` (${sort.direction === 'asc' ? 'ascending' : 'descending'})` : ''}`}
    aria-label={`Sort by ${children}${active ? `, ${sort.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28, padding: '2px 0', border: 0, background: 'transparent', color: active ? 'var(--blue)' : 'var(--tx2)', font: 'inherit', fontWeight: 600, letterSpacing: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer' }}>
    {children}<Icon size={14} strokeWidth={2} style={{ flexShrink: 0, color: active ? 'var(--blue)' : 'var(--tx2)' }} />
  </button>;
}

export function usePackingSort(rows, initial = { key: null, direction: 'asc' }, getValue) {
  const [sort, setSort] = useState(initial);
  const onSort = (key) => setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const sortedRows = useMemo(() => sortRows(rows, sort, getValue), [rows, sort, getValue]);
  const header = (key, text) => <PackingSortHeader column={key} sort={sort} onSort={onSort}>{text}</PackingSortHeader>;
  return { rows: sortedRows, sort, onSort, header };
}
