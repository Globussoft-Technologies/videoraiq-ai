import { useMemo, useState } from 'react';
import { SEVERITIES, SEVERITY_BY_KEY, INCIDENT_STATUS } from './detectionsData';

const FILTERS = [{ key: 'all', label: 'All' }, ...SEVERITIES.map((s) => ({ key: s.key, label: s.label }))];

function IncidentRow({ incident }) {
  const sev = SEVERITY_BY_KEY[incident.severity] || SEVERITY_BY_KEY.low;
  const status = INCIDENT_STATUS[incident.status] || INCIDENT_STATUS.new;

  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderLeft: `3px solid ${sev.color}`,
        borderRadius: 8,
        padding: '10px 13px 11px',
      }}
    >
      {/* Severity + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '.04em',
            padding: '2px 6px',
            borderRadius: 4,
            color: sev.color,
            background: sev.tint,
            flex: '0 0 auto',
          }}
        >
          {sev.short}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
          {incident.time}
        </span>
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--tx)',
          margin: '7px 0 4px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={incident.title}
      >
        {incident.title}
      </div>

      {/* Source + resolution status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--tx3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {incident.camera} · {incident.site} · {incident.confidence}%
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flex: '0 0 auto',
            fontSize: 10,
            fontWeight: 600,
            color: status.color,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: status.color }} />
          {status.label}
        </span>
      </div>
    </div>
  );
}

/** Incident feed for the selected detection, filterable by severity. */
export default function DetectionIncidents({ incidents }) {
  const [filter, setFilter] = useState('all');

  const shown = useMemo(
    () => (filter === 'all' ? incidents : incidents.filter((i) => i.severity === filter)),
    [incidents, filter],
  );

  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '15px 16px 12px' }}>
        <span style={{ fontFamily: 'var(--disp)', fontSize: 14, fontWeight: 600 }}>Incidents</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
          {shown.length} matching
        </span>
      </div>

      {/* Same chip shape as the page toolbar. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 14px' }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                height: 27,
                padding: '0 13px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                color: active ? '#fff' : 'var(--tx2)',
                background: active ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg2)',
                border: `1px solid ${active ? 'transparent' : 'var(--bd)'}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div
        className="vq-scroll"
        style={{
          maxHeight: 336,
          overflowY: 'auto',
          borderTop: '1px solid var(--bd)',
          padding: shown.length ? '12px 14px' : 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        {shown.length === 0 ? (
          <div style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12, color: 'var(--tx3)' }}>
            No incidents for this filter
          </div>
        ) : (
          shown.map((incident) => <IncidentRow key={incident.id} incident={incident} />)
        )}
      </div>
    </div>
  );
}
