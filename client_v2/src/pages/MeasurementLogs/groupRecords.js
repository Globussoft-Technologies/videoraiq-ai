const present = (value) => {
  const text = String(value ?? '').trim();
  return text && text !== '—' ? text : '';
};

export const recordTime = (row) => {
  const value = row.createdAt;
  const time = value ? new Date(value).getTime() : NaN;
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
