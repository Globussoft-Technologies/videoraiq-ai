import { useEffect, useState } from 'react';
import moment from 'moment-timezone';
import { useTimezone } from '@/context/TimezoneContext';

/** Live clock in the admin-selected timezone, ticking every second. */
export function useClock() {
  const { timezone } = useTimezone();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const zoned = moment(now).tz(timezone);
  const zoneLabel = String(timezone || 'Asia/Kolkata').toUpperCase();
  return `${zoned.format('hh:mm:ss A')} (${zoneLabel})`;
}
