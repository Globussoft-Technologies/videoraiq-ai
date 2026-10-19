export default function MobilePageLoader() {
  return (
    <div role="status" aria-live="polite" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#f5f7fb', color: '#475569', fontSize: 14 }}>
      <span>Opening your page…</span>
    </div>
  );
}
