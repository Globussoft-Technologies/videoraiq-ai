import SnapshotCell from './SnapshotCell';
import SortButton, { useTableSort } from './TableSort';
import { mono, Waiting } from './ui';

export default function ReportTable({ rows = [], sorting: suppliedSort, label = 'Solder report' }) {
  const localSort = useTableSort(rows);
  const sorting = suppliedSort || localSort;
  const shown = suppliedSort ? rows : localSort.rows;
  if (!rows.length) return <Waiting title="Nothing to report" minH={200}>No data for this report in the selected period.</Waiting>;
  const headers = Object.keys(rows[0]);
  return <div style={{ overflowX: 'auto', minWidth: 0 }}>
    <table aria-label={label} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
      <thead><tr>{headers.map(header => <th key={header} scope="col" aria-sort={sorting.directionFor(header)} style={{ textAlign: 'left', padding: '8px 6px', ...mono, fontSize: 9, letterSpacing: '.07em', fontWeight: 500, color: 'var(--tx3)', borderBottom: '1px solid var(--bd)' }}>
        <SortButton column={header} sorting={sorting}>{header.toUpperCase()}</SortButton>
      </th>)}</tr></thead>
      <tbody>{shown.map((row, index) => <tr key={index} style={{ borderBottom: '1px solid var(--bd)' }}>
        {headers.map(header => <td key={header} style={{ padding: '9px 6px', ...(typeof row[header] === 'number' ? mono : {}) }}>{header === 'Snapshot' ? <SnapshotCell value={row[header]} /> : row[header]}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
