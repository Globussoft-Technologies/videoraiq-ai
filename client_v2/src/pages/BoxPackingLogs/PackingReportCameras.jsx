import { Camera, Layers } from 'lucide-react';
import { Panel, label } from '@/pages/SolderLine/ui';
import { mediaUrl } from '@/lib/format';
import { formatPackingTotalTime, packingStats } from './boxPackingData';

export default function PackingReportCameras({ stations, selectedId, onSelect, rows }) {
  const cards = [{ id: 'all', name: 'All cameras', nvrName: `${stations.length} camera stations`, rows }, ...stations];
  return <Panel pad={false} style={{ padding: 0 }}>
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}><strong>Camera stations</strong><span style={{ marginLeft: 10, color: 'var(--tx3)', fontSize: 11 }}>Select a camera for the report</span></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 260px))', gap: 12, padding: 14 }}>
      {cards.map((station) => {
        const active = station.id === selectedId;
        const stats = packingStats(station.rows);
        const latest = station.rows.reduce((result, row) => !result || new Date(row.time) > new Date(result.time) ? row : result, null);
        const image = station.id !== 'all' && (latest?.Image || latest?.image || latest?.imageUrl);
        const Icon = station.id === 'all' ? Layers : Camera;
        return <button key={station.id} type="button" aria-pressed={active} onClick={() => onSelect(station.id)} style={{ padding: 0, borderRadius: 13, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', color: 'var(--tx)', border: `1px solid ${active ? 'var(--blue)' : 'var(--bd)'}`, boxShadow: active ? '0 0 0 2px rgba(91,124,250,.12)' : 'none', background: active ? 'linear-gradient(180deg, rgba(91,124,250,.15), var(--bg2))' : 'var(--bg2)' }}>
          <div style={{ height: 132, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, rgba(91,124,250,.15), rgba(168,85,247,.08))', color: 'var(--blue)' }}>{image ? <img src={mediaUrl(image)} alt={`${station.name} recorded snapshot`} style={{ width: '100%', height: 132, objectFit: 'cover' }} /> : <Icon size={34} strokeWidth={1.4} />}</div>
          <div style={{ padding: 12 }}><div style={label}>{station.id === 'all' ? 'Report scope' : 'Camera'}</div><div style={{ marginTop: 5, fontWeight: 700, fontSize: 13, overflowWrap: 'anywhere' }}>{station.name}</div><div style={{ marginTop: 8, fontSize: 11, color: 'var(--tx3)', overflowWrap: 'anywhere' }}>{station.id === 'all' ? station.nvrName : `NVR: ${station.nvrName}`}</div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--bd)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><div><div style={{ ...label, fontSize: 8 }}>Boxes packed</div><strong style={{ display: 'block', marginTop: 5, color: 'var(--blue)' }}>{stats.boxes}</strong></div><div><div style={{ ...label, fontSize: 8 }}>Total time</div><strong style={{ display: 'block', marginTop: 5, color: 'var(--violet)' }}>{formatPackingTotalTime(station.rows)}</strong></div></div>
          </div>
        </button>;
      })}
    </div>
  </Panel>;
}
