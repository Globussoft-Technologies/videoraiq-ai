import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { V2ThemeProvider, useTheme } from '../theme/ThemeContext';
import Sidebar from './Sidebar';
import Header from './Header';
import { VIEW_META } from './nav.config';
import { getLocations } from '../helpers/monitoring';
import { getCriticalityStats } from '../helpers/dashboard';
import { useApi } from '../hooks/useApi';
import { timeAgo } from '../lib/format';

const SEV_COLOR = { high: 'var(--crit)', critical: 'var(--crit)', moderate: 'var(--warn)', medium: 'var(--warn)', low: 'var(--tx3)' };

// Read notification ids persist locally so the unread badge stays cleared
// across the 60s poll refresh and page reloads (the alerts feed itself has
// no per-user read state on the server).
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
const PATH_TO_KEY = { dashboard: 'overview', live: 'wall' };

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
    time: a.timeAgo || timeAgo(a.timeOfIncident),
    sevColor: SEV_COLOR[(a.severity || '').toLowerCase()] || 'var(--warn)',
    read: readIds.has(a._id || i),
  }));
  const unreadCount = notifications.filter((n) => !n.read).length;
  const alertsBadge = recentAlerts.filter((a) => !a.resolved).length || crit?.totalCount || 0;

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
  const outletCtx = useMemo(
    () => ({
      siteFilter,
      location: siteRaw?.locationName || siteRaw?.name || (siteFilter !== 'All Sites' ? siteFilter : ''),
      sites,
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
        badges={{ alerts: alertsBadge }}
        isMobile={isMobile}
        mobileOpen={navOpen}
        onMobileClose={() => setNavOpen(false)}
      />
      {/* Drawer backdrop (mobile only) */}
      {isMobile && navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 75 }}
        />
      )}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
