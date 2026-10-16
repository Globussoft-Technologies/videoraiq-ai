import { solderAbsenceFields } from '../../../helpers/solderIncidentDetails.js';
import { packingIncidentDetails } from '../../../helpers/packingIncidentDetails.js';
import { HYGIENE_INCIDENT_TYPE } from '../../../helpers/hygieneDetection';
import IncidentHygieneDetails from './IncidentHygieneDetails';

export default function IncidentZoneDetails({ item, variant = 'card', compact = false }) {
  if (item.incidentType === HYGIENE_INCIDENT_TYPE) return <IncidentHygieneDetails item={item} variant={variant} compact={compact} />;
  if (item.incidentType === 'boxPackingDetection') {
    const packing = packingIncidentDetails(item), dark = variant === 'lightbox';
    if (!dark) return <dl aria-label="Box packing details" style={{ margin: '1px 0', fontSize: 11, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <dt style={{ color: 'var(--tx2)', fontWeight: 600, flexShrink: 0 }}>Box ID</dt>
        <dd style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--blue)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono, monospace)' }} title={String(packing.boxId)}>{packing.boxId}</dd>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, paddingTop: 10 }}>
        {[['Completed by', packing.completedBy], ['Time to complete', packing.packingTime], ['Box number', packing.boxNumber]].map(([label, value]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <dt style={{ color: 'var(--tx2)', fontSize: 11, lineHeight: 1.2 }}>{label}</dt>
            <dd style={{ margin: '5px 0 0', color: 'var(--tx)', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(value)}>{value}</dd>
          </div>
        ))}
      </div>
    </dl>;
    return <dl aria-label="Box packing details" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', width: '100%', gap: 6, margin: '4px 0 0', fontSize: 11 }}>
      {[['Box ID', packing.boxId], ['Completed by', packing.completedBy], ['Box number', packing.boxNumber], ['Time to complete', packing.packingTime]].map(([label, value]) => <div key={label} style={{ minWidth: 0, padding: '6px 8px', borderRadius: 6, background: 'rgba(99,102,241,.12)', border: '1px solid rgba(165,180,252,.2)' }}>
        <dt style={{ color: 'rgba(255,255,255,.7)', marginBottom: 3, fontSize: 10 }}>{label}</dt>
        <dd style={{ margin: 0, fontWeight: 600, color: label === 'Time to complete' ? '#c4b5fd' : '#fff', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
      </div>)}
    </dl>;
  }
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
    <div style={{ ...colors, display: 'grid', gap: compact ? 3 : 6, color: 'var(--tx2)', fontSize: compact ? 11 : dark ? 12 : 11 }}>
      {(item.panelId || item.missedJoints != null || item.point != null) && (
        <div style={{ display: 'flex', gap: compact ? 8 : 12, flexWrap: 'wrap' }}>
          {item.panelId && <span>Panel: <strong>{item.panelId}</strong></span>}
          {item.missedJoints != null && <span>Missed joints: <strong>{item.missedJoints}</strong></span>}
          {item.point != null && <span>Missing point: <strong>P{item.point}</strong></span>}
        </div>
      )}
    {zones.length > 0 && <table aria-label="Zone soldering details" style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? 11 : dark ? 12 : 11, color: 'var(--tx2)', tableLayout: 'fixed' }}>
      <thead>
        <tr style={{ color: 'var(--tx3)' }}>
          <th scope="col" style={{ textAlign: 'left', padding: compact ? '2px 4px 2px 0' : '4px 4px 4px 0', width: '40%' }}>Zone</th>
          <th scope="col" title="presenceSec" style={{ textAlign: 'right', padding: compact ? '2px 4px' : '4px' }}>Presence (s)</th>
          <th scope="col" style={{ textAlign: 'right', padding: compact ? '2px 0 2px 4px' : '4px 0 4px 4px', width: '20%' }}>Done</th>
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
