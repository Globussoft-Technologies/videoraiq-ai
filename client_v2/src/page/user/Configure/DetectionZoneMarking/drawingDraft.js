// Undo edits the canvas only. The caller keeps the saved zone list separately
// until a successful save, including the original per-zone settings.
export function undoAreaDrawing({ zones, draftZones, points, pointZone, isLineCrossing }) {
  if (points.length) return { zones, draftZones, points: points.slice(0, -1), pointZone };
  const source = draftZones.length ? draftZones : zones;
  const last = source.at(-1);
  if (!last) return { zones, draftZones, points, pointZone };
  const zonePoints = isLineCrossing && last.insideReferencePoint
    ? [...last.points, last.insideReferencePoint] : last.points;
  return {
    zones: draftZones.length ? zones : zones.slice(0, -1),
    draftZones: draftZones.length ? draftZones.slice(0, -1) : draftZones,
    points: zonePoints.slice(0, -1),
    pointZone: last,
  };
}
