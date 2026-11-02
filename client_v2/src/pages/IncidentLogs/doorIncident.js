export const isDoorResolved = (row) => row.isResolved === true ||
  (row.isResolved == null && /resolved$/i.test(String(row.incidentName || '').trim()));

export const doorStatusLabel = (row) => isDoorResolved(row)
  ? 'Resolved'
  : ({ open: 'Open', closed: 'Closed' }[String(row.doorStatus || '').toLowerCase()] || '--');

export const doorDurationLabel = (row) => {
  const state = String(row.doorStatus || '').toLowerCase();
  if (state !== 'open' && state !== 'closed') return 'Duration';
  return isDoorResolved(row) ? `Was ${state} for` : `${state[0].toUpperCase()}${state.slice(1)} for`;
};

export const matchesDoorFilter = (row, filter) => filter === 'resolved'
  ? isDoorResolved(row)
  : !isDoorResolved(row) && String(row.doorStatus || '').trim().toLowerCase() === filter;
