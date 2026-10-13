import { panelCounts } from './panelCounts.js';
const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function buildLatestPanelState(panel) {
  const source = Array.isArray(panel?.zones) ? panel.zones.filter(zone => zone && typeof zone === 'object') : [];
  if (!source.length) return null;
  const completed = source.map(zone => count(zone.done));
  const { completedJoints: done, requiredJoints, missedJoints } = panelCounts({ ...panel, zones: source });
  const known = completed.every(value => value != null);
  const zeroCompleted = known && done === 0;

  let offset = 0;
  const zones = source.map((zone, index) => {
    // For an entirely unsoldered panel, distribute display slots across the
    // worker rows. This does not change their reported done counts or totals.
    const slots = zeroCompleted ? Math.floor(requiredJoints / source.length) + (index < requiredJoints % source.length ? 1 : 0) : completed[index] ?? 0;
    const points = Array.from({ length: slots }, (_, position) => ({
      label: `P${offset + position + 1}`, index: offset + position,
      status: zeroCompleted ? 'missed' : 'completed',
    }));
    offset += points.length;
    return { name: zone.zone || `Zone ${index + 1}`, done: completed[index], expected: points.length, points };
  });
  if (missedJoints && !zeroCompleted) zones.push({ name: known ? 'Missed joints' : 'Completion not reported', unassigned: true, done: 0, expected: missedJoints,
    points: Array.from({ length: missedJoints }, (_, position) => ({ label: `P${offset + position + 1}`, index: offset + position, status: known ? 'missed' : 'unknown' })),
  });
  const points = zones.flatMap(zone => zone.points);
  return {
    zones, points, done, requiredJoints, missedJoints, total: points.length, complete: known && missedJoints === 0,
    animationKey: JSON.stringify([String(panel._id || ''), panel.panelId, panel.time || panel.timeOfIncident,
      zones.map(zone => [zone.name, zone.done, zone.expected])]),
  };
}

export function pointReplayPhase(point, step) {
  return point.index < step ? point.status : point.index === step ? 'processing' : 'pending';
}
