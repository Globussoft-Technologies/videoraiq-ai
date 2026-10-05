import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import moment from 'moment-timezone';
import { fetchTimezone } from '@/helpers/administer';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_TIMEZONE, setConfiguredTimezone } from '@/utils/timezone';

export { DEFAULT_TIMEZONE } from '@/utils/timezone';

const TimezoneContext = createContext({
  timezone: DEFAULT_TIMEZONE,
  loading: true,
  refreshTimezone: async () => DEFAULT_TIMEZONE,
  setTimezone: () => {},
});

const normalizeTimezone = (value) => (
  value && moment.tz.zone(value) ? value : DEFAULT_TIMEZONE
);

export function TimezoneProvider({ children }) {
  const { user } = useAuth();
  const [timezone, setTimezoneState] = useState(DEFAULT_TIMEZONE);
  const [loading, setLoading] = useState(false);

  const setTimezone = useCallback((value) => {
    setTimezoneState(normalizeTimezone(value));
  }, []);

  const refreshTimezone = useCallback(async () => {
    if (!user?.adminId && !user?.user_id && !user?.userId) {
      setTimezoneState(DEFAULT_TIMEZONE);
      return DEFAULT_TIMEZONE;
    }
    setLoading(true);
    try {
      const next = normalizeTimezone(await fetchTimezone());
      setTimezoneState(next);
      return next;
    } catch {
      setTimezoneState(DEFAULT_TIMEZONE);
      return DEFAULT_TIMEZONE;
    } finally {
      setLoading(false);
    }
  }, [user?.adminId, user?.user_id, user?.userId]);

  useEffect(() => {
    refreshTimezone();
  }, [refreshTimezone]);

  useEffect(() => {
    // Existing moment() call sites now inherit the tenant's configured zone.
    setConfiguredTimezone(timezone);
  }, [timezone]);

  const value = useMemo(() => ({
    timezone,
    loading,
    refreshTimezone,
    setTimezone,
  }), [timezone, loading, refreshTimezone, setTimezone]);

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

export function useTimezone() {
  return useContext(TimezoneContext);
}
