import { VideoOff } from 'lucide-react';

export default function PackingStreamUnavailable() {
  return <div role="status" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center', background: 'var(--bg2)', color: 'var(--tx2)', boxSizing: 'border-box' }}>
    <VideoOff size={28} strokeWidth={1.4} style={{ color: 'var(--tx3)', marginBottom: 2 }} />
    <div style={{ fontSize: 14, fontWeight: 600 }}>Not streaming</div>
    <p style={{ maxWidth: 300, margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--tx3)' }}>Live video is currently unavailable.</p>
  </div>;
}
