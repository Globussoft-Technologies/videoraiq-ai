import { Construction } from 'lucide-react';
import { VIEW_META } from '../../../layout/nav.config';

/**
 * Temporary placeholder for V2 views not yet migrated. The route exists so the
 * sidebar navigation is fully functional while views are ported one by one.
 * NOTE: the equivalent V1 page remains fully available under its legacy route.
 */
export default function Placeholder({ viewKey, legacyPath }) {
  const meta = VIEW_META[viewKey] || {};
  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 14, textAlign: 'center' }}>
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg,rgba(59,130,246,.16),rgba(168,85,247,.1))',
          border: '1px solid var(--bd)',
        }}
      >
        <Construction size={24} strokeWidth={1.6} style={{ color: 'var(--blue)' }} />
      </div>
      <div>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 18 }}>{meta.title || 'Coming soon'}</div>
        <div style={{ fontSize: 12.5, color: 'var(--tx3)', marginTop: 4, maxWidth: 420 }}>
          This V2 view is being migrated next. {legacyPath ? 'The existing version is still available in the current app.' : ''}
        </div>
      </div>
      {legacyPath && (
        <a
          href={legacyPath}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', textDecoration: 'none', border: '1px solid var(--bd)', borderRadius: 9, padding: '8px 14px', background: 'var(--bg2)' }}
        >
          Open current version →
        </a>
      )}
    </div>
  );
}
