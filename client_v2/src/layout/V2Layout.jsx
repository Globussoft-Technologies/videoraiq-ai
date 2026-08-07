import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { V2ThemeProvider, useTheme } from '../theme/ThemeContext';
import Sidebar from './Sidebar';
import Header from './Header';
import AssistantLauncher from '../components/AssistantLauncher';
import CameraLimitLock from '../components/CameraLimitLock';
import { VIEW_META } from './nav.config';
import { getLocations } from '../helpers/monitoring';
import { getCriticalityStats } from '../helpers/dashboard';
import { getCamerasStatus } from '../helpers/cameraStatus';
import { useApi } from '../hooks/useApi';
import { timeAgo } from '../lib/format';

const SEV_COLOR = { high: 'var(--crit)', critical: 'var(--crit)', moderate: 'var(--warn)', medium: 'var(--warn)', low: 'var(--tx3)' };

// Incident types the Alerts feed deliberately leaves out: it only lists
// incidents carrying a snapshot image, and these two never have one (a person
// count is a running daily tally; a line cross is a tripwire event). Deep
// linking them to /alerts lands on a card that isn't in the list, so each goes
// to its own log page instead.
const LOG_PAGE_BY_INCIDENT_TYPE = {
  countPersons: '/logs/person-count',
  lineCrossing: '/logs/line-crossing',
};

// Where clicking a bell-tray notification takes the user.
function notificationTarget(alert, navigate) {
  const logPage = LOG_PAGE_BY_INCIDENT_TYPE[alert.incidentType];
  if (logPage) {
    return () => navigate(logPage, {
      state: {
        nvrIds: alert.nvrId?._id ? [alert.nvrId._id] : [],
        channelIds: alert.channelId?._id ? [alert.channelId._id] : [],
        date: alert.timeOfIncident ? alert.timeOfIncident.slice(0, 10) : undefined,
      },
    });
  }
  if (!alert._id) return undefined;
  return () => navigate('/alerts', { state: { alertId: alert._id } });
}

