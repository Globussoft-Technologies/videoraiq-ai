import { mediaUrl } from '@/lib/format';
import { clock, dur } from './solderLineData';
import { mono, OpBadge } from './ui';
import SortButton, { useTableSort } from './TableSort';

const headers = ['Operator', 'Alert time', 'Condition', 'Returned', 'Duration', 'Image'];
const valueFor = (row, key) => ({ Operator: row.op, 'Alert time': row.start, Condition: row.description || `${row.zone} desk empty`, Returned: row.end, Duration: row.durSec, Image: row.image })[key];

export default function AbsenceLogTable({ operator: o, absences, singleDay, onPreview }) {
  const sorting = useTableSort([...absences].reverse().filter(row => row.op === o.i), o.zone, valueFor);
  const when = value => singleDay ? clock(value) : value.format('DD MMM HH:mm:ss');
  return <div style={{ border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden', minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 12, borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
      <OpBadge op={o.i} code={o.code} /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{o.zone}</span>
      <span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: 'var(--tx3)' }}>{sorting.rows.length} alerts · {dur(o.away)} unavailable</span>
    </div>
    <div style={{ overflow: 'auto', maxHeight: 360 }}>
      <table aria-label={`${o.code} absence alert log`} style={{ width: '100%', minWidth: 650, borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg1solid)' }}><tr style={{ ...mono, fontSize: 9, letterSpacing: '.08em', color: 'var(--tx3)', borderBottom: '1px solid var(--bd)' }}>
          {headers.map(header => <th key={header} scope="col" aria-sort={sorting.directionFor(header)} style={{ padding: 10, fontWeight: 500, textTransform: 'uppercase' }}><SortButton column={header} sorting={sorting} /></th>)}
        </tr></thead>
        <tbody>{!sorting.rows.length && <tr><td colSpan={6} style={{ padding: 18, color: 'var(--tx3)' }}>No absence alerts for {o.code} in this range.</td></tr>}
          {sorting.rows.map(row => <tr key={row._id} style={{ borderBottom: '1px solid var(--bd)' }}>
            <td style={{ padding: 10 }}><OpBadge op={row.op} /></td>
            <td style={{ padding: 10, ...mono, fontWeight: 600, whiteSpace: 'nowrap' }}>{when(row.start)}</td>
            <td style={{ padding: 10, color: 'var(--tx2)' }}>{row.description || `${row.zone} desk empty`}</td>
            <td style={{ padding: 10, ...mono, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{row.end ? when(row.end) : 'Not returned'}</td>
            <td style={{ padding: 10, ...mono, fontWeight: 700, whiteSpace: 'nowrap' }}>{dur(row.durSec)}</td>
            <td style={{ padding: '8px 10px' }}>{row.image ? <button type="button" onClick={() => onPreview(row._id)} aria-label={`View snapshot for ${o.code} at ${clock(row.start)}`} title="View image" style={{ display: 'block', width: 64, height: 40, padding: 0, border: '1px solid var(--bd2)', borderRadius: 5, overflow: 'hidden', background: 'var(--bg2)', cursor: 'zoom-in' }}>
              <img src={mediaUrl(row.image)} alt={`${o.zone} absence snapshot`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button> : <span style={{ color: 'var(--tx3)', fontSize: 11 }}>No image</span>}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
