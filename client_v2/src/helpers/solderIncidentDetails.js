import { formatUtcInConfiguredTimezone } from '../utils/timezone.js';

export function solderSeconds(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return '—';
  return `${Number(value)} s`;
}

export function solderAbsenceFields(item) {
  return [
    ['Zone', item.zone || '—'],
    ['Persons / capacity', `${item.personCount ?? '—'} / ${item.capacity ?? '—'}`],
    ['Threshold', solderSeconds(item.thresholdSec)],
    ['Duration', solderSeconds(item.durationSec)],
    ['Returned', item.returnedAt
      ? formatUtcInConfiguredTimezone(item.returnedAt, 'DD MMM YYYY HH:mm:ss', '—')
      : 'Not returned'],
  ];
}
