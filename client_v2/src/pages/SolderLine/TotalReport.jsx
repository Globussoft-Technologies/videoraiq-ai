import { Check, X, Minus } from 'lucide-react';
import SnapshotCell from './SnapshotCell';
import { mono, Waiting } from './ui';
import SortButton, { useTableSort } from './TableSort';

function PointResult({ point, value }) {
  if (value === '—') return <span style={{ color: 'var(--tx3)' }}>—</span>;
  const soldered = value === 'Soldered';
  const missed = value === 'Missed';
  const color = soldered ? '#00bf72' : missed ? '#ef4444' : '#64748b';
  return <div aria-label={`${point}: ${value}`} style={{ width: 60, minHeight: 48, padding: '4px 3px', lineHeight: 1.15, boxSizing: 'border-box', borderRadius: 7, border: `1px solid ${color}70`, background: `${color}12`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
    <span style={{ width: 16, height: 16, borderRadius: '50%', color: '#fff', background: color, display: 'grid', placeItems: 'center' }}>{soldered ? <Check size={11} strokeWidth={3} /> : missed ? <X size={11} strokeWidth={3} /> : <Minus size={11} />}</span>
    <strong style={{ fontSize: 10 }}>{point}</strong><span style={{ fontSize: 8, color, textAlign: 'center' }}>{value === 'Not reported' ? 'Unknown' : value}</span>
  </div>;
}

export default function TotalReport({ rows = [], sorting: suppliedSort }) {
  const localSort = useTableSort(rows);
  const sorting = suppliedSort || localSort;
  const shown = suppliedSort ? rows : localSort.rows;
  if (!rows.length) return <Waiting title="Nothing to report" minH={200}>No panel events in the selected period.</Waiting>;
  const headers = Object.keys(rows[0]);
  return <div style={{ overflowX: 'auto', minWidth: 0 }}>
    <table aria-label="Total reports" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead><tr>{headers.map(header => <th key={header} scope="col" aria-sort={sorting.directionFor(header)} style={{ ...mono, fontSize: 9, padding: '9px 6px', textAlign: 'left', color: 'var(--tx3)', fontWeight: 500, whiteSpace: 'nowrap', borderBottom: '1px solid var(--bd)' }}><SortButton column={header} sorting={sorting}>{header.toUpperCase()}</SortButton></th>)}</tr></thead>
      <tbody>{shown.map((row, index) => <tr key={index} style={{ borderBottom: '1px solid var(--bd)' }}>
        {headers.map(header => <td key={header} style={{ padding: '6px', verticalAlign: 'middle', whiteSpace: 'pre-line', lineHeight: '18px', ...(typeof row[header] === 'number' ? mono : {}), ...(['Panel', 'Time', 'Zone'].includes(header) ? { minWidth: header === 'Time' ? 120 : 95 } : {}) }}>
          {header === 'Snapshot' ? <SnapshotCell value={row[header]} /> : /^P\d+$/.test(header) ? <PointResult point={header} value={row[header]} /> : row[header]}
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
