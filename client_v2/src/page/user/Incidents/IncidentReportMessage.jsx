export default function IncidentReportMessage({ item, compact = false, lightbox = false }) {
  const message = typeof item?.report?.description === 'string' ? item.report.description.trim() : '';
  if (item?.report?.status !== true || !message) return null;

  return (
    <div title={compact ? message : undefined} style={{
      gridColumn: '1 / -1', minWidth: 0, maxWidth: lightbox ? 560 : '100%', fontSize: compact ? 11 : 12,
      lineHeight: 1.5, color: lightbox ? 'rgba(255,255,255,.8)' : 'var(--tx2)',
      whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      ...(compact ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' } : {}),
    }}>
      <span style={{ fontWeight: 600 }}>Reported message: </span>{message}
    </div>
  );
}
