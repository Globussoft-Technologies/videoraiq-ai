import { useMemo } from 'react';
import { X } from 'lucide-react';
import { mediaUrl } from '@/lib/format';
import { alertRows } from './solderLineData';
import { BAD, mono, Panel, Waiting } from './ui';
import SnapshotCell from './SnapshotCell';
import SortButton, { useTableSort } from './TableSort';

const columns = ['Panel', 'Soldered joints', 'Missed joints', 'Time', 'Image'];
const valueFor = (row, key) => ({ Panel: row.panelId, 'Soldered joints': row.completedJoints, 'Missed joints': row.missedJoints, Time: row.start, Image: row.image })[key];

export default function MissedSolderAlerts({ station, hasData }) {
  const rows = useMemo(() => alertRows({ stations: [station] }).filter(row => row.type === 'missed'), [station]);
  const sorting = useTableSort(rows, station._id, valueFor);
  const missed = rows.reduce((sum, row) => sum + row.missedJoints, 0);
  return <Panel pad={false} style={{ minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Missed solder alerts</span>
      <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: BAD, border: `1px solid ${BAD}73`, borderRadius: 5, padding: '2px 8px' }}>{missed}</span>
      <span style={{ marginLeft: 'auto', ...mono, fontSize: 10.5, color: 'var(--tx3)' }}>Across all workers</span>
    </div>
    <div style={{ maxHeight: 320, overflow: 'auto' }}>
      {!rows.length ? <div style={{ padding: 16 }}>{hasData ? <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No missed solder alerts in this range.</span> : <Waiting minH={120}>Missed-solder alerts appear here when a panel has fewer completed joints than required.</Waiting>}</div>
        : <table aria-label="Missed solder alerts" style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{columns.map(column => <th key={column} scope="col" aria-sort={sorting.directionFor(column)} style={{ ...mono, textAlign: 'left', fontSize: 9, padding: '8px 14px', fontWeight: 500, position: 'sticky', top: 0, background: 'var(--bg1solid)', zIndex: 1 }}>
            <SortButton column={column} sorting={sorting}>{column.toUpperCase()}</SortButton>
          </th>)}</tr></thead>
          <tbody>{sorting.rows.map(row => <tr key={row._id} style={{ borderBottom: '1px solid var(--bd)' }}>
            <td style={{ padding: '8px 14px' }}><span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}><X size={16} color={BAD} aria-hidden="true" />{row.panelId}</span></td>
            <td style={{ padding: '8px 14px', ...mono }}>{row.completedJoints}</td>
            <td style={{ padding: '8px 14px', ...mono, color: BAD }}>{row.missedJoints}</td>
            <td style={{ padding: '8px 14px', ...mono, whiteSpace: 'nowrap' }}>{row.start.format('DD MMM HH:mm:ss')}</td>
            <td style={{ padding: '8px 14px' }}><SnapshotCell value={mediaUrl(row.image)} /></td>
          </tr>)}</tbody>
        </table>}
    </div>
  </Panel>;
}
