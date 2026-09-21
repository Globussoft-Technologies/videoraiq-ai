import { createPortal } from 'react-dom';
import { ShieldAlert } from 'lucide-react';

export default function PermissionClosureDialog({ notice, onClose }) {
  if (!notice || typeof document === 'undefined') return null;

  const cameras = Array.isArray(notice.cameras) ? notice.cameras : [];
  const names = cameras
    .map((camera) => camera?.name || camera?.cameraName)
    .filter(Boolean);
  const detectionName = notice.detectionName || 'This detection';
  const cameraText = names.length === 1
    ? names[0]
    : names.join(', ');

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="permission-closure-title"
      aria-describedby="permission-closure-description"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10020,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(6,9,15,.68)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 22,
          border: '1px solid var(--bd2)',
          borderRadius: 16,
          background: 'var(--bg1solid)',
          boxShadow: '0 24px 64px rgba(0,0,0,.45)',
          color: 'var(--tx)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span
            style={{
              width: 38,
              height: 38,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 11,
              background: 'rgba(245,158,11,.14)',
              color: '#f59e0b',
            }}
          >
            <ShieldAlert size={19} />
          </span>

          <div style={{ minWidth: 0 }}>
            <h2
              id="permission-closure-title"
              style={{ margin: '1px 0 7px', fontSize: 16, fontWeight: 650 }}
            >
              Detection closed by permission update
            </h2>
            <p
              id="permission-closure-description"
              style={{ margin: 0, color: 'var(--tx2)', fontSize: 13, lineHeight: 1.6 }}
            >
              Based on updated permissions, <strong style={{ color: 'var(--tx)' }}>{detectionName}</strong>{' '}
              was turned off {names.length > 1 ? 'for these cameras' : 'for this camera'}:
              {' '}<strong style={{ color: 'var(--tx)' }}>{cameraText || 'the affected camera'}</strong>.
            </p>
            <p style={{ margin: '8px 0 0', color: 'var(--tx3)', fontSize: 12, lineHeight: 1.5 }}>
              This change was applied automatically by your administrator.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            style={{
              minWidth: 88,
              padding: '9px 18px',
              border: 'none',
              borderRadius: 9,
              background: 'var(--brand)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
