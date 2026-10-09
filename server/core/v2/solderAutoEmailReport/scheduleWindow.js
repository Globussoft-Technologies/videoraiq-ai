import moment from 'moment-timezone';

/** Latest scheduled send time and its report period, in the organisation timezone. */
export function scheduledWindow(schedule, timezone, now = moment()) {
  if (!schedule?.frequency) return null;
  const local = moment(now).tz(timezone);
  const atTime = (day) => moment.tz(`${day.format('YYYY-MM-DD')} ${schedule.time || '07:00'}`, 'YYYY-MM-DD HH:mm', timezone);
  let due;
  if (schedule.frequency === 'custom') {
    // Send a completed custom date range on the following day at the chosen time.
    const start = moment.tz(schedule.startDate, 'YYYY-MM-DD', timezone).startOf('day');
    const end = moment.tz(schedule.endDate, 'YYYY-MM-DD', timezone).startOf('day').add(1, 'day');
    due = atTime(end);
    return due.isAfter(local) ? null : { start, end, due, key: due.toISOString() };
  }
  due = atTime(local);
  if (schedule.frequency === 'weekly') {
    const days = (local.day() - (schedule.weekday ?? 1) + 7) % 7;
    due = atTime(local.clone().subtract(days, 'days'));
    if (due.isAfter(local)) due = atTime(due.clone().subtract(7, 'days'));
  } else if (schedule.frequency === 'monthly') {
    due = atTime(local.clone().date(schedule.dayOfMonth || 1));
    if (due.isAfter(local)) due = atTime(due.clone().subtract(1, 'month'));
  } else if (due.isAfter(local)) due = atTime(local.clone().subtract(1, 'day'));
  const start = due.clone().subtract(1, schedule.frequency === 'monthly' ? 'month' : schedule.frequency === 'weekly' ? 'week' : 'day');
  return { start, end: due.clone(), due, key: due.toISOString() };
}
