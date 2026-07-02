import { useEffect, useState } from 'react';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Live IST clock string "hh:MM:SS AM/PM IST", ticking every second. */
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const h24 = ist.getUTCHours();
  const period = h24 >= 12 ? 'PM' : 'AM';
  const hh = String(h24 % 12 || 12).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  const ss = String(ist.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss} ${period} IST`;
}
