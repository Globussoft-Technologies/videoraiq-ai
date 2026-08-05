import { AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(6,9,15,.68)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      backdropFilter: 'blur(3px)',
      pointerEvents: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: 400, background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
        borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(239,68,68,.13)', color: '#ef4444', flexShrink: 0,
          }}>
            <AlertTriangle size={18} />
          </span>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>{title}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 20 }}>
          {children}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              height: 38, padding: '0 16px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
              fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              height: 38, padding: '0 18px', borderRadius: 9, background: '#ef4444',
              border: 'none', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
