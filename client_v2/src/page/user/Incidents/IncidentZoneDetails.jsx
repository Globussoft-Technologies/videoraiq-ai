import { solderAbsenceFields } from '../../../helpers/solderIncidentDetails.js';

export default function IncidentZoneDetails({ item, variant = 'card' }) {
  if (item.incidentType !== 'deskSolarShoulderDetection') return null;
  const dark = variant === 'lightbox';
  const colors = dark ? { '--tx2': 'rgba(255,255,255,.9)', '--tx3': 'rgba(255,255,255,.65)', '--bd': 'rgba(255,255,255,.2)' } : {};
  const zones = Array.isArray(item.zones) ? item.zones.filter((zone) => zone && typeof zone === 'object') : [];
  const isPanel = item.eventType === 'panel' || zones.length > 0;

  if (!isPanel) {
    return (
      <dl aria-label="Desk absence details" style={{ ...colors, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px 12px', margin: '5px 0', fontSize: dark ? 12 : 11 }}>
        {solderAbsenceFields(item).map(([label, value]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <dt style={{ color: 'var(--tx3)', marginBottom: 2 }}>{label}</dt>
            <dd style={{ margin: 0, color: 'var(--tx2)', fontWeight: 600, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div style={{ ...colors, display: 'grid', gap: 6, color: 'var(--tx2)', fontSize: dark ? 12 : 11 }}>
      {(item.panelId || item.missedJoints != null || item.point != null) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {item.panelId && <span>Panel: <strong>{item.panelId}</strong></span>}
          {item.missedJoints != null && <span>Missed joints: <strong>{item.missedJoints}</strong></span>}
          {item.point != null && <span>Missing point: <strong>P{item.point}</strong></span>}
        </div>
      )}
    {zones.length > 0 && <table aria-label="Zone soldering details" style={{ width: '100%', borderCollapse: 'collapse', fontSize: dark ? 12 : 11, color: 'var(--tx2)', tableLayout: 'fixed' }}>
      <thead>
        <tr style={{ color: 'var(--tx3)' }}>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 4px 4px 0', width: '40%' }}>Zone</th>
          <th scope="col" title="presenceSec" style={{ textAlign: 'right', padding: '4px' }}>Presence (s)</th>
          <th scope="col" style={{ textAlign: 'right', padding: '4px 0 4px 4px', width: '20%' }}>Done</th>
        </tr>
      </thead>
      <tbody>
        {zones.map((zone, index) => (
          <tr key={`${zone.zone ?? 'zone'}-${index}`} style={{ borderTop: '1px solid var(--bd)' }}>
            <td style={{ padding: '4px 4px 4px 0', overflowWrap: 'anywhere' }}>{zone.zone ?? '—'}</td>
            <td style={{ textAlign: 'right', padding: '4px', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{zone.presenceSec ?? '—'}</td>
            <td style={{ textAlign: 'right', padding: '4px 0 4px 4px', fontVariantNumeric: 'tabular-nums' }}>{zone.done ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>}
    </div>
  );
}
