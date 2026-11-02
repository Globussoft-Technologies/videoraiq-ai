// Format API values at the presentation boundary as well, since a running
// backend may still send the earlier 24-hour time and dateTime strings.
export const formatTime12 = (value) => {
  const text = String(value ?? '');
  const match = /^(\d{1,2}):(\d{2})(:\d{2})?(?:\s*(AM|PM))?$/i.exec(text);
  if (!match) return text;
  const hour = Number(match[1]);
  if (hour > 23 || (match[4] && (hour < 1 || hour > 12))) return text;
  const period = match[4]?.toUpperCase() || (hour >= 12 ? 'PM' : 'AM');
  return `${String(hour % 12 || 12).padStart(2, '0')}:${match[2]}${match[3] || ''} ${period}`;
};

export const formatWhen12 = (row) => {
  const value = row.dateTime;
  if (value && value !== '—') {
    return value.replace(/(\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)$/i,
      (time) => formatTime12(time));
  }
  return formatTime12(row.time);
};
