const present = (value) => {
  const text = String(value ?? '').trim();
  return text && text !== '—' ? text : '';
};

export const recordTime = (row) => {
  // Older API responses omit measuredAt. The displayed dateTime still reflects
  // dsProcessedAt, so use it before the incident's creation timestamp.
  const display = /^(\d{2}) ([A-Za-z]{3}) (\d{4}), (\d{2}):(\d{2}):(\d{2})$/.exec(row.dateTime || '');
  const month = display && ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(display[2]);
  const displayTime = month >= 0 && display
    ? Date.UTC(Number(display[3]), month, Number(display[1]), Number(display[4]), Number(display[5]), Number(display[6]))
    : NaN;
  const value = row.measuredAt || row.dsProcessedAt || row.createdAt || row.updatedAt;
  const time = value && (row.measuredAt || row.dsProcessedAt || !Number.isFinite(displayTime))
    ? new Date(value).getTime() : displayTime;
  return Number.isFinite(time) ? time : 0;
};

export const groupKey = (row) => {
  const order = present(row.orderId);
  const ref = present(row.refNo);
  if (order && ref) return JSON.stringify(['order-ref', order, ref]);
  if (ref) return JSON.stringify(['ref', ref]);
  if (order) return JSON.stringify(['order', order]);
  return JSON.stringify(['record', row.id]);
};

export function groupMeasurementRecords(rows) {
  const groups = new Map();
  [...rows].sort((a, b) => recordTime(b) - recordTime(a) || String(b.id).localeCompare(String(a.id)))
    .forEach((row) => {
      const key = groupKey(row);
      if (!groups.has(key)) groups.set(key, { key, records: [] });
      groups.get(key).records.push(row);
    });
  return [...groups.values()];
}
