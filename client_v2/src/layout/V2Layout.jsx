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
import { useApi } from '../hooks/useApi';
import { timeAgo } from '../lib/format';

const SEV_COLOR = { high: 'var(--crit)', critical: 'var(--crit)', moderate: 'var(--warn)', medium: 'var(--warn)', low: 'var(--tx3)' };

// Read notification ids persist locally so the unread badge stays cleared
// across the 60s poll refresh and page reloads (the alerts feed itself has
// no per-user read state on the server).
const CAM_HEALTH_KEY = 'vq_cam_health';
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
  const { data: locations } = useApi(() => getLocations({ limit: 100 }), []);
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
    // Person-count incidents have no image and are excluded from the Alerts
    // feed entirely (they're a running daily tally, not a snapshot event) —
    // route those to Person Count Logs instead, everything else as usual.
    go: a.incidentType === 'countPersons'
      ? () => navigate('/logs/person-count', {
          state: {
            nvrIds: a.nvrId?._id ? [a.nvrId._id] : [],
            channelIds: a.channelId?._id ? [a.channelId._id] : [],
            date: a.timeOfIncident ? a.timeOfIncident.slice(0, 10) : undefined,
          },
        })
      : a._id
        ? () => navigate('/alerts', { state: { alertId: a._id } })
        : undefined,
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

  const outletCtx = useMemo(
    () => ({
      siteFilter,
      location: siteRaw?.locationName || siteRaw?.name || (siteFilter !== 'All Sites' ? siteFilter : ''),
      sites,
      setCamHealth,
    }),
    [siteFilter, siteRaw, sites]
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
          <Outlet context={outletCtx} />
        </div>
        {/* Hidden on the assistant's own page — nothing to launch from there. */}
        {viewKey !== 'assistant' && <AssistantLauncher />}
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
