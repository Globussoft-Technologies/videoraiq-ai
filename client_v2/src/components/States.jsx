import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

/** Centered spinner for in-card loading. */
export function Loading({ label = 'Loading…', className = '', minH = 120 }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 ${className}`}
      style={{ minHeight: minH, color: 'var(--tx3)' }}
    >
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--blue)' }} />
      <span style={{ fontSize: 11.5 }}>{label}</span>
    </div>
  );
}

/** Empty-state placeholder. */
export function Empty({ label = 'No data yet', icon: Icon = Inbox, minH = 120, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}
      style={{ minHeight: minH, color: 'var(--tx3)' }}
    >
      <Icon size={22} strokeWidth={1.6} />
      <span style={{ fontSize: 11.5 }}>{label}</span>
    </div>
  );
}

/** Error-state with optional retry. */
export function ErrorState({ error, onRetry, minH = 120, className = '' }) {
  const msg = error?.response?.data?.body?.message || error?.message || 'Something went wrong';
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}
      style={{ minHeight: minH, color: 'var(--tx2)' }}
    >
      <AlertTriangle size={22} strokeWidth={1.6} style={{ color: 'var(--crit)' }} />
      <span style={{ fontSize: 11.5, maxWidth: 260 }}>{msg}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 4,
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--blue)',
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Convenience wrapper: renders the right state for a useApi() result, or the
 * children (via a render prop) once data is ready.
 */
export function AsyncBoundary({ loading, error, isEmpty, onRetry, minH, emptyLabel, children }) {
  if (loading) return <Loading minH={minH} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} minH={minH} />;
  if (isEmpty) return <Empty label={emptyLabel} minH={minH} />;
  return typeof children === 'function' ? children() : children;
}
