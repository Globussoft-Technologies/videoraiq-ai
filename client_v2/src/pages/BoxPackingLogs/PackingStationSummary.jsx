import { Camera, Check, Users } from 'lucide-react';
import { label, OpBadge } from '@/pages/SolderLine/ui';

export default function PackingStationSummary({ stations, selected, onSelect }) {
  if (!stations.length) return null;
  const index = Math.max(0, Math.min(selected, stations.length - 1));
  const station = stations[index];
  const workers = station.workers || [];
  return <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'stretch', gap: 14, boxSizing: 'border-box', padding: 14, borderRadius: 16, background: 'linear-gradient(110deg, rgba(59,130,246,.16), rgba(168,85,247,.09) 58%, rgba(255,255,255,.18))', border: '1px solid rgba(59,130,246,.38)', boxShadow: '0 8px 22px rgba(59,130,246,.07)' }}>
    <div style={{ minWidth: 0, padding: '7px 8px' }}>
      <div style={{ ...label, fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em' }}>VIEWING STATION</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}><span style={{ display: 'grid', placeItems: 'center', width: 31, height: 31, flexShrink: 0, borderRadius: 9, color: 'var(--blue)', background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.2)' }}><Camera size={17} /></span><span style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700, overflowWrap: 'anywhere' }}>{station.name}</span></div>
      {station.nvrName && <div style={{ margin: '7px 0 0 40px', fontSize: 11, color: 'var(--tx2)' }}>NVR: {station.nvrName}</div>}
    </div>
    <div style={{ minWidth: 0, padding: '7px 12px', borderLeft: '1px solid rgba(99,102,241,.18)', borderRight: '1px solid rgba(99,102,241,.18)' }}>
      <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5 }}><Users size={13} />WORKERS · {workers.length}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>{workers.length ? workers.map((worker, i) => <OpBadge key={worker} op={i} code={worker} />) : <span style={{ fontSize: 11, color: 'var(--tx3)' }}>No workers recorded</span>}</div>
    </div>
    <div style={{ minWidth: 0, padding: '5px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
        <div><div style={{ ...label, fontSize: 9.5, letterSpacing: '.12em' }}>CAMERAS</div><div style={{ marginTop: 3, fontSize: 11, color: 'var(--tx3)' }}>Choose a live viewing feed</div></div>
        <span style={{ ...label, padding: '4px 7px', borderRadius: 99, color: 'var(--blue)', background: 'rgba(59,130,246,.1)', whiteSpace: 'nowrap' }}>{index + 1} / {stations.length}</span>
      </div>
      <div role="group" aria-label="Available cameras" style={{ display: 'flex', flexWrap: 'nowrap', gap: 7, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 4, overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }}>
        {stations.map((item, i) => {
          const active = i === index;
          return <button key={item.id} type="button" aria-pressed={active} onClick={() => onSelect(i)} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 clamp(180px, 48%, 240px)', minWidth: 0, minHeight: 42, padding: '7px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', border: `1px solid ${active ? '#6366f1' : 'var(--bd2)'}`, color: active ? '#fff' : 'var(--tx2)', background: active ? 'linear-gradient(135deg, #4f46e5, #a855f7)' : 'var(--bg2)', boxShadow: active ? '0 5px 12px rgba(79,70,229,.2)' : 'none', transition: 'border-color .18s ease, background .18s ease, box-shadow .18s ease' }}>
            <span style={{ ...label, display: 'grid', placeItems: 'center', width: 23, height: 23, flexShrink: 0, borderRadius: 7, color: active ? '#4f46e5' : 'var(--tx3)', background: active ? '#fff' : 'var(--bg1)' }}>{active ? <Check size={13} strokeWidth={3} /> : String(i + 1).padStart(2, '0')}</span>
            <span style={{ minWidth: 0, overflow: 'hidden' }}><strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{item.name}</strong>{item.nvrName && <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, opacity: .75 }}>{item.nvrName}</span>}</span>
          </button>;
        })}
      </div>
    </div>
  </div>;
}
