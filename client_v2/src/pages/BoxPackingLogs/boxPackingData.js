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
export const packingWorkerCount = (rows = []) => new Set(rows.filter(packingWorkerId)
  .map((row) => JSON.stringify([packingStationKey(row), packingWorkerId(row)]))).size;

export const packingWorkerDetails = (row) => {
  const matched = packingCompletedZone(row);
  const hasSnapshot = row.workerZones != null || row.zones != null;
  const metric = matched || (!hasSnapshot ? row : {});
  return { worker: packingWorkerId(row), boxNumber: metric.boxNumber, timeTakenSec: metric.timeTakenSec };
};
export const packingAverageSeconds = (rows) => {
  const seconds = rows.map((row) => Number(row.timeTakenSec)).filter((value) => Number.isFinite(value) && value > 0);
  return seconds.length ? seconds.reduce((sum, value) => sum + value, 0) / seconds.length : 0;
};

export const packingDurationSeconds = (row) => Number(row?.timeTakenSec ?? packingCompletedZone(row)?.timeTakenSec) || 0;
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

export const packingStats = (rows) => ({
  total: rows.length,
  review: rows.filter((row) => row.status === 'review').length,
  // Each row represents one packed box. `boxNumber` is the sequence/label
  // shown for that box, not a quantity to add to the total.
  boxes: rows.length,
  avgTime: Math.round(packingAverageSeconds(rows)),
});
