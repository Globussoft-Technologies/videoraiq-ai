import { Fragment } from 'react';

const ARRIVAL_DESCRIPTION = /^(.+?) arrived (\d+(?:\.\d+)?) minute(?:\(s\)|s)? after the grace deadline\.?$/i;
export const IN_TIME_LABEL = 'IN Time';

function lateArrivalDetails(item) {
  const description = typeof item.description === 'string' ? item.description.trim().match(ARRIVAL_DESCRIPTION) : null;
  const name = (typeof item.employeeName === 'string' ? item.employeeName.trim() : '') || description?.[1].trim();
  const rawMinutes = item.lateMinutes;
  const storedMinutes = typeof rawMinutes === 'number' || (typeof rawMinutes === 'string' && rawMinutes.trim())
    ? Number(rawMinutes) : NaN;
  const minutes = Number.isFinite(storedMinutes) && storedMinutes >= 0 ? storedMinutes : Number(description?.[2]);
  const seconds = Math.round(minutes * 60);
  const duration = Number.isFinite(seconds)
    ? [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((part) => String(part).padStart(2, '0')).join(':')
    : '';
  return { name, duration };
}

export function lateArrivalDescription(item) {
  if (item?.incidentType !== 'lateArrival') return item?.description;
  const { name, duration } = lateArrivalDetails(item);
  return name && duration ? `${name} arrived late by (${duration}).` : item.description;
}

export function LateArrivalAssignmentOverlay({ item }) {
  return (
    <dl style={{
      maxWidth: '100%',
      display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '3px 8px',
      margin: 0, padding: '5px 8px', borderRadius: 6, background: 'rgba(0,0,0,.72)',
      color: '#fff', fontSize: 10, lineHeight: 1.3, backdropFilter: 'blur(4px)', boxSizing: 'border-box',
    }}>
      {[['Dept Name:', item.departmentName], ['Shift:', item.shiftName]].map(([label, value]) => (
        <Fragment key={label}>
          <dt style={{ color: 'rgba(255,255,255,.82)' }}>{label}</dt>
          <dd title={value || undefined} style={{ margin: 0, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value || '—'}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default function LateArrivalDetails({ item }) {
  const { name, duration } = lateArrivalDetails(item);
  if (!name && !duration) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '3px 10px', minWidth: 0, fontSize: 11.5, lineHeight: 1.4 }}>
      {name && <span style={{ color: 'var(--tx)', fontWeight: 650, minWidth: 0, overflowWrap: 'anywhere' }}>{name}</span>}
      {duration && <span style={{ color: 'var(--tx2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>Late by <strong>{duration}</strong></span>}
    </div>
  );
}
