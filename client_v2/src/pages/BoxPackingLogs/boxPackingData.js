import moment from 'moment-timezone';
import { packingStationKey } from './packingIdentity.js';

// completedBy is the backend's productivity worker identifier. Never use a
// physical incident.zone or every entry in a workstation snapshot as workers.
export const packingWorkerId = (row) => {
  const value = row?.completedBy;
  return typeof value === 'string' || typeof value === 'number'
    ? (String(value).trim() === 'Completed by not provided' ? '' : String(value).trim()) : '';
};
export const packingWorkerIds = (rows = []) => [...new Set(rows.map(packingWorkerId).filter(Boolean))];
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

const today = moment().startOf('day');
const at = (hours, minutes) => today.clone().add(hours, 'hours').add(minutes, 'minutes').toISOString();

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

// Static demo snapshots only. These are intentionally stored with the dummy
// records so the Box Packing UI does not need an image API to render previews.
const packingImages = [
  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1601598851547-4302969d0614?auto=format&fit=crop&w=1200&q=80',
];

export const BOX_PACKING_DUMMY_LOGS = [
  { id: 'BP-2401', boxId: 'BX-10482', completedBy: 'Anita Rao', zone: 'Packing Zone A', boxNumber: 24, timeTakenSec: 86, detectedVia: 'Camera + sensor', status: 'completed', camera: 'Packing Cam 01', time: at(8, 12), color: '#22c55e', reason: 'Box count matched', Image: packingImages[0] },
  { id: 'BP-2402', boxId: 'BX-10483', completedBy: 'Vikram Singh', zone: 'Packing Zone B', boxNumber: 18, timeTakenSec: 104, detectedVia: 'Camera', status: 'review', camera: 'Packing Cam 02', time: at(9, 5), color: '#f5a623', reason: 'Manual confirmation', Image: packingImages[1] },
  { id: 'BP-2403', boxId: 'BX-10484', completedBy: 'Meera Nair', zone: 'Packing Zone A', boxNumber: 32, timeTakenSec: 72, detectedVia: 'Camera + sensor', status: 'completed', camera: 'Packing Cam 01', time: at(10, 18), color: '#22c55e', reason: 'Box count matched', Image: packingImages[2] },
  { id: 'BP-2404', boxId: 'BX-10485', completedBy: 'Rahul Das', zone: 'Packing Zone C', boxNumber: 12, timeTakenSec: 141, detectedVia: 'Camera', status: 'review', camera: 'Packing Cam 03', time: at(11, 42), color: '#f5a623', reason: 'Count variance detected', Image: packingImages[3] },
  { id: 'BP-2405', boxId: 'BX-10486', completedBy: 'Anita Rao', zone: 'Packing Zone B', boxNumber: 28, timeTakenSec: 91, detectedVia: 'Camera + sensor', status: 'completed', camera: 'Packing Cam 02', time: at(13, 7), color: '#22c55e', reason: 'Box count matched', Image: packingImages[1] },
  { id: 'BP-2406', boxId: 'BX-10487', completedBy: 'Suresh Kumar', zone: 'Packing Zone C', boxNumber: 20, timeTakenSec: 118, detectedVia: 'Camera', status: 'review', camera: 'Packing Cam 03', time: at(14, 26), color: '#f5a623', reason: 'Awaiting supervisor review', Image: packingImages[3] },
  { id: 'BP-2407', boxId: 'BX-10488', completedBy: 'Meera Nair', zone: 'Packing Zone A', boxNumber: 36, timeTakenSec: 68, detectedVia: 'Camera + sensor', status: 'completed', camera: 'Packing Cam 01', time: at(15, 11), color: '#22c55e', reason: 'Box count matched', Image: packingImages[0] },
  { id: 'BP-2408', boxId: 'BX-10489', completedBy: 'Vikram Singh', zone: 'Packing Zone B', boxNumber: 16, timeTakenSec: 129, detectedVia: 'Camera', status: 'review', camera: 'Packing Cam 02', time: at(16, 3), color: '#f5a623', reason: 'Count variance detected', Image: packingImages[2] },
];

export const packingStats = (rows) => ({
  total: rows.length,
  review: rows.filter((row) => row.status === 'review').length,
  // Each row represents one packed box. `boxNumber` is the sequence/label
  // shown for that box, not a quantity to add to the total.
  boxes: rows.length,
  avgTime: Math.round(packingAverageSeconds(rows)),
});
