import { useCallback, useMemo, useState } from 'react';
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

function currentViewKey(pathname) {
  // /v2 or /v2/  -> overview ; /v2/<key> -> key
  const m = pathname.replace(/^\/v2\/?/, '');
  const seg = m.split('/')[0];
  return seg || 'overview';
}

function Shell() {
  const { theme } = useTheme();
  const location = useLocation();
  const viewKey = currentViewKey(location.pathname);
  const meta = VIEW_META[viewKey] || VIEW_META.overview;

  const [siteFilter, setSiteFilter] = useState('All Sites');
  const [siteRaw, setSiteRaw] = useState(null);

  // Sites for the switcher (locations master data).
  const { data: locations } = useApi(() => getLocations({ limit: 100 }), []);
  const sites = Array.isArray(locations) ? locations : [];

  // Notifications + alerts badge from the recent alert feed.
  const { data: crit } = useApi(() => getCriticalityStats({}, { skip: 0, limit: 8 }), [], { pollMs: 60000 });
  const recentAlerts = crit?.recentAlerts || [];
  const notifications = recentAlerts.map((a, i) => ({
    id: a._id || i,
    title: a.incidentName || a.displayName || a.incidentType || 'Detection event',
    cam: a.channelData?.name || a.nvrData?.nvrName || '',
    time: a.timeAgo || timeAgo(a.timeOfIncident),
    sevColor: SEV_COLOR[(a.severity || '').toLowerCase()] || 'var(--warn)',
  }));
  const alertsBadge = recentAlerts.filter((a) => !a.resolved).length || crit?.totalCount || 0;

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
      <Sidebar badges={{ alerts: alertsBadge }} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header
          title={meta.title}
          sub={meta.sub}
          sites={sites}
          siteFilter={siteFilter}
          onSiteChange={onSiteChange}
          notifications={notifications}
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
