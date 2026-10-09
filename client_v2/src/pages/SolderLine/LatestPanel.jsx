import { useState } from 'react';
import { Check, Minus, ImageOff } from 'lucide-react';
import { formatUtcInConfiguredTimezone } from '@/utils/timezone';
import { mediaUrl } from '@/lib/format';

function PanelSnapshot({ image, panelId }) {
  const [failed, setFailed] = useState(false);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: 'var(--bg2)', border: '1px solid var(--bd)', display: 'grid', placeItems: 'center' }}>
        {image && !failed ? (
          <a href={image} target="_blank" rel="noreferrer" title="Open latest panel snapshot" style={{ display: 'block', width: '100%', height: '100%' }}>
            <img src={image} alt={`Latest panel ${panelId} snapshot`} onError={() => setFailed(true)} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
          </a>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--tx3)', fontSize: 11 }}><ImageOff size={24} />{failed ? 'Snapshot could not be loaded' : 'No snapshot for this panel'}</div>
        )}
      </div>
      <div style={{ marginTop: 6, color: 'var(--tx3)', fontSize: 10 }}>Latest event snapshot · {panelId}</div>
    </div>
  );
}

export default function LatestPanel({ panel, pointsPerZone }) {
  const zones = Array.isArray(panel?.zones) ? panel.zones : [];
  const expected = Number.isInteger(pointsPerZone) && pointsPerZone > 0 ? pointsPerZone : null;
  if (!panel || !zones.length || !expected) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>Waiting for the latest panel event in this date range.</div>;
  }
  const total = zones.length * expected;
  const done = zones.reduce((sum, zone) => sum + (Number.isFinite(zone.done) ? Math.max(0, zone.done) : 0), 0);
  const complete = zones.every((zone) => Number.isFinite(zone.done) && zone.done >= expected);
  const progress = Math.min(100, done / total * 100);
  return (
    <section aria-label="Latest panel event" style={{ padding: 16 }}>
      <style>{`
        @keyframes solder-event-enter { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
        @keyframes solder-count-enter { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
        .solder-event-tile { animation: solder-event-enter .4s ease both; }
        .solder-event-mark { animation: solder-count-enter .4s ease both; }
        .solder-latest-content { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
        @media (max-width: 700px) { .solder-latest-content { grid-template-columns: minmax(0, 1fr); } }
        @media (prefers-reduced-motion: reduce) { .solder-event-tile, .solder-event-mark { animation: none !important; } .solder-event-progress { transition: none !important; } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <strong style={{ color: 'var(--tx)', fontSize: 13 }}>Latest panel event</strong>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', fontSize: 11 }}>{panel.panelId}</span>
        <span style={{ marginLeft: 'auto', color: complete ? 'var(--ok)' : 'var(--warn)', border: '1px solid currentColor', borderRadius: 5, padding: '3px 7px', fontSize: 10, fontWeight: 700 }}>{done}/{total} {complete ? 'COMPLETE' : 'COMPLETED'}</span>
      </div>
      <div className="solder-latest-content">
      <PanelSnapshot key={panel.Image || String(panel._id)} image={panel.Image ? mediaUrl(panel.Image) : ''} panelId={panel.panelId} />
      <div style={{ minWidth: 0 }}>
      <div key={String(panel._id || `${panel.panelId}-${panel.time}`)}>
        {zones.map((zone, zoneIndex) => (
          <div key={`${zone.zone}-${zoneIndex}`} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7, fontSize: 11 }}>
              <span style={{ background: zoneIndex % 2 ? '#a855f7' : '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>OP-{zoneIndex + 1}</span>
              <span style={{ color: 'var(--tx2)' }}>{zone.zone}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{zone.done ?? '—'}/{expected}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${expected}, minmax(0, 1fr))`, gap: 7 }}>
              {Array.from({ length: expected }, (_, index) => {
                const known = Number.isFinite(zone.done);
                const finished = known && index < zone.done;
                const color = finished ? '#00bf72' : 'var(--tx3)';
                return (
                  <div key={index} className="solder-event-tile" style={{ animationDelay: `${(zoneIndex * expected + index) * 70}ms`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 4px', borderRadius: 10, border: `1px solid ${finished ? '#00bf7270' : 'var(--bd)'}`, background: finished ? 'rgba(0,191,114,.09)' : 'var(--bg2)' }}>
                    <span className="solder-event-mark" style={{ animationDelay: `${(zoneIndex * expected + index) * 70 + 100}ms`, display: 'grid', placeItems: 'center', width: 27, height: 27, borderRadius: '50%', background: finished ? '#00bf72' : 'var(--bg1)', color: finished ? '#fff' : color, boxShadow: finished ? '0 0 12px #00bf7250' : 'none' }}>{finished ? <Check size={18} strokeWidth={3} /> : <Minus size={16} />}</span>
                    <strong style={{ color: 'var(--tx)', fontSize: 12 }}>Count {index + 1}</strong>
                    <span style={{ color, fontSize: 10 }}>{finished ? 'Completed' : known ? 'Not completed' : 'Unknown'}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 5, fontSize: 10, color: 'var(--tx3)' }}>Presence: {zone.presenceSec != null ? `${zone.presenceSec} s` : '—'}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 5, borderRadius: 5, overflow: 'hidden', background: 'var(--track)' }}><div className="solder-event-progress" style={{ height: '100%', width: `${progress}%`, transition: 'width .6s ease', background: 'linear-gradient(90deg, #22d3ee, #6366f1)' }} /></div>
      </div>
      </div>
      <div style={{ marginTop: 7, color: 'var(--tx3)', fontSize: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>Completed counts; exact point positions are not reported.</span>
        <time dateTime={panel.time}>{panel.time ? formatUtcInConfiguredTimezone(panel.time, 'DD MMM HH:mm:ss') : '—'}</time>
      </div>
    </section>
  );
}
