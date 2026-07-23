import moment from 'moment';

export const axisLabels = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'];

export const formatTime = (mins) => {
  const totalSeconds = Math.floor(mins * 60);
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

// UTC → local time-of-day, expressed in minutes since midnight.
const getMinutes = (date) => {
  const d = moment.utc(date).local();
  return d.hours() * 60 + d.minutes() + d.seconds() / 60;
};

export const buildSegmentsFromIncidents = (incidents) => {
  if (!incidents || incidents.length === 0) return [];

  const sorted = [...incidents].sort((a, b) => new Date(a.timeOfIncident) - new Date(b.timeOfIncident));
  const segments = [];

  let startMinute = getMinutes(sorted[0].timeOfIncident);
  let currentState = sorted[0].personPresent;

  for (let i = 1; i < sorted.length; i++) {
    const minute = getMinutes(sorted[i].timeOfIncident);

    if (sorted[i].personPresent !== currentState) {
      const width = ((minute - startMinute) / 1440) * 100;
      const left = (startMinute / 1440) * 100;

      if (width > 0) {
        segments.push({
          type: currentState ? 'presence' : 'absence',
          width,
          left,
          label: `${formatTime(startMinute)} - ${formatTime(minute)} : ${currentState ? 'Presence' : 'Absence'}`,
        });
      }

      startMinute = minute;
      currentState = sorted[i].personPresent;
    }
  }

  const lastMinute = getMinutes(sorted[sorted.length - 1].timeOfIncident);
  const width = ((lastMinute - startMinute) / 1440) * 100;
  const left = (startMinute / 1440) * 100;

  if (width > 0) {
    segments.push({
      type: currentState ? 'presence' : 'absence',
      width,
      left,
      label: `${formatTime(startMinute)} - ${formatTime(lastMinute)} : ${currentState ? 'Presence' : 'Absence'}`,
    });
  }

  return segments;
};
