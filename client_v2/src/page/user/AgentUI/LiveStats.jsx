import { engineMeta } from '@/lib/engineMeta';

function DetectionTypeChart({ rows }) {
  const visible = rows.slice(0, 11);
  const other = rows.slice(11).reduce((total, row) => total + Number(row.count), 0);
  const bars = other ? [...visible, { type: 'other', count: other }] : visible;
  const max = Math.max(1, ...bars.map((row) => Number(row.count) || 0));
  const summary = rows.length
    ? `Today's detections by type: ${rows.map((row) => `${engineMeta(row.type).name}: ${row.count}`).join(', ')}`
    : 'No detections by type today';

  return <div className="agent-type-chart agent-bars" role="img" aria-label={summary}>
    {bars.map((row, index) => {
      const name = row.type === 'other' ? 'Other types' : engineMeta(row.type).name;
      return <i key={row.type} title={`${name}: ${Number(row.count).toLocaleString()}`} style={{ height: `${Math.max(12, Number(row.count) / max * 100)}%`, animationDelay: `${0.9 + index * 0.06}s` }} />;
    })}
  </div>;
}

export default function LiveStats({ cameras, detections, incidents, cameraBars = [], detectionBars = [] }) {
  const values = [cameras, detections, incidents];
  const max = Math.max(1, ...cameraBars);
  return <section className="agent-live-stats grid grid-cols-3">
    {['Cameras online', 'Detections today', 'Open incidents'].map((label, index) => {
      const value = values[index];
      return <div className="agent-tile" key={label}>
        <span>{label}</span>
        <b key={`${index}-${value}`} className="agent-bump">{Number.isFinite(value) ? value.toLocaleString() : '—'}</b>
        {index === 0 && <div className="agent-bars flex items-end">{cameraBars.map((count, i) => <i key={i} style={{ height: `${count / max * 100}%`, animationDelay: `${0.9 + i * 0.06}s` }} />)}</div>}
        {index === 1 && <DetectionTypeChart rows={detectionBars} />}
        {index === 2 && <div className="agent-scan" />}
      </div>;
    })}
  </section>;
}
