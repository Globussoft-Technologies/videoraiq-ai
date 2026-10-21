import {
  formatPackingDuration,
  packingDateValue,
  packingDurationSeconds,
  packingEndTimeValue,
  packingStartTimeValue,
} from '../pages/BoxPackingLogs/boxPackingData.js';

export function packingIncidentDetails(item = {}) {
  const snapshot = item.workerZones ?? item.zones ?? [];
  const zones = Array.isArray(snapshot) ? snapshot : Object.entries(snapshot).map(([zone, value]) => ({ ...value, zone }));
  const completedBy = String(item.completedBy || '').trim();
  const completed = zones.find((zone) => String(zone?.zone || '').trim() === completedBy);
  const durationSeconds = packingDurationSeconds({ ...item, timeTakenSec: completed?.timeTakenSec ?? item.timeTakenSec });
  return {
    boxId: item.boxId || '—',
    completedBy: completedBy || '—',
    packingTime: formatPackingDuration(durationSeconds),
    date: packingDateValue(item),
    startTime: packingStartTimeValue({ ...item, timeTakenSec: durationSeconds }),
    endTime: packingEndTimeValue(item),
  };
}
