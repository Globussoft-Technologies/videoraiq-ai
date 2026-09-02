import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import moment from 'moment';
import KpiRow from './KpiRow';
import LiveCamera from './LiveCamera';
import LiveAttendance from './LiveAttendance';
import LatestIncident from './LatestIncident';
import LiveThreatFeed from './LiveThreatFeed';
import SystemControls from './SystemControls';
import EngineActivity from './EngineActivity';
import MultiSiteNetwork from './MultiSiteNetwork';
import SharedMultiSelect from '../../../components/MultiSelect';
import { useApi } from '../../../hooks/useApi';
import { getHeaderStats, getDetectionChart, getCriticalityStats, getRecentIncidents } from '../../../helpers/dashboard';
import { getChannels, getLocations, getNVRs, getDepartments } from '../../../helpers/monitoring';
import { fetchIncidents } from '../../../helpers/incidents';
import { usePermissions } from '@/context/PermissionContext';

const DETECTION_SAMPLE_LIMIT = 1000;

const CAMERA_TYPE_OPTIONS = [
  { id: 'checkin', label: 'Check In' },
  { id: 'checkout', label: 'Check Out' },
];
const ALL_STATUS_FILTER = ['new', 'resolved', 'reported'];

function severityFilterValue(value) {
  if (value === 'high') return ['high', 'High', 'HIGH'];
  if (value === 'moderate') return ['moderate', 'medium', 'Moderate', 'Medium', 'MODERATE', 'MEDIUM'];
  if (value === 'low') return ['low', 'Low', 'LOW'];
  return value;
}

async function getDashboardIncidentCounts(filters = {}) {
  const baseFilter = { ...filters, statusFilter: ALL_STATUS_FILTER };
  const result = await fetchIncidents({ skip: 0, limit: 1 }, baseFilter);
  const counts = result.counts || {};

  if (counts.severity && counts.status) {
    return {
      severity: {
        all: Number(counts.severity.all ?? result.totalCount) || 0,
        high: Number(counts.severity.high) || 0,
        moderate: Number(counts.severity.moderate ?? counts.severity.medium) || 0,
        low: Number(counts.severity.low) || 0,
      },
      status: {
        all: Number(counts.status.all ?? result.totalCount) || 0,
        new: Number(counts.status.new) || 0,
        resolved: Number(counts.status.resolved) || 0,
        reported: Number(counts.status.reported) || 0,
      },
    };
  }

  const [high, active, resolved, reported] = await Promise.all([
    fetchIncidents({ skip: 0, limit: 1 }, { ...filters, severity: severityFilterValue('high'), statusFilter: ALL_STATUS_FILTER }),
    fetchIncidents({ skip: 0, limit: 1 }, { ...filters, statusFilter: 'new' }),
    fetchIncidents({ skip: 0, limit: 1 }, { ...filters, statusFilter: 'resolved' }),
    fetchIncidents({ skip: 0, limit: 1 }, { ...filters, statusFilter: 'reported' }),
  ]);

  return {
    severity: {
      all: Number(result.totalCount) || 0,
      high: Number(high.totalCount) || 0,
      moderate: 0,
      low: 0,
    },
    status: {
      all: Number(result.totalCount) || 0,
      new: Number(active.totalCount) || 0,
      resolved: Number(resolved.totalCount) || 0,
      reported: Number(reported.totalCount) || 0,
    },
  };
}

function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function extractKpiDayCounts(result = {}) {
  const counts = result.counts || {};
  return {
    activeAlerts: toCount(counts.status?.new),
    highAlerts: toCount(counts.severity?.high),
    events: toCount(counts.severity?.all ?? counts.status?.all ?? result.totalCount),
    resolved: toCount(counts.status?.resolved),
  };
}

