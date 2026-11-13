export default function IncidentSummary({ item, cameraName, titleFallback = 'Incident', lightbox = false }) {
  const title = item.incidentName || titleFallback;
  const description = typeof item.description === 'string' && item.description.trim() ? item.description : '--';
  const camera = cameraName || item.channelData?.customName || item.channelData?.name || item.cameraName || '--';
  return <div style={{ display: 'flex', flexDirection: 'column', gap: lightbox ? 7 : 5, minWidth: 0, width: '100%' }}>
    <div title={title} style={{ fontSize: lightbox ? 20 : 13, fontWeight: lightbox ? 800 : 600, color: lightbox ? '#fff' : 'var(--tx)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{title}</div>
    <div title={lightbox ? undefined : description} style={{ fontSize: lightbox ? 13 : 12, lineHeight: 1.5, color: lightbox ? 'rgba(255,255,255,.8)' : 'var(--tx2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      ...(!lightbox ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' } : {}),
    }}>{description}</div>
    <div title={camera} style={{ fontSize: lightbox ? 12 : 11, color: lightbox ? 'rgba(255,255,255,.65)' : 'var(--tx3)', overflowWrap: 'anywhere' }}>{camera}</div>
  </div>;
}
