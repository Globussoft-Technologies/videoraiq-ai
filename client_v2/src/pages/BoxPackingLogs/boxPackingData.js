import moment from 'moment-timezone';
import { getConfiguredTimezone } from '@/utils/timezone';
import { packingStationKey } from './packingIdentity.js';

// completedBy is the backend's productivity worker identifier. Never use a
// physical incident.zone or every entry in a workstation snapshot as workers.
export const packingWorkerId = (row) => {
  const value = row?.completedBy;
  return typeof value === 'string' || typeof value === 'number'
    ? (String(value).trim() === 'Completed by not provided' ? '' : String(value).trim()) : '';
};
export const packingWorkerIds = (rows = []) => [...new Set(rows.map(packingWorkerId).filter(Boolean))];
const packingRowHasBox = (row) => {
  const boxNumber = Number(row?.boxNumber);
  return Boolean(row?.boxId) || row?.status === 'completed' || (Number.isFinite(boxNumber) && boxNumber > 0);
};
export const packingWorkerStationStats = (rows = []) => {
  const activity = new Map();
  for (const row of rows) {
    const worker = packingWorkerId(row);
    if (!worker) continue;
    const key = JSON.stringify([packingStationKey(row), worker]);
    if (!activity.has(key)) activity.set(key, { completed: false });
    activity.get(key).completed ||= packingRowHasBox(row);
  }
  return { total: activity.size, completed: [...activity.values()].filter((entry) => entry.completed).length };
};
// The overview parent card follows the production rule: a worker ID is
// counted once per camera/NVR station, so the same worker on two cameras is
// represented in both station totals.
export const packingWorkerCountByStation = (rows = []) => packingWorkerStationStats(rows).total;
export const packingZonesForChannel = (channel) => {
  const detections = channel?.detections;
  const setting = Array.isArray(detections)
    ? detections.find((entry) => entry?.settingType === 'boxPackingDetectionSettings' || entry?.id?.settingType === 'boxPackingDetectionSettings')
    : detections?.boxPackingDetectionSettings;
  const settings = setting?.settings || setting?.id?.settings;
  const cameraId = String(channel?._id || channel?.id || '');
  const raw = settings?.referencePoints?.[cameraId];
  if (!Array.isArray(raw) || !raw.length) return null;
  const polygons = Array.isArray(raw[0]?.[0]) ? raw : [raw];
  const zones = polygons.map((polygon, index) => ({
    name: settings?.zone_configs?.[index]?.name || `Zone ${index + 1}`,
    points: polygon.map((point) => Array.isArray(point) ? point : [point?.x, point?.y])
      .filter(([x, y]) => Number.isFinite(Number(x)) && Number.isFinite(Number(y)))
      .map(([x, y]) => [Number(x), Number(y)]),
  })).filter((zone) => zone.points.length >= 3);
  return zones.length ? { width: Number(settings?.videoResolution?.[0]), height: Number(settings?.videoResolution?.[1]), zones } : null;
};
export const packingWorkerCount = (rows = []) => packingWorkerIds(rows).length;
export const packingWorkerActivity = (rows = []) => {
  const activity = new Map();
  for (const row of rows) {
    const worker = packingWorkerId(row);
    if (!worker) continue;
    if (!activity.has(worker)) activity.set(worker, { id: worker, boxes: 0, completed: false, rows: [] });
    const entry = activity.get(worker);
    entry.rows.push(row);
    // A packing row represents a completed box even when the backend's
    // sequence number is zero or omitted. Prefer the explicit box id/status
    // and only use a positive sequence number as a fallback.
    const hasBox = packingRowHasBox(row);
    if (hasBox) entry.boxes += 1;
    entry.completed = entry.completed || hasBox;
  }
  return [...activity.values()].sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
};

