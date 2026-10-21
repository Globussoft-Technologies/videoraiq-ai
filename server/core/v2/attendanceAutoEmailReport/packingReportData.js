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
const startOf = (row) => row.startTime || row.start_time || row.time || row.recordedAt || row.timeOfIncident || row.createdAt;
const endOf = (row) => {
  const explicit = row.endTime || row.end_time;
  if (explicit) return explicit;
  const start = startOf(row), seconds = secondsOf(row);
  if (!start || !seconds) return null;
  const value = new Date(start);
  return Number.isNaN(value.getTime()) ? null : new Date(value.getTime() + seconds * 1000);
};
const fmt = (value, timezone, pattern) => value && moment(value).tz(timezone).isValid() ? moment(value).tz(timezone).format(pattern) : '—';
const averageSeconds = (rows) => {
  const values = rows.map(secondsOf).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
};

export function packingReportData(rows, reportType = 'total', timezone = 'Asia/Kolkata') {
  const type = PACKING_REPORT_COLUMNS[reportType] ? reportType : 'total';
  const normalized = rows.map((row) => ({
    ...row,
    worker: String(row.completedBy || '').trim(),
    seconds: secondsOf(row),
    end: endOf(row),
    start: startOf(row),
    date: startOf(row) ? moment(startOf(row)).tz(timezone) : moment.invalid(),
    camera: row.cameraName || row.camera || row.channelData?.customName || row.channelData?.name || '—',
    nvr: row.nvrName || row.nvr || row.nvrData?.nvrName || '—',
    station: JSON.stringify([idOf(row.nvrId || row.nvrData?._id || row.channelData?.nvrId), idOf(row.cameraId || row.channelData?._id || row.channelId || row.camera)]),
  }));
  const records = [];
  if (type === 'total') normalized.forEach((row) => records.push({
    'Box ID': row.boxId || '—', 'Completed By': row.worker || '—', NVR: row.nvr || '—', 'Camera Name': row.camera || '—',
    Date: fmt(row.start, timezone, 'DD MMM YYYY'), 'Start time': fmt(row.start, timezone, 'hh:mm A'), 'End time': fmt(row.end, timezone, 'hh:mm A'),
    'Time to complete': duration(row.seconds), Snapshot: row.Image || row.image || row.imageUrl || row.incidentImageUrl || '',
  }));
  else {
    const groups = new Map();
    normalized.forEach((row) => {
      if ((type === 'hourly' && !row.date.isValid()) || (type === 'comparison' && !row.worker)) return;
      const key = type === 'hourly' ? row.date.format('YYYY-MM-DD HH') : JSON.stringify([row.station, row.worker]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    const multiDay = new Set([...groups.values()].map(([row]) => row.date.format('YYYY-MM-DD'))).size > 1;
    const entries = type === 'hourly' ? [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)) : [...groups.entries()];
    entries.forEach(([, group]) => {
      const row = group[0], average = duration(averageSeconds(group));
      if (type === 'comparison') records.push({ NVR: row.nvr || '—', 'Camera Name': row.camera || '—', Worker: row.worker, 'Boxes packed': group.length, 'Average time to complete': average });
      else {
        const workers = new Map();
        group.filter((item) => item.worker).forEach((item) => workers.set(JSON.stringify([item.station, item.worker]), item.worker));
        const names = [...workers.values()];
        const start = row.date.clone().startOf('hour');
        records.push({ 'Time range': start.format(multiDay ? 'DD MMM YYYY HH:mm' : 'HH:mm') + '–' + start.clone().add(1, 'hour').format('HH:mm'), 'Boxes packed': group.length, 'Average time to complete': average, 'Active workers': `${workers.size}${names.length ? ' · ' + names.join(', ') : ''}` });
      }
    });
  }
  return { records, columns: PACKING_REPORT_COLUMNS[type], summary: { workers: new Set(normalized.filter((row) => row.worker).map((row) => JSON.stringify([row.station, row.worker]))).size, boxes: rows.length, cycle: Math.round(averageSeconds(normalized)) } };
}