// Read notification ids persist locally so the unread badge stays cleared
// across the 60s poll refresh and page reloads (the alerts feed itself has
// no per-user read state on the server).
const CAM_HEALTH_KEY = 'vq_cam_health';
const SERVER_NETWORK_KEY = 'vq_server_network';
const READ_IDS_KEY = 'vq_read_notification_ids';
function loadReadIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_IDS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function saveReadIds(ids) {
  try {
    localStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

// Maps a route path segment to its nav/VIEW_META key, for the handful of
// routes whose URL segment (nav.config.js `path`) differs from its `key`.
const PATH_TO_KEY = { dashboard: 'overview', live: 'wall', playback: 'camera' };

function currentViewKey(pathname) {
  // /dashboard -> overview ; /live -> wall ; /<key> -> key ; /logs/<key> -> key
  const m = pathname.replace(/^\//, '');
  const segs = m.split('/');
  let seg = segs[0] || 'overview';
  if (seg === 'logs') seg = segs[1] || 'overview';
  return PATH_TO_KEY[seg] || seg;
}

function Shell() {
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const viewKey = currentViewKey(location.pathname);
  const meta = VIEW_META[viewKey] || VIEW_META.overview;

  const [siteFilter, setSiteFilter] = useState('All Sites');
  const [siteRaw, setSiteRaw] = useState(null);

  // Below md the sidebar becomes an off-canvas drawer so it doesn't eat the
  // (already narrow) content width. A hamburger in the header opens it.
  const [isMobile, setIsMobile] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // Close the drawer on navigation.
  useEffect(() => setNavOpen(false), [location.pathname]);

  // Sites for the switcher (locations master data).
  const { data: locations, refetch: refreshSites } = useApi(() => getLocations(0, 100), []);
  const sites = Array.isArray(locations) ? locations : [];

  // Notifications + alerts badge from the recent alert feed.
  const { data: crit } = useApi(() => getCriticalityStats({}, { skip: 0, limit: 8 }), [], { pollMs: 60000 });
  const recentAlerts = crit?.recentAlerts || [];
  const [readIds, setReadIds] = useState(loadReadIds);
  const notifications = recentAlerts.map((a, i) => ({
    id: a._id || i,
    title: a.incidentName || a.displayName || a.incidentType || 'Detection event',
    cam: a.channelData?.name || a.nvrData?.nvrName || '',
    // Derive relative time from the raw timestamp client-side so the bell
    // tray matches the incident card's actual time instead of the backend's
    // floored whole-hour string (e.g. 2h 38m reading as "2 hours ago").
    time: timeAgo(a.timeOfIncident),
    sevColor: SEV_COLOR[(a.severity || '').toLowerCase()] || 'var(--warn)',
    read: readIds.has(a._id || i),
    go: notificationTarget(a, navigate),
  }));
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markNotificationsRead = useCallback((ids) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      saveReadIds(next);
      return next;
    });
  }, []);

  const onSiteChange = useCallback((label, raw) => {
    setSiteFilter(label);
    setSiteRaw(label === 'All Sites' ? null : raw);
  }, []);

  // Shared context for child views (selected site -> location filter for the dashboard APIs).
  // Camera online/total, reported by the stream probe (Command Center / Detection
  // Settings) and shown in the Sidebar footer. Lives here because this component
  // renders both. Persisted to localStorage and seeded from it so the footer bar
  // still shows the last-known tally on a direct page open / full reload, instead
  // of blanking until a probing page is visited again.
  const [camHealth, setCamHealth] = useState(() => {
    try {
      const saved = localStorage.getItem(CAM_HEALTH_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (camHealth) localStorage.setItem(CAM_HEALTH_KEY, JSON.stringify(camHealth));
    } catch {
      /* ignore */
    }
  }, [camHealth]);

  // This server's own internet uplink (server_network from the Camera Status
  // API — see CAMERA_STATUS_API.md). Global, not per-camera, so it's fetched
  // once here rather than by whichever page happens to be probing cameras;
  // shown in the Sidebar footer next to the camera health tally. Persisted
  // the same way camHealth is, so it doesn't blank out on a reload.
  const [serverNetwork, setServerNetwork] = useState(() => {
    try {
      const saved = localStorage.getItem(SERVER_NETWORK_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const networkStatusApi = useApi(() => getCamerasStatus(), [], { pollMs: 20000 });
  useEffect(() => {
    if (networkStatusApi.data?.server_network) setServerNetwork(networkStatusApi.data.server_network);
  }, [networkStatusApi.data]);
  useEffect(() => {
    try {
      if (serverNetwork) localStorage.setItem(SERVER_NETWORK_KEY, JSON.stringify(serverNetwork));
    } catch {
      /* ignore */
    }
  }, [serverNetwork]);

  const outletCtx = useMemo(
    () => ({
      siteFilter,
      location: siteRaw?.locationName || siteRaw?.name || (siteFilter !== 'All Sites' ? siteFilter : ''),
      sites,
      refreshSites,
      camHealth,
      setCamHealth,
      serverNetwork,
    }),
    [siteFilter, siteRaw, sites, refreshSites, camHealth, serverNetwork]
  );

  return (
    <div
      className="vq-root"
      data-vq-theme={theme}
      style={{
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
        fontFamily: 'var(--ui)',
        color: 'var(--tx)',
        background: 'var(--appbg)',
        transition: 'background .3s ease,color .3s ease',
      }}
    >
      <Sidebar
        isMobile={isMobile}
        mobileOpen={navOpen}
        onMobileClose={() => setNavOpen(false)}
        camHealth={camHealth}
        serverNetwork={serverNetwork}
      />
      <CameraLimitLock />
      {/* Drawer backdrop (mobile only) */}
      {isMobile && navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 75 }}
        />
      )}
      {/* `position: relative` anchors the AI Assistant launcher to the bottom-right
          of the content area rather than the viewport, so it tracks the content
          column as the sidebar collapses instead of floating over it. */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        <Header
          title={meta.title}
          sub={meta.sub}
          sites={sites}
          siteFilter={siteFilter}
          onSiteChange={onSiteChange}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkNotificationsRead={markNotificationsRead}
          onMenuClick={isMobile ? () => setNavOpen(true) : undefined}
        />
        <div className="vq-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            <Outlet context={outletCtx} />
            <footer
              style={{
                marginTop: 'auto',
                padding: '16px 24px 18px',
                textAlign: 'center',
                fontSize: 11.5,
                color: 'var(--tx3)',
              }}
            >
              © 2026 VideoraIQ. All rights reserved.
            </footer>
          </div>
        </div>
        {/* Hidden on the assistant's own page — nothing to launch from there. */}
        {/* {viewKey !== 'assistant' && <AssistantLauncher />} */}
      </main>
    </div>
  );
}

export default function V2Layout() {
  return (
    <V2ThemeProvider defaultTheme="light">
      <Shell />
    </V2ThemeProvider>
  );
}
