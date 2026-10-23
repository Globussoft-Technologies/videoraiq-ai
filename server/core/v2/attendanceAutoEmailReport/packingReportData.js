import moment from 'moment-timezone';

export const PACKING_REPORT_COLUMNS = {
  total: ['Box ID', 'Completed By', 'NVR', 'Camera Name', 'Date', 'Start time', 'End time', 'Time to complete', 'Snapshot'],
  hourly: ['Time range', 'Boxes packed', 'Average time to complete', 'Active workers'],
  comparison: ['NVR', 'Camera Name', 'Worker', 'Boxes packed', 'Average time to complete'],
};

export const formatPackingReportDuration = (seconds) => {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return '—';
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60), remaining = value % 60;
  if (minutes < 60) return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

const duration = formatPackingReportDuration;
const idOf = (value) => String(value?._id || value?.id || value || '');
const zonesOf = (row) => {
  const snapshot = row.workerZones ?? row.zones ?? [];
  return Array.isArray(snapshot) ? snapshot : Object.entries(snapshot || {}).map(([zone, data]) => ({ ...data, zone }));
};
const completedZone = (row) => zonesOf(row).find((entry) => String(entry.zone || '').trim() === String(row.completedBy || '').trim());
const secondsOf = (row) => Number(row.timeTakenSec ?? completedZone(row)?.timeTakenSec) || 0;
const endOf = (row) => row.recordedAt || row.timeOfIncident || row.time || row.endTime || row.end_time || row.createdAt;
const startOf = (row) => {
  const end = endOf(row), seconds = secondsOf(row);
  if (end && Number.isFinite(seconds) && seconds > 0) {
    const endMs = new Date(end).getTime();
    if (Number.isFinite(endMs)) return new Date(endMs - seconds * 1000);
  }
  return row.startTime || row.start_time || null;
};
const fmt = (value, timezone, pattern) => value && moment(value).tz(timezone).isValid() ? moment(value).tz(timezone).format(pattern) : '—';
const averageSeconds = (rows) => {
  const values = rows.map(secondsOf).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
};

export function packingReportData(rows, reportType = 'total', timezone = 'Asia/Kolkata', channels = []) {
  const type = PACKING_REPORT_COLUMNS[reportType] ? reportType : 'total';
  const normalized = rows.map((row) => ({
    ...row,
    worker: String(row.completedBy || '').trim(),
    seconds: secondsOf(row),
    end: endOf(row),
    start: startOf(row),
    date: endOf(row) ? moment(endOf(row)).tz(timezone) : moment.invalid(),
    camera: row.cameraName || row.camera || row.channelData?.customName || row.channelData?.name || '—',
    nvr: row.nvrName || row.nvr || row.nvrData?.nvrName || '—',
    station: JSON.stringify([idOf(row.nvrId || row.nvrData?._id || row.channelData?.nvrId), idOf(row.cameraId || row.channelData?._id || row.channelId || row.camera)]),
  }));
  const records = [];
  const configuredWorkers = new Map();
  for (const channel of channels) {
    const settings = channel.detections?.boxPackingDetectionSettings?.id?.settings;
    const cameraId = idOf(channel);
    const raw = settings?.referencePoints?.[cameraId];
    if (!Array.isArray(raw) || !raw.length) continue;
    const polygons = Array.isArray(raw[0]?.[0]) ? raw : [raw];
    polygons.forEach((polygon, index) => {
      if (!Array.isArray(polygon) || polygon.length < 3) return;
      const worker = String(settings?.zone_configs?.[index]?.name || `Zone ${index + 1}`).trim();
      const station = JSON.stringify([idOf(channel.nvrId), cameraId]);
      configuredWorkers.set(JSON.stringify([station, worker]), {
        station, worker, camera: channel.customName || channel.name || '—',
        nvr: channel.nvrId?.nvrName || channel.nvrId?.name || '—',
      });
    });
  }
  if (type === 'total') normalized.forEach((row) => records.push({
    'Box ID': row.boxId || '—', 'Completed By': row.worker || '—', NVR: row.nvr || '—', 'Camera Name': row.camera || '—',
    Date: fmt(row.end, timezone, 'DD MMM YYYY'), 'Start time': fmt(row.start, timezone, 'hh:mm A'), 'End time': fmt(row.end, timezone, 'hh:mm A'),
    'Time to complete': duration(row.seconds), Snapshot: row.Image || row.image || row.imageUrl || row.incidentImageUrl || '',
  }));
  else {
    const groups = new Map();
    if (type === 'comparison') {
      for (const [key, worker] of configuredWorkers) groups.set(key, { rows: [], worker });
    }
    normalized.forEach((row) => {
      if ((type === 'hourly' && !row.date.isValid()) || (type === 'comparison' && !row.worker)) return;
      const key = type === 'hourly' ? row.date.format('YYYY-MM-DD HH') : JSON.stringify([row.station, row.worker]);
      if (!groups.has(key)) groups.set(key, type === 'comparison' ? { rows: [], worker: row } : { rows: [] });
      groups.get(key).rows.push(row);
    });
    const multiDay = new Set([...groups.values()].filter((group) => group.rows.length).map((group) => group.rows[0].date.format('YYYY-MM-DD'))).size > 1;
    const entries = type === 'hourly' ? [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)) : [...groups.entries()];
    entries.forEach(([, group]) => {
      const row = group.rows[0] || group.worker, average = duration(averageSeconds(group.rows));
      if (type === 'comparison') records.push({ NVR: row.nvr || '—', 'Camera Name': row.camera || '—', Worker: row.worker, 'Boxes packed': group.rows.length, 'Average time to complete': average });
      else {
        const workers = new Map();
        group.rows.filter((item) => item.worker).forEach((item) => workers.set(JSON.stringify([item.station, item.worker]), item.worker));
        const names = [...workers.values()];
        const start = row.date.clone().startOf('hour');
        records.push({ 'Time range': start.format(multiDay ? 'DD MMM YYYY HH:mm' : 'HH:mm') + '–' + start.clone().add(1, 'hour').format('HH:mm'), 'Boxes packed': group.rows.length, 'Average time to complete': average, 'Active workers': `${workers.size}${names.length ? ' · ' + names.join(', ') : ''}` });
      }
    });
  }
  const workerKeys = new Set([...configuredWorkers.keys(), ...normalized.filter((row) => row.worker).map((row) => JSON.stringify([row.station, row.worker]))]);
  return { records, columns: PACKING_REPORT_COLUMNS[type], summary: { workers: workerKeys.size, boxes: rows.length, cycle: Math.round(averageSeconds(normalized)) } };
}
