import { useState } from 'react';
import { Hourglass } from 'lucide-react';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';
import { mediaUrl } from '@/lib/format';
import { opColor } from './solderLineData';

/** Full-screen snapshot viewer with previous/next over `items` (alerts with `_id` + `image`). */
export function SnapshotPreview({ items, openId, onOpen, onClose, fullscreenOnOpen = false }) {
  const [loading, setLoading] = useState(true);
  const list = items.filter((x) => x.image);
  const idx = list.findIndex((x) => x._id === openId);
  if (idx < 0) return null;
  const go = (d) => { setLoading(true); onOpen(list[idx + d]._id); };
  return (
    <ImagePreviewModal
      previewImage={mediaUrl(list[idx].image)}
      imageKey={list[idx]._id}
      loading={loading}
      setLoading={setLoading}
      hasPrevious={idx > 0}
      hasNext={idx < list.length - 1}
      onPrevious={() => go(-1)}
      onNext={() => go(1)}
      position={idx + 1}
      total={list.length}
      onClose={onClose}
      initialFullscreen={fullscreenOnOpen}
    />
  );
}

// Small building blocks shared by the three Solder Line views. Colours and
// type follow the app theme tokens (theme/tokens.css).
export const BAD = '#ff4d4d';
export const OK = '#22c55e';
export const WARN = '#f5a623';
export const CY = '#22d3ee';
export const mono = { fontFamily: 'var(--mono)' };
export const label = { ...mono, fontSize: 9.5, letterSpacing: '.1em', color: 'var(--tx3)', textTransform: 'uppercase' };

export function Panel({ children, style, pad = true }) {
  return (
    <div style={{ borderRadius: 16, background: 'var(--bg1)', border: '1px solid var(--bd)', overflow: 'hidden', ...(pad ? { padding: '16px 18px' } : {}), ...style }}>
      {children}
    </div>
  );
}

export function PanelHead({ title, sub, right, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, boxShadow: `0 0 8px ${dot}` }} />}
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>{title}</span>
      {sub && <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{sub}</span>}
      {right && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{right}</span>}
    </div>
  );
}

export function SectionHead({ n, color, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
      <span style={{ ...mono, fontSize: 11, fontWeight: 700, color }}>{n}</span>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 19, letterSpacing: '-.01em' }}>{title}</span>
      <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>{sub}</span>
    </div>
  );
}

export function Kpi({ label: text, value, unit, sub, color, valueColor }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', padding: '15px 16px 14px', borderRadius: 15, background: 'var(--bg1)', border: '1px solid var(--bd)' }}>
      <div style={{ position: 'absolute', right: -30, top: -30, width: 110, height: 110, borderRadius: '50%', background: `radial-gradient(circle, ${color}33, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        <span style={{ ...label, whiteSpace: 'nowrap' }}>{text}</span>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 9 }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 28, letterSpacing: '-.02em', lineHeight: 1, color: valueColor || 'var(--tx)' }}>{value}</span>
        {unit && <span style={{ ...mono, fontSize: 11, color: 'var(--tx3)' }}>{unit}</span>}
      </div>
      {sub && <div style={{ position: 'relative', fontSize: 11, color: 'var(--tx3)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );
}

export const KpiGrid = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(176px, 1fr))', gap: 12 }}>{children}</div>
);

export function OpBadge({ op, code }) {
  return (
    <span style={{ ...mono, fontSize: 10.5, fontWeight: 700, color: '#fff', background: opColor(op), borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', justifySelf: 'start' }}>
      {code || `OP-${op + 1}`}
    </span>
  );
}

export function StatusPill({ active, text, color }) {
  const c = color || (active ? BAD : OK);
  return (
    <span style={{ ...mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', justifySelf: 'start', padding: '3px 8px', borderRadius: 5, color: c, border: `1px solid ${c}88`, whiteSpace: 'nowrap', animation: active ? 'vq-blink 1.4s ease-in-out infinite' : 'none' }}>
      {text || (active ? 'ACTIVE' : 'RESOLVED')}
    </span>
  );
}

export function Chip({ on, color = '#475569', onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
      ...mono, fontSize: 10.5, fontWeight: 700, color: on ? '#fff' : 'var(--tx3)', background: on ? color : 'var(--bg2)',
      border: `1px solid ${on ? 'transparent' : 'var(--bd2)'}`,
    }}>
      {children}
    </button>
  );
}

/** Shown where a section needs data DS does not send yet. */
export function Waiting({ title = 'Waiting for data', children, minH = 160 }) {
  return (
    <div style={{ minHeight: minH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: 18, borderRadius: 12, border: '1px dashed var(--bd2)', color: 'var(--tx3)' }}>
      <Hourglass size={18} />
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx2)' }}>{title}</span>
      <span style={{ fontSize: 11.5, maxWidth: 420, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

export const fmt = (v, digits = 0) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(digits));