export const packingWorkerDetails = (row) => {
  const matched = packingCompletedZone(row);
  const hasSnapshot = row.workerZones != null || row.zones != null;
  const metric = matched || (!hasSnapshot ? row : {});
  return { worker: packingWorkerId(row), boxNumber: metric.boxNumber, timeTakenSec: metric.timeTakenSec };
};
export const packingDurationSeconds = (row) => Number(row?.timeTakenSec ?? packingCompletedZone(row)?.timeTakenSec) || 0;
export const packingTotalSeconds = (rows = []) => rows.reduce((total, row) => {
  const seconds = packingDurationSeconds(row);
  return total + (Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
}, 0);
export const packingEndTimestamp = (row) => row?.timeOfIncident || row?.time || row?.recordedAt || row?.endTime || row?.end_time || row?.createdAt;
export const packingStartTimestamp = (row) => {
  const end = packingEndTimestamp(row);
  const seconds = packingDurationSeconds(row);
  if (end && Number.isFinite(seconds) && seconds > 0) {
    const endMs = new Date(end).getTime();
    if (Number.isFinite(endMs)) return new Date(endMs - seconds * 1000).toISOString();
  }
  return row?.startTime || row?.start_time || null;
};
export const packingDateValue = (row, timezone = getConfiguredTimezone()) => {
  const end = packingEndTimestamp(row);
  return end && moment.tz(end, timezone).isValid() ? moment.tz(end, timezone).format('DD MMM YYYY') : '—';
};
export const packingStartTimeValue = (row, timezone = getConfiguredTimezone()) => {
  const start = packingStartTimestamp(row);
  return start && moment.tz(start, timezone).isValid() ? moment.tz(start, timezone).format('hh:mm A') : '—';
};
export const packingEndTimeValue = (row, timezone = getConfiguredTimezone()) => {
  const end = packingEndTimestamp(row);
  return end && moment.tz(end, timezone).isValid() ? moment.tz(end, timezone).format('hh:mm A') : '—';
};

// A zones array is a workstation snapshot. Only the entry matching this
// incident's completedBy identifies a participating packing zone.
export const packingCompletedZone = (row) => {
  const completedBy = packingWorkerId(row);
  if (!completedBy) return undefined;
  const snapshot = row.workerZones ?? row.zones ?? [];
  const zones = Array.isArray(snapshot) ? snapshot : Object.entries(snapshot).map(([zone, data]) => ({ ...data, zone }));
  return zones.find((entry) => String(entry.zone || '').trim() === completedBy);
};

export const packingZoneIds = (rows) => [...new Set(rows
  .map((row) => String(packingCompletedZone(row)?.zone || '').trim())
  .filter(Boolean))];

// Zone names are local to their NVR/camera; keep repeated names on different
// stations separate when counting a report that spans multiple cameras.
export const packingZoneCount = (rows) => new Set(rows.flatMap((row) =>
  packingZoneIds([row]).map((zone) => JSON.stringify([packingStationKey(row), zone]))
)).size;

// Activity lists use only the event's completion zone. Other zones in its
// workstation snapshot describe context, not additional packing records.
export const packingActivityZoneIds = packingZoneIds;

export const formatPackingDuration = (seconds) => {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return '—';
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remainingSeconds = value % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

export const formatPackingTotalSeconds = (seconds) => {
  let remaining = Math.round(Number(seconds) || 0);
  if (remaining <= 0) return '0s';

  // These are elapsed-time units, so months and years use fixed lengths.
  const units = [
    [365 * 24 * 60 * 60, 'yr'],
    [30 * 24 * 60 * 60, 'mo'],
    [24 * 60 * 60, 'd'],
    [60 * 60, 'h'],
    [60, 'm'],
    [1, 's'],
  ];
  const parts = [];
  for (const [size, unit] of units) {
    const count = Math.floor(remaining / size);
    if (!count) continue;
    parts.push(`${count}${unit}`);
    remaining %= size;
    if (parts.length === 2) break;
  }
  return parts.join(' ');
};
export const formatPackingTotalTime = (rows = []) => formatPackingTotalSeconds(packingTotalSeconds(rows));

export const packingStats = (rows) => ({
  total: rows.length,
  review: rows.filter((row) => row.status === 'review').length,
  // Each row represents one packed box. `boxNumber` is the sequence/label
  // shown for that box, not a quantity to add to the total.
  boxes: rows.length,
  totalSeconds: packingTotalSeconds(rows),
});
