import { formatPackingDuration } from '../pages/BoxPackingLogs/boxPackingData.js';

export function packingIncidentDetails(item = {}) {
  const snapshot = item.workerZones ?? item.zones ?? [];
  const zones = Array.isArray(snapshot) ? snapshot : Object.entries(snapshot).map(([zone, value]) => ({ ...value, zone }));
  const completedBy = String(item.completedBy || '').trim();
  const completed = zones.find((zone) => String(zone?.zone || '').trim() === completedBy);
  const number = completed?.boxNumber ?? item.boxNumber;
  return {
    boxId: item.boxId || '—', completedBy: completedBy || '—',
    boxNumber: Number.isFinite(Number(number)) && Number(number) > 0 ? number : '—',
    packingTime: formatPackingDuration(completed?.timeTakenSec ?? item.timeTakenSec),
  };
}
