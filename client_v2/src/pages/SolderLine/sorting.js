import moment from 'moment-timezone';

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const unavailable = /^(?:\s*|\u2014|-|not returned|not reported|no snapshot|no image)$/i;

function comparable(value, key) {
  if (value == null || unavailable.test(String(value))) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date || moment.isMoment(value)) return Number.isFinite(+value) ? +value : null;
  const text = String(value).trim();
  if (/time|started|returned|hour/i.test(key)) {
    const date = moment(text, ['YYYY-MM-DD HH:mm:ss', 'DD MMM YYYY HH:mm:ss', 'DD MMM HH:mm:ss'], true);
    if (date.isValid()) return date.valueOf();
    const hour = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:-|$)/.exec(text);
    if (hour) return Number(hour[1]) * 3600 + Number(hour[2]) * 60 + Number(hour[3] || 0);
    const rangeStart = text.split('-')[0].trim();
    const rangeDate = moment(rangeStart, 'DD MMM YYYY HH:mm', true);
    if (rangeDate.isValid()) return rangeDate.valueOf();
  }
  if (/^-?\d+(?:,\d{3})*(?:\.\d+)?\s*%?$/.test(text)) return Number(text.replace(/[,%\s]/g, ''));
  if (/^(?:\d+(?:\.\d+)?\s*[hms]\s*)+$/.test(text)) {
    return [...text.matchAll(/(\d+(?:\.\d+)?)\s*([hms])/g)].reduce((sum, [, count, unit]) => sum + Number(count) * ({ h: 3600, m: 60, s: 1 }[unit]), 0);
  }
  return text;
}

/** Stable sorting of the full data set; missing values stay last in either direction. */
export function sortRows(rows, sort, getValue = (row, key) => row[key]) {
  if (!sort?.key) return rows;
  return rows.map((row, index) => ({ row, index, value: comparable(getValue(row, sort.key), sort.key) }))
    .sort((a, b) => {
      if (a.value == null || b.value == null) return (a.value == null ? 1 : 0) - (b.value == null ? 1 : 0) || a.index - b.index;
      const order = typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : natural.compare(String(a.value), String(b.value));
      return order * (sort.direction === 'desc' ? -1 : 1) || a.index - b.index;
    }).map(item => item.row);
}
