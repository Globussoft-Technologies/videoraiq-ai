// Static option lists + shared styling for the Mattress Measurement Logs page.
// All row / KPI / analytics data comes from the API (see ./api.js).

// Per-format brand colours — shared by the toolbar export chips, the Download
// Report cards and the schedule modal's "Attach formats" chips.
export const FMT_COLOR = { PDF: '#ff4d4d', XLSX: '#22c55e', CSV: '#22d3ee' };

export const DOWNLOADS = [
  { fmt: 'PDF', c: FMT_COLOR.PDF, title: 'QC Measurement Report', sub: 'Snapshots, QR payload & per-axis deviation table' },
  { fmt: 'XLSX', c: FMT_COLOR.XLSX, title: 'Excel Workbook', sub: 'Raw rows, deviation columns & pivot-ready summary sheet' },
  { fmt: 'CSV', c: FMT_COLOR.CSV, title: 'Flat CSV', sub: 'Machine-readable feed for ERP / MES ingestion' },
];

export const REPORT_OPTS = [
  { v: 'full', l: 'Full Records' },
  { v: 'pass', l: 'Pass Only', d: 'Only units that measured within tolerance' },
  { v: 'mismatch', l: 'Mismatched Units Only', d: 'Only units whose measured size is out of tolerance' },
  { v: 'qrerror', l: 'QR Error Report', d: 'Only records where the QR code could not be read' },
];

export const FREQ_OPTS = [
  { v: 'daily', l: 'Daily' },
  { v: 'weekly', l: 'Weekly' },
  { v: 'monthly', l: 'Monthly' },
  { v: 'custom', l: 'Custom' },
];

export const DAY_OPTS = [
  { v: 'mon', l: 'Monday' },
  { v: 'tue', l: 'Tuesday' },
  { v: 'wed', l: 'Wednesday' },
  { v: 'thu', l: 'Thursday' },
  { v: 'fri', l: 'Friday' },
  { v: 'sat', l: 'Saturday' },
  { v: 'sun', l: 'Sunday' },
];

export const STATUS_META = {
  pass: { label: 'Pass', color: 'var(--ok)' },
  mismatch: { label: 'Mismatch', color: 'var(--crit)' },
  qrerr: { label: 'QR Error', color: 'var(--warn)' },
};

export const devColor = (d) => {
  if (d === '—' || d === '±0.0') return 'var(--tx3)';
  const n = Math.abs(parseFloat(d));
  if (Number.isNaN(n)) return 'var(--tx3)';
  if (n >= 0.5) return 'var(--crit)';
  if (n >= 0.3) return 'var(--warn)';
  return 'var(--ok)';
};