async function getDashboardDailyComparison(filters = {}, today, previousDay) {
  const dailyFilter = (day) => ({
    ...filters,
    startDate: day,
    endDate: day,
    statusFilter: ALL_STATUS_FILTER,
  });

  const [todayResult, previousResult] = await Promise.all([
    fetchIncidents({ skip: 0, limit: 1 }, dailyFilter(today)),
    fetchIncidents({ skip: 0, limit: 1 }, dailyFilter(previousDay)),
  ]);

  return {
    today: extractKpiDayCounts(todayResult),
    previous: extractKpiDayCounts(previousResult),
  };
}

function dateFilter(daysAgo = 0) {
  return moment().subtract(daysAgo, 'days').format('YYYY-MM-DD');
}

function aggregateTodayEngines(items) {
  const counts = {};
  (items || []).forEach((it) => {
    const type = it.incidentType || 'unknown';
    counts[type] = (counts[type] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

function aggregate24hEvents(items) {
  const cutoff = moment().subtract(24, 'hours');
  const hourly = Array(24).fill(0);
  (items || []).forEach((it) => {
    const t = moment(it.timeOfIncident);
    if (!t.isValid() || t.isBefore(cutoff)) return;
    const h = t.hour();
    hourly[h] += 1;
  });
  return hourly;
}

export default function CommandCenter() {
  const ctx = useOutletContext() || {};
  const location = ctx.location || '';
  const sites = ctx.sites || [];

  // SystemControls renders nothing without this permission — when that's the
  // case the right column has no card next to NVR Interconnectivity, so it
  // should break out full-width instead of staying pinned to the left column.
  const { permissions } = usePermissions();
  const showSystemControls = !!permissions?.detectionSettings?.view && !!permissions?.detectionSettings?.edit;
  const dashboardGridRef = useRef(null);
  const networkSlotRef = useRef(null);
  const rightColumnRef = useRef(null);
  const [networkExpandedWidth, setNetworkExpandedWidth] = useState(null);

  useEffect(() => {
    if (!showSystemControls) {
      setNetworkExpandedWidth(null);
      return undefined;
    }

    const grid = dashboardGridRef.current;
    const networkSlot = networkSlotRef.current;
    const rightColumn = rightColumnRef.current;
    if (!grid || !networkSlot || !rightColumn || typeof ResizeObserver === 'undefined') return undefined;

    const updateNetworkWidth = () => {
      const gridRect = grid.getBoundingClientRect();
      const networkRect = networkSlot.getBoundingClientRect();
      const rightRect = rightColumn.getBoundingClientRect();
      const visibleRightChildren = [...rightColumn.children].filter((child) => child.getClientRects().length > 0);
      const lastRightChild = visibleRightChildren.at(-1);
      const lastRightBottom = lastRightChild?.getBoundingClientRect().bottom ?? rightRect.top;
      const isTwoColumnLayout = rightRect.left > networkRect.left + 1;
      const hasFreeSpaceOnRight = lastRightBottom <= networkRect.top + 1;
      const nextWidth = isTwoColumnLayout && hasFreeSpaceOnRight
        ? Math.round(gridRect.right - networkRect.left)
        : null;

      setNetworkExpandedWidth((currentWidth) => (
        currentWidth === nextWidth ? currentWidth : nextWidth
      ));
    };

    const resizeObserver = new ResizeObserver(updateNetworkWidth);
    resizeObserver.observe(grid);
    resizeObserver.observe(networkSlot);
    resizeObserver.observe(rightColumn);
    [...rightColumn.children].forEach((child) => resizeObserver.observe(child));
    window.addEventListener('resize', updateNetworkWidth);
    const animationFrame = window.requestAnimationFrame(updateNetworkWidth);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateNetworkWidth);
      resizeObserver.disconnect();
    };
  }, [showSystemControls]);

  // ── Filters (Location · NVR · Department · Camera Type) ──────────────────────
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [selectedNvrs, setSelectedNvrs] = useState([]);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedCamTypes, setSelectedCamTypes] = useState([]);

  // Real "N of the filtered cameras are actually streaming" tally — LiveCamera
  // probes every tab's stream in the background (not just the active one) since
  // there's no backend field for per-camera online status.
  const [onlineCameras, setOnlineCameras] = useState(() => ctx.camHealth || { online: 0, total: 0 });
  // Also hand it to the layout so the Sidebar footer can show the same number
  // — but only when LiveCamera is looking at the whole estate. While an NVR
  // filter is active it's reporting a deliberately narrower count, which
  // isn't a health reading for the account; leave the Sidebar showing its
  // last known full-estate reading rather than overwrite it with the
  // filtered one.
  const onOnlineCountChange = useCallback((online, total) => {
    setOnlineCameras({ online, total });
    if (selectedNvrs.length) return;
    ctx.setCamHealth?.({ online, total });
  }, [ctx.setCamHealth, selectedNvrs]);


 
  // Options for the filter dropdowns.
  const locationsApi = useApi(() => getLocations(0, 200), []);
  const nvrsApi = useApi(() => getNVRs(), []);
  const deptsApi = useApi(() => getDepartments({ limit: 200 }), []);

  const locationOptions = useMemo(
    () => (locationsApi.data || []).map((l) => {
      const label = l.locationName || l.name || String(l);
      // Value MUST be the location NAME, not the _id: the dashboard endpoints
      // filter via NVR.find({ location: { $in: [...] } }) where NVR.location is
      // the name string. Sending _id here matched nothing (the filter no-op'd).
      return { id: label, label };
    }),
    [locationsApi.data]
  );

  // Resolve any selected value (location _id OR name) to the NAME the backend
  // expects. This self-heals stale _id selections that lingered in state, so
  // the payload always sends names regardless of what's in selectedLocations.
  const locNameByKey = useMemo(() => {
    const m = {};
    (locationsApi.data || []).forEach((l) => {
      const name = l.locationName || l.name || String(l);
      if (l._id) m[l._id] = name;
      if (name) m[name] = name;
    });
    return m;
  }, [locationsApi.data]);
  const nvrOptions = useMemo(
    () => (nvrsApi.data || []).map((n) => ({ id: n._id || n.id, label: n.nvrName || n.name || '' })),
    [nvrsApi.data]
  );
  const nvrLookup = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    const byLocation = new Map();

    const pushLocation = (key, nvr) => {
      if (!key) return;
      const normalized = String(key).trim().toLowerCase();
      if (!normalized) return;
      const list = byLocation.get(normalized) || [];
      list.push(nvr);
      byLocation.set(normalized, list);
    };

    (nvrsApi.data || []).forEach((nvr) => {
      const id = nvr?._id || nvr?.id;
      const name = nvr?.nvrName || nvr?.name || '';
      const locationName = nvr?.location || nvr?.locationName || nvr?.site || '';

      if (id) byId.set(String(id), nvr);
      if (name) byName.set(String(name).trim().toLowerCase(), nvr);
      pushLocation(locationName, nvr);
    });

    return { byId, byName, byLocation };
  }, [nvrsApi.data]);
  const deptOptions = useMemo(
    () => (deptsApi.data || []).map((d) => ({ id: d._id || d.id, label: d.departmentName || d.name || '' })),
    [deptsApi.data]
  );

  // Shared server-side filter body. Falls back to the outlet-context location
  // (site picked in the top bar) when no location is explicitly selected here.
  const filters = useMemo(() => {
    const f = {};
    const rawLocs = selectedLocations.length ? selectedLocations : (location ? [location] : []);
    // Resolve each value (id OR name) to a known location NAME and DROP anything
    // that doesn't resolve — never fall back to the raw value, so a stale/unknown
    // _id can never leak into the payload (the backend matches NVR.location by name).
    const locs = rawLocs.map((v) => locNameByKey[v]).filter(Boolean);
    if (locs.length) f.location = locs;
    if (selectedNvrs.length) f.nvrId = selectedNvrs;
    if (selectedDepts.length) f.department = selectedDepts;
    if (selectedCamTypes.length) f.camType = selectedCamTypes;
    return f;
  }, [selectedLocations, selectedNvrs, selectedDepts, selectedCamTypes, location, locNameByKey]);
  const filterKey = JSON.stringify(filters);

  // No NVR is selected by default — the dashboard opens across every NVR.
  // This used to force `[nvrOptions[0].id]` on mount and again whenever a
  // selection was pruned to empty, so the KPI row was silently scoped to one
  // arbitrary NVR that the user never picked, and clearing the dropdown
  // snapped straight back to it.
  //
  // Pruning stale ids is still worth doing: an NVR that disappears from the
  // list must not linger in the filter payload.
  useEffect(() => {
    if (!nvrOptions.length) return;
    setSelectedNvrs((prev) => {
      if (!prev.length) return prev;
      const validIds = new Set(nvrOptions.map((nvr) => nvr.id));
      const next = prev.filter((id) => validIds.has(id));
      // Same identity when nothing was dropped, so this can't loop.
      return next.length === prev.length ? prev : next;
    });
  }, [nvrOptions]);

  // KPI header stats — overall counts (NOT date-restricted; headerStats returns
  // 0 alerts when filtered to a single day, which zeroed the t
  //  iles).
  const header = useApi(() => getHeaderStats(filters), [filterKey], { pollMs: 60000 });
  const incidentCounts = useApi(() => getDashboardIncidentCounts(filters), [filterKey], { pollMs: 60000 });

  // Today-vs-yesterday counts for the High/Resolved KPI deltas — same
  // severity/status filters as incidentCounts above, just scoped to a single
  // day each, so the tile can show a real +/- change instead of a raw total.
  const todayDateStr = moment().format('YYYY-MM-DD');
  const yesterdayDateStr = dateFilter(1);
  const todayIncidentCounts = useApi(
    () => getDashboardIncidentCounts({ ...filters, startDate: todayDateStr, endDate: todayDateStr }),
    [filterKey, todayDateStr],
    { pollMs: 60000 }
  );
  const yesterdayIncidentCounts = useApi(
    () => getDashboardIncidentCounts({ ...filters, startDate: yesterdayDateStr, endDate: yesterdayDateStr }),
    [filterKey, yesterdayDateStr],
    { pollMs: 60000 }
  );

  // Detection chart (engine activity + KPI sparklines)
  const detChart = useApi(() => getDetectionChart(filters), [filterKey], { pollMs: 120000 });
  const dailyTotals = useMemo(() => {
    const t = [0, 0, 0, 0, 0, 0, 0];
    Object.values(detChart.data || {}).forEach((arr) => {
      (Array.isArray(arr) ? arr : []).forEach((v, i) => (t[i] += Number(v) || 0));
    });
    return t;
  }, [detChart.data]);

  // Threat feed
  const crit = useApi(() => getCriticalityStats(filters, { skip: 0, limit: 50 }), [filterKey], { pollMs: 30000 });
  const alerts = crit.data?.recentAlerts || [];
  const networkFilters = useMemo(() => {
    const f = {};
    const locs = filters.location || (location ? [location] : []);
    if (locs?.length) f.location = locs;
    return f;
  }, [filters.location, location]);
  // Recent incidents — TWO separate fetches:
  //   1. fetchIncidents (same API as Incident Center) → truly most-recent single incident
  //   2. getRecentIncidents (dashboard) → latest-per-type, used only for camera overlays
  const latestApi = useApi(
    () => fetchIncidents({ skip: 0, limit: 1 }, filters),
    [filterKey],
    { pollMs: 30000 }
  );
  const latestIncident = latestApi.data?.items?.[0] || null;

  // getRecentIncidents is a GET — pass comma-joined values so query params match
  // the endpoint's scalar expectation (identical to the old single-site string).
  const recentParams = useMemo(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => {
      p[k] = Array.isArray(v) ? v.join(',') : v;
    });
    return p;
  }, [filterKey]);
  const recentByType = useApi(() => getRecentIncidents(recentParams), [filterKey], { pollMs: 30000 });
  const recentValues = useMemo(
    () => Object.values(recentByType.data || {}).filter((v) => v && v._id),
    [recentByType.data]
  );
  const latestByChannel = useMemo(() => {
    const map = {};
    recentValues.forEach((inc) => {
      const k = inc.channelId?._id || inc.channelId || inc.channelData?._id;
      if (k && !map[k]) map[k] = inc;
    });
    return map;
  }, [recentValues]);

  // Use one stable, server-filtered inventory for both the live strip and the
  // camera-status stream. The old fallback→detail swap changed the target ids
  // mid-flight, which aborted the first status stream and reopened it for a
  // broader second list (often the full estate).
  const networkChannelsApi = useApi(
    () => getChannels({ ...filters, limit: 500 }),
    [filterKey],
    { pollMs: 60000 }
  );
  const networkChannels = useMemo(
    () =>
      (networkChannelsApi.data || []).map((channel) => {
        const nvrId =
          channel?.nvrId?._id ||
          channel?.nvr?._id ||
          channel?.nvrData?._id ||
          channel?.nvrId ||
          channel?.nvr ||
          null;
        const nvrName =
          channel?.nvrId?.nvrName ||
          channel?.nvr?.nvrName ||
          channel?.nvrData?.nvrName ||
          channel?.nvrName ||
          '';
        const channelLocation =
          channel?.location ||
          channel?.locationName ||
          channel?.site ||
          channel?.nvrId?.location ||
          channel?.nvrData?.location ||
          '';

        let nvr = nvrId ? nvrLookup.byId.get(String(nvrId)) : null;
        if (!nvr && nvrName) {
          nvr = nvrLookup.byName.get(String(nvrName).trim().toLowerCase()) || null;
        }
        if (!nvr && channelLocation) {
          const candidates = nvrLookup.byLocation.get(String(channelLocation).trim().toLowerCase()) || [];
          const domains = [...new Set(
            candidates
              .map((candidate) => candidate?.domain || candidate?.config?.domain || '')
              .filter(Boolean)
          )];
          if (candidates.length === 1 || domains.length === 1) {
            nvr = candidates[0] || null;
          }
        }
        if (!nvr) return channel;

        const domain = nvr?.domain || nvr?.config?.domain || '';
        if (!domain) return channel;

        return {
          ...channel,
          domain,
          location: channel?.location || channelLocation,
          nvrData: {
            ...(channel?.nvrData || {}),
            _id: channel?.nvrData?._id || nvr?._id,
            nvrName: channel?.nvrData?.nvrName || nvr?.nvrName || nvr?.name,
            location: channel?.nvrData?.location || nvr?.location || nvr?.locationName || nvr?.site,
            domain,
          },
          nvrId:
            channel?.nvrId && typeof channel.nvrId === 'object'
              ? {
                  ...channel.nvrId,
                  _id: channel?.nvrId?._id || nvr?._id,
                  nvrName: channel?.nvrId?.nvrName || nvr?.nvrName || nvr?.name,
                  location: channel?.nvrId?.location || nvr?.location || nvr?.locationName || nvr?.site,
                  domain: channel.nvrId.domain || domain,
                }
              : channel?.nvrId || nvr?._id,
          nvr:
            channel?.nvr && typeof channel.nvr === 'object'
              ? {
                  ...channel.nvr,
                  _id: channel?.nvr?._id || nvr?._id,
                  nvrName: channel?.nvr?.nvrName || nvr?.nvrName || nvr?.name,
                  location: channel?.nvr?.location || nvr?.location || nvr?.locationName || nvr?.site,
                  domain: channel.nvr.domain || domain,
                }
              : channel?.nvr,
        };
      }),
    [networkChannelsApi.data, nvrLookup]
  );
  const normalizedFilterLocations = filters.location || [];
  const scopedNvrs = useMemo(() => {
    const allNvrs = nvrsApi.data || [];
    return allNvrs.filter((nvr) => {
      const nvrId = nvr._id || nvr.id;
      const nvrLocation = nvr.location || nvr.locationName || nvr.site || '';
      if (selectedNvrs.length && !selectedNvrs.includes(nvrId)) return false;
      if (normalizedFilterLocations.length && !normalizedFilterLocations.includes(nvrLocation)) return false;
      return true;
    });
  }, [nvrsApi.data, selectedNvrs, normalizedFilterLocations]);
  const cameraInventoryTotal = useMemo(
    () => scopedNvrs.reduce((sum, nvr) => sum + (Number(nvr.cameraCount ?? nvr.usedChannels ?? nvr.used) || 0), 0),
    [scopedNvrs]
  );

  const camerasOnline = useMemo(
    () => ({
      online: onlineCameras.online,
      // Keep the dashboard denominator aligned with Live Wall: use the same
      // filtered channel inventory / status-stream target count first. NVR
      // cameraCount metadata can be stale or broader than the current filter,
      // so it should only be a fallback.
      total: onlineCameras.total || networkChannels.length || cameraInventoryTotal,
    }),
    [onlineCameras.online, onlineCameras.total, networkChannels.length, cameraInventoryTotal]
  );

  const today = moment().format('YYYY-MM-DD');
  const yesterday = dateFilter(1);
  const dailyComparison = useApi(
    () => getDashboardDailyComparison(filters, today, yesterday),
    [filterKey, today, yesterday],
    { pollMs: 60000 }
  );

  // Engine activity · Today — aggregate today's incidents by detection type.
  const todayFilter = { ...filters, startDate: today, endDate: today, statusFilter: ALL_STATUS_FILTER };
  const todayApi = useApi(
    () => fetchIncidents({ skip: 0, limit: DETECTION_SAMPLE_LIMIT }, todayFilter),
    [filterKey, today],
    { pollMs: 120000 }
  );
  const todayEngines = useMemo(() => aggregateTodayEngines(todayApi.data?.items), [todayApi.data]);

  // Detection events · 24h — bucket the last 24 hours of incidents by hour.
  const dayFilter = { ...filters, startDate: yesterday, endDate: today, statusFilter: ALL_STATUS_FILTER };
  const dayApi = useApi(
    () => fetchIncidents({ skip: 0, limit: DETECTION_SAMPLE_LIMIT }, dayFilter),
    [filterKey, yesterday, today],
    { pollMs: 120000 }
  );
  const events24h = useMemo(() => aggregate24hEvents(dayApi.data?.items), [dayApi.data]);
  const total24h = events24h.reduce((a, b) => a + b, 0);

  const refetchHeader = useCallback(() => {
    header.refetch();
    incidentCounts.refetch();
    dailyComparison.refetch();
    latestApi.refetch();
    crit.refetch();
  }, [header, incidentCounts, dailyComparison, latestApi, crit]);

  const engineLoading = todayApi.loading || dayApi.loading;
  const engineError = todayApi.error || dayApi.error;
  const engineEmpty = !engineLoading && !engineError && todayEngines.length === 0 && total24h === 0;

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <div
        data-tour="cc-filters"
        style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
        className="vq-cc-filters"
      >
        {/* Select Location dropdown hidden — redundant with the top-bar site
            switcher, which already drives `location` in the outlet context
            that `filters` falls back to below. */}
        <div style={{ minWidth: 190, flex: '1 1 190px', maxWidth: 240 }}>
          <SharedMultiSelect
            options={nvrOptions}
            value={selectedNvrs}
            onChange={setSelectedNvrs}
            placeholder="Select NVR"
            searchPlaceholder="Search NVR..."
            maxHeight="max-h-48"
            msg="No NVR Found"
          />
        </div>
        <div style={{ minWidth: 190, flex: '1 1 190px', maxWidth: 240 }}>
          <SharedMultiSelect
            options={deptOptions}
            value={selectedDepts}
            onChange={setSelectedDepts}
            placeholder="Select Department"
            searchPlaceholder="Search departments..."
            maxHeight="max-h-48"
            msg="No Department Found"
          />
        </div>
        <div style={{ minWidth: 190, flex: '1 1 190px', maxWidth: 240 }}>
          <SharedMultiSelect
            options={CAMERA_TYPE_OPTIONS}
            value={selectedCamTypes}
            onChange={setSelectedCamTypes}
            placeholder="Select Camera Type"
            searchPlaceholder="Search camera type..."
            maxHeight="max-h-48"
            msg="No Camera Type Found"
          />
        </div>
      </div>

      <div data-tour="cc-kpis">
        <KpiRow
        stats={header.data || {}}
        incidentCounts={incidentCounts.data}
        todayIncidentCounts={todayIncidentCounts.data}
        yesterdayIncidentCounts={yesterdayIncidentCounts.data}
        dailyTotals={dailyTotals}
        dailyComparison={dailyComparison.data}
        eventsToday={dailyComparison.data?.today?.events ?? todayApi.data?.totalCount}
        sitesCount={sites.length}
        onlineCameras={camerasOnline}
        loading={header.loading || incidentCounts.loading}
        />
      </div>

      {/* Live camera + attendance | latest incident + controls */}
      <div ref={dashboardGridRef} style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18 }} className="vq-cc-grid">
        <div data-tour="cc-live" style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <LiveCamera
            channels={networkChannels}
            loading={networkChannelsApi.loading}
            latestByChannel={latestByChannel}
            onOnlineCountChange={onOnlineCountChange}
          />
          <LiveAttendance />
          {showSystemControls && (
            <div
              ref={networkSlotRef}
              style={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                width: networkExpandedWidth ? `${networkExpandedWidth}px` : '100%',
                position: 'relative',
                zIndex: networkExpandedWidth ? 1 : 'auto',
              }}
            >
              <MultiSiteNetwork
                nvrs={nvrsApi.data || []}
                channels={networkChannels}
                activeLocations={networkFilters.location || []}
              />
            </div>
          )}
        </div>
        <div ref={rightColumnRef} data-tour="cc-feed" style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <LatestIncident
            incident={latestIncident}
            loading={latestApi.loading}
            error={latestApi.error}
            isEmpty={!latestApi.loading && !latestApi.error && !latestIncident}
            onRetry={latestApi.refetch}
            onChanged={refetchHeader}
          />
          <SystemControls />
          <LiveThreatFeed
            alerts={alerts}
            loading={crit.loading}
            error={crit.error}
            isEmpty={!crit.loading && !crit.error && alerts.length === 0}
            onRetry={crit.refetch}
          />
        </div>
      </div>

      {/* No SystemControls card in the right column at this point — let NVR
          Interconnectivity break out full-width and taller instead of being
          squeezed into the left column next to nothing. */}
      {!showSystemControls && (
        <MultiSiteNetwork
          nvrs={nvrsApi.data || []}
          channels={networkChannels}
          activeLocations={networkFilters.location || []}
          tall
        />
      )}

      {/* Engine activity + 24h detection events */}
      <div data-tour="cc-engines">
      <EngineActivity
        todayEngines={todayEngines}
        events24h={events24h}
        total24h={total24h}
        loading={engineLoading}
        error={engineError}
        isEmpty={engineEmpty}
        onRetry={() => {
          todayApi.refetch();
          dayApi.refetch();
        }}
      />
      </div>
    </div>
  );
}
