import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import moment from 'moment';
import KpiRow from './KpiRow';
import LiveCamera from './LiveCamera';
import LiveAttendance from './LiveAttendance';
import LatestIncident from './LatestIncident';
import LiveThreatFeed from './LiveThreatFeed';
import EngineActivity from './EngineActivity';
import MultiSiteNetwork from './MultiSiteNetwork';
import SharedMultiSelect from '../../../components/MultiSelect';
import { useApi } from '../../../hooks/useApi';
import { getHeaderStats, getDetectionChart, getCriticalityStats, getRecentIncidents } from '../../../helpers/dashboard';
import { getChannels, getLocations, getNVRs, getDepartments } from '../../../helpers/monitoring';
import { fetchIncidents } from '../../../helpers/incidents';

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

  // ── Filters (Location · NVR · Department · Camera Type) ──────────────────────
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [selectedNvrs, setSelectedNvrs] = useState([]);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedCamTypes, setSelectedCamTypes] = useState([]);

  // Real "N of the filtered cameras are actually streaming" tally — LiveCamera
  // probes every tab's stream in the background (not just the active one) since
  // there's no backend field for per-camera online status.
  const [onlineCameras, setOnlineCameras] = useState({ online: 0, total: 0 });
  // Also hand it to the layout so the Sidebar footer can show the same number.
  const onOnlineCountChange = useCallback((online, total) => {
    setOnlineCameras({ online, total });
    ctx.setCamHealth?.({ online, total });
  }, [ctx]);


 
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
    return f;
  }, [selectedLocations, selectedNvrs, selectedDepts, location, locNameByKey]);
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    if (!nvrOptions.length) return;
    setSelectedNvrs((prev) => {
      if (prev.length) {
        const validIds = new Set(nvrOptions.map((nvr) => nvr.id));
        const next = prev.filter((id) => validIds.has(id));
        return next.length ? next : [nvrOptions[0].id];
      }
      return [nvrOptions[0].id];
    });
  }, [nvrOptions]);

  // KPI header stats — overall counts (NOT date-restricted; headerStats returns
  // 0 alerts when filtered to a single day, which zeroed the t
  //  iles).
  const header = useApi(() => getHeaderStats(filters), [filterKey], { pollMs: 60000 });
  const incidentCounts = useApi(() => getDashboardIncidentCounts(filters), [filterKey], { pollMs: 60000 });

  // Detection chart (engine activity + KPI sparklines)
  const detChart = useApi(() => getDetectionChart(filters), [filterKey], { pollMs: 120000 });
  const dailyTotals = useMemo(() => {
    const t = [0, 0, 0, 0, 0, 0, 0];
    Object.values(detChart.data || {}).forEach((arr) => {
      (Array.isArray(arr) ? arr : []).forEach((v, i) => (t[i] += Number(v) || 0));
    });
    return t;
  }, [detChart.data]);

  // Threat feed (also feeds per-site alert tally for the map)
  const crit = useApi(() => getCriticalityStats(filters, { skip: 0, limit: 50 }), [filterKey], { pollMs: 30000 });
  const alerts = crit.data?.recentAlerts || [];
  const networkFilters = useMemo(() => {
    const f = {};
    const locs = filters.location || (location ? [location] : []);
    if (locs?.length) f.location = locs;
    return f;
  }, [filters.location, location]);
  const networkFilterKey = JSON.stringify(networkFilters);
  const networkCrit = useApi(() => getCriticalityStats(networkFilters, { skip: 0, limit: 200 }), [networkFilterKey], { pollMs: 30000 });
  const networkAlerts = networkCrit.data?.recentAlerts || [];

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

  // Live camera tabs
  const channels = useApi(
    () => getChannels({
      location: filters.location || location,
      nvrId: selectedNvrs,
      department: selectedDepts,
      camType: selectedCamTypes,
      // The whole filtered set, not just the tabs LiveCamera renders — the
      // "Cameras Online" denominator is its length, so a small limit here
      // silently under-reported it (a 16-camera NVR read as 8).
      limit: 200,
    }),
    [filterKey, selectedCamTypes.join(',')]
  );

  // All channels (with their location) — used to map alerts -> site for the map.
  const streamingChannels = useMemo(
    () => (channels.data || []).filter((channel) =>
      !!(channel?.streamingUrl || channel?.StreamingUrl || channel?.config?.StreamingUrl)
    ),
    [channels.data]
  );

  const allChannels = useApi(() => getChannels({ limit: 500 }), []);

  const today = moment().format('YYYY-MM-DD');

  // Engine activity · Today — aggregate today's incidents by detection type.
  const todayFilter = { ...filters, startDate: today, endDate: today, statusFilter: ALL_STATUS_FILTER };
  const todayApi = useApi(
    () => fetchIncidents({ skip: 0, limit: DETECTION_SAMPLE_LIMIT }, todayFilter),
    [filterKey, today],
    { pollMs: 120000 }
  );
  const todayEngines = useMemo(() => aggregateTodayEngines(todayApi.data?.items), [todayApi.data]);

  // Detection events · 24h — bucket the last 24 hours of incidents by hour.
  const yesterday = dateFilter(1);
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
    latestApi.refetch();
    crit.refetch();
  }, [header, latestApi, crit]);

  const engineLoading = todayApi.loading || dayApi.loading;
  const engineError = todayApi.error || dayApi.error;
  const engineEmpty = !engineLoading && !engineError && todayEngines.length === 0 && total24h === 0;

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <div
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

      <KpiRow
        stats={header.data || {}}
        incidentCounts={incidentCounts.data}
        dailyTotals={dailyTotals}
        eventsToday={todayApi.data?.totalCount}
        sitesCount={sites.length}
        onlineCameras={onlineCameras}
        loading={header.loading || incidentCounts.loading}
      />

      {/* Live camera + attendance | latest incident + controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18 }} className="vq-cc-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <LiveCamera channels={streamingChannels} loading={channels.loading} latestByChannel={latestByChannel} onOnlineCountChange={onOnlineCountChange} />
          <LiveAttendance />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <LatestIncident
            incident={latestIncident}
            loading={latestApi.loading}
            error={latestApi.error}
            isEmpty={!latestApi.loading && !latestApi.error && !latestIncident}
            onRetry={latestApi.refetch}
            onChanged={refetchHeader}
          />
          <LiveThreatFeed
            alerts={alerts}
            loading={crit.loading}
            error={crit.error}
            isEmpty={!crit.loading && !crit.error && alerts.length === 0}
            onRetry={crit.refetch}
          />
        </div>
      </div>

      <MultiSiteNetwork
        nvrs={nvrsApi.data || []}
        channels={allChannels.data || []}
        alerts={networkAlerts}
        activeLocations={networkFilters.location || []}
      />

      {/* Engine activity + 24h detection events */}
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
  );
}
