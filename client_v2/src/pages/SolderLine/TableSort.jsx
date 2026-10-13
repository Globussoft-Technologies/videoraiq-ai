import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { sortRows } from './sorting.js';

export function useTableSort(rows, resetKey = '', getValue) {
  const [selection, setSelection] = useState({ scope: resetKey, key: null, direction: 'asc' });
  const sort = selection.scope === resetKey ? selection : { scope: resetKey, key: null, direction: 'asc' };
  const sorted = useMemo(() => sortRows(rows, sort, getValue), [rows, sort.key, sort.direction, getValue]);
  return {
    sort,
    rows: sorted,
    resetKey: `${sort.key || ''}:${sort.direction}`,
    directionFor: key => sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none',
    toggle: key => setSelection({ scope: resetKey, key, direction: sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc' }),
  };
}

export default function SortButton({ column, sorting, children }) {
  const active = sorting.sort.key === column;
  const direction = active && sorting.sort.direction === 'asc' ? 'descending' : 'ascending';
  const Icon = !active ? ArrowUpDown : sorting.sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return <button type="button" onClick={() => sorting.toggle(column)} title={`Sort ${column} ${direction}`} aria-label={`Sort ${column} ${direction}`}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, padding: '3px 0', background: 'transparent', color: active ? 'var(--blue)' : 'inherit', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer' }}>
    {children ?? column}<Icon size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
  </button>;
}
