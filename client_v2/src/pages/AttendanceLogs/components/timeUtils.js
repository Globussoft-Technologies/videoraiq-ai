// Generate hour options (1-12 for 12-hour format)
export const generateHourOptions = () => {
  const options = [];
  for (let i = 1; i <= 12; i++) {
    options.push(String(i).padStart(2, '0'));
  }
  return options;
};

// Generate minute options (0-59)
export const generateMinuteOptions = () => {
  const options = [];
  for (let i = 0; i < 60; i++) {
    options.push(String(i).padStart(2, '0'));
  }
  return options;
};

// Generate period options (AM/PM)
export const generatePeriodOptions = () => ['AM', 'PM'];

/**
 * Parse a 12-hour time string ("HH:MM AM/PM" or "HH:MM") into parts.
 * Returns { hour, minute, period } with empty strings when unparseable.
 */
export const parseTime = (timeString) => {
  if (!timeString || timeString.trim() === '') {
    return { hour: '', minute: '', period: '' };
  }

  const parts = timeString.trim().split(' ');
  const timePart = parts[0] || '';
  const period = parts[1]?.toUpperCase() || '';

  const [hour, minute] = timePart.split(':');

  return {
    hour: hour || '',
    minute: minute || '',
    period: ['AM', 'PM'].includes(period) ? period : '',
  };
};

/** Format time parts to "HH:MM AM/PM"; returns '' if any part is missing. */
export const formatTime = (hour, minute, period) => {
  if (hour && minute && period) {
    const h = String(hour).padStart(2, '0');
    const m = String(minute).padStart(2, '0');
    return `${h}:${m} ${period}`;
  }
  return '';
};
