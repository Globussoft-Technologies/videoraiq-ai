const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

export function buildLatestPanelState(panel, pointsPerZone = 3) {
  const source = Array.isArray(panel?.zones) ? panel.zones.filter(zone => zone && typeof zone === 'object') : [];
  if (!source.length) return null;
  const baseline = Number.isInteger(pointsPerZone) && pointsPerZone > 0 ? pointsPerZone : 3;
  const completed = source.map(zone => count(zone.done));
  const done = completed.reduce((sum, value) => sum + (value ?? 0), 0);
  const reportedMissed = count(panel.missedJoints);
  const reportedTotal = completed.every(value => value != null) && reportedMissed != null ? done + reportedMissed : 0;
  const total = Math.max(done, reportedTotal || baseline * source.length);

  // Move unused slots to operators exceeding the even split; never clip done.
  const allocation = completed.map((value, index) => Math.max(value ?? 0,
    Math.floor(total / source.length) + (index < total % source.length ? 1 : 0)));
  let surplus = allocation.reduce((sum, value) => sum + value, 0) - total;
  for (let index = allocation.length - 1; index >= 0 && surplus > 0; index--) {
    const moved = Math.min(allocation[index] - (completed[index] ?? 0), surplus);
    allocation[index] -= moved;
    surplus -= moved;
  }

  let offset = 0;
  const zones = source.map((zone, index) => {
    const points = Array.from({ length: allocation[index] }, (_, position) => ({
      label: `P${offset + position + 1}`, index: offset + position,
      status: completed[index] == null ? 'unknown' : position < completed[index] ? 'completed' : 'missed',
    }));
    offset += allocation[index];
    return { name: zone.zone || `Zone ${index + 1}`, done: completed[index], expected: allocation[index], points };
  });
  const points = zones.flatMap(zone => zone.points);
  return {
    zones, points, done, total, complete: points.every(point => point.status === 'completed'),
    animationKey: JSON.stringify([String(panel._id || ''), panel.panelId, panel.time || panel.timeOfIncident,
      zones.map(zone => [zone.name, zone.done, zone.expected])]),
  };
}

export function pointReplayPhase(point, step) {
  return point.index < step ? point.status : point.index === step ? 'processing' : 'pending';
}
