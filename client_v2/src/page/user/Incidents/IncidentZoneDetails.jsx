export default function IncidentZoneDetails({ item }) {
  if (item.incidentType !== 'deskSolarShoulderDetection' || !Array.isArray(item.zones)) return null;
  const zones = item.zones.filter((zone) => zone && typeof zone === 'object');
  if (!zones.length) return null;

  return (
    <table aria-label="Zone soldering details" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: 'var(--tx2)', tableLayout: 'fixed' }}>
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
    </table>
  );
}
