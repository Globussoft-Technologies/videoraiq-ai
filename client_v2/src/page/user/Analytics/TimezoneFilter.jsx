import { useMemo } from 'react';
import SearchableSelect from '../../../components/SearchableSelect';
import { useApi } from '../../../hooks/useApi';
import { getTimezones } from '../../../helpers/administer';

const STORAGE_KEY = 'analytics_timezone';
const DEFAULT_TZ = 'Asia/Kolkata';

export function defaultTimezone() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_TZ;
}

export default function TimezoneFilter({ timezone, onChange }) {
  // Same source as the admin Timezone field (SystemSettings) — the full IANA
  // list. Falls back to just the current value + IST/UTC while it's loading.
  const timezonesApi = useApi(() => getTimezones(), []);
  const options = useMemo(() => {
    const list = Array.isArray(timezonesApi.data) ? timezonesApi.data : [];
    return [...new Set([timezone, DEFAULT_TZ, 'UTC', ...list].filter(Boolean))];
  }, [timezonesApi.data, timezone]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontFamily: 'var(--ui)', fontSize: 11.5, color: 'var(--tx3)' }}>Time zone</span>
      <div style={{ width: 210 }}>
        <SearchableSelect
          value={timezone}
          options={options}
          onChange={(next) => {
            localStorage.setItem(STORAGE_KEY, next);
            onChange(next);
          }}
          disabled={timezonesApi.loading}
          placeholder="Select timezone"
          searchPlaceholder="Search timezone..."
          emptyLabel="No timezones found"
        />
      </div>
    </div>
  );
}
