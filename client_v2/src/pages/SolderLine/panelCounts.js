export const DEFAULT_REQUIRED_JOINTS = 6;

export function panelCounts(panel) {
  const required = Number(panel.requiredJoints);
  const requiredJoints = Number.isInteger(required) && required > 0 ? required : DEFAULT_REQUIRED_JOINTS;
  const completedJoints = (panel.zones || []).reduce((sum, zone) => {
    const done = Number(zone.done);
    return sum + (Number.isFinite(done) && done > 0 ? done : 0);
  }, 0);
  return { requiredJoints, completedJoints, missedJoints: Math.max(0, requiredJoints - completedJoints) };
}

export function panelReportFields(panel, pointCount) {
  const counts = panelCounts(panel);
  const zones = panel.zones || [];
  const known = zones.length > 0 && zones.every(zone => zone.done != null && Number.isFinite(Number(zone.done)) && Number(zone.done) >= 0);
  const slots = Math.max(counts.requiredJoints, counts.completedJoints);
  return {
    Zone: zones.map(zone => zone.zone || 'Unassigned').join('\n') || '—',
    Done: zones.map(zone => zone.done ?? '—').join('\n') || '—',
    'Total done': counts.completedJoints, 'Missed points': counts.missedJoints,
    ...Object.fromEntries(Array.from({ length: pointCount ?? slots }, (_, index) => [`P${index + 1}`,
      index >= slots ? '—' : !known ? 'Not reported' : index < counts.completedJoints ? 'Soldered' : 'Missed'])),
  };
}
