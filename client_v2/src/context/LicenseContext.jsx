import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getLicense, IS_LICENSING_ENABLED } from '../helpers/license';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

/**
 * The client's detection licence, fetched once per session and shared.
 *
 * The superadmin decides which detections a client has; this makes that
 * decision available to any component that renders or gates on a detection —
 * chiefly the sidebar, which shows a per-detection log page for ANPR, Person
 * Count, Crusher and the rest. Those pages are gated on role permissions only,
 * so without this a client with nothing licensed still sees every one of them.
 *
 * The API responses are already filtered server-side, so this is presentation
 * gating, not the enforcement boundary — the backend refuses unlicensed writes
 * regardless of what the UI shows.
 */
const LicenseContext = createContext({
  license: null,
  allowedDetections: new Set(),
  loading: true,
  refresh: () => {},
});

export const LicenseProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket() || {};
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);
  // Same out-of-order guard the permission provider uses: a fetch started for a
  // previous user must never overwrite the current user's licence.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    // Licensing off: there is no licence endpoint worth calling, and
    // `license: null` is what every consumer already treats as "unrestricted".
    if (!IS_LICENSING_ENABLED) {
      setLicense(null);
      setLoading(false);
      return;
    }
    if (!user) {
      if (requestId === requestIdRef.current) {
        setLicense(null);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const data = await getLicense();
      if (requestId === requestIdRef.current) setLicense(data || null);
    } catch (error) {
      if (requestId === requestIdRef.current) setLicense(null);
      // eslint-disable-next-line no-console
      console.error('[LicenseContext]', error?.message || error);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Enabling or disabling a detection changes what is in use, and can change
  // which log pages apply. toggleChannelDetection already broadcasts this.
  useEffect(() => {
    const onToggle = () => refresh();
    window.addEventListener('vq-detection-toggle-change', onToggle);
    return () => window.removeEventListener('vq-detection-toggle-change', onToggle);
  }, [refresh]);

  // Live push from the superadmin. Granting or revoking a detection there used
  // to be invisible here until a reload — the camera licence has always been
  // pushed, and this is the matching channel for detection configuration.
  // The payload is the same shape /client-config/license returns, so it is
  // applied directly rather than triggering another fetch.
  useEffect(() => {
    const adminId = user?.adminId;
    if (!IS_LICENSING_ENABLED || !socket || !adminId) return;

    const handler = (payload) => {
      if (!payload || typeof payload !== 'object') return;
      // A push supersedes any fetch still in flight, so claim the request id
      // too — otherwise a slower GET could overwrite this newer state.
      requestIdRef.current += 1;
      setLicense(payload);
      setLoading(false);
    };

    socket.on(`detectionLicense_${adminId}`, handler);
    return () => socket.off(`detectionLicense_${adminId}`, handler);
  }, [socket, user?.adminId]);

  const allowedDetections = new Set(license?.allowedDetections || []);

  return (
    <LicenseContext.Provider value={{ license, allowedDetections, loading, refresh }}>
      {children}
    </LicenseContext.Provider>
  );
};

export const useLicense = () => useContext(LicenseContext);

export default LicenseContext;
