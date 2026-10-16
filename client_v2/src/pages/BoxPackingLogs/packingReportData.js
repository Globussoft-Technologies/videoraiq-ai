import moment from 'moment-timezone';
import { formatPackingDuration, packingWorkerIds, packingWorkerDetails, packingAverageSeconds } from './boxPackingData.js';
import { packingStationKey, samePackingCamera } from './packingIdentity.js';

export const reportCameraName = (row) => row.cameraName || row.camera || row.channelData?.customName || row.channelData?.name || row.channelName || '—';
export const reportNvrName = (row) => row.nvrName || row.nvrData?.nvrName || row.nvrData?.name || row.nvr || '—';

// Keep configured cameras available even when the selected dates have no boxes.
// Match by camera/NVR identity, never by a potentially duplicated display name.
export function buildPackingReportStations(rows = [], channels = []) {
  const stations = channels.map((channel) => ({
    id: packingStationKey(channel, true),
    name: channel._boxPackingCameraName || channel.customName || channel.cameraName || channel.name || 'Unnamed camera',
    nvrName: channel._boxPackingNvrName || channel.nvrName || channel.nvrData?.nvrName || (typeof channel.nvrId === 'object' ? channel.nvrId?.nvrName || channel.nvrId?.name : '') || 'NVR',
    channel,
    rows: [],
  }));
  for (const row of rows) {
    const key = packingStationKey(row);
    let station = stations.find((item) => item.channel ? samePackingCamera(row, item.channel) : item.id === key);
    if (!station) {
      station = { id: key, name: reportCameraName(row), nvrName: reportNvrName(row), rows: [] };
      stations.push(station);
    }
    station.rows.push(row);
  }
  return stations.map(({ channel, ...station }) => ({ ...station, workers: packingWorkerIds(station.rows) }));
}
export const REPORT_COLUMNS = {
  total: ['Box ID', 'Completed By', 'NVR', 'Camera Name', 'Box Number', 'Time to complete', 'Date & time', 'Snapshot'],
  hourly: ['Time range', 'Boxes packed', 'Average time to complete', 'Active workers'],
  comparison: ['NVR', 'Camera Name', 'Worker', 'Boxes packed', 'Average time to complete'],
};

// Shared by previews, PDF and Excel. Each record is one box; its boxNumber
// identifies that box and is never summed as a quantity.
export function buildPackingReportRecords(rows = [], type = 'total', timezone = 'Asia/Kolkata') {
  rows = rows.map((row) => {
    const details = packingWorkerDetails(row);
    return { ...row, worker: details.worker, boxNumber: details.boxNumber, timeTakenSec: details.timeTakenSec, time: row.time || row.recordedAt || row.timeOfIncident };
  });
  if (type === 'total') return rows.map((row) => ({
    'Box ID': row.boxId || '—', 'Completed By': row.worker || '—',
    NVR: reportNvrName(row), 'Camera Name': reportCameraName(row),
    'Box Number': Number.isFinite(Number(row.boxNumber)) && Number(row.boxNumber) > 0 ? row.boxNumber : '—', 'Time to complete': formatPackingDuration(row.timeTakenSec),
    'Date & time': row.time ? moment(row.time).tz(timezone).format('DD MMM YYYY, hh:mm A') : '—',
    Snapshot: row.Image || row.image || row.imageUrl || row.incidentImageUrl || '',
  }));

  const groups = new Map();
  if (type === 'hourly') {
    for (const row of rows) {
      const date = moment(row.time).tz(timezone);
      if (!date.isValid()) continue;
      const key = date.format('YYYY-MM-DD HH');
      if (!groups.has(key)) groups.set(key, { date: date.clone().startOf('hour'), rows: [] });
      groups.get(key).rows.push(row);
    }
    const multiDay = new Set([...groups.values()].map((group) => group.date.format('YYYY-MM-DD'))).size > 1;
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => {
      const workers = new Map();
      group.rows.filter((row) => row.worker).forEach((row) => {
        workers.set(JSON.stringify([packingStationKey(row), row.worker]), { name: row.worker, camera: reportCameraName(row), nvr: reportNvrName(row) });
      });
      const names = [...workers.values()].map((worker) => worker.name);
      return {
        'Time range': group.date.format(multiDay ? 'DD MMM YYYY HH:mm' : 'HH:mm') + '–' + group.date.clone().add(1, 'hour').format('HH:mm'),
        'Boxes packed': group.rows.length,
        'Average time to complete': formatPackingDuration(packingAverageSeconds(group.rows)),
        'Active workers': `${workers.size}${names.length ? ' · ' + names.join(', ') : ''}`,
      };
    });
  }

  for (const row of rows) {
    if (!row.worker) continue;
    const key = JSON.stringify([packingStationKey(row), row.worker]);
    if (!groups.has(key)) groups.set(key, { row, worker: row.worker, boxes: 0, rows: [] });
    const group = groups.get(key);
    group.boxes += 1;
    group.rows.push(row);
  }
  return [...groups.values()].map((group) => ({
    NVR: reportNvrName(group.row), 'Camera Name': reportCameraName(group.row), Worker: group.worker,
    'Boxes packed': group.boxes,
    'Average time to complete': formatPackingDuration(packingAverageSeconds(group.rows)),
  }));
}
