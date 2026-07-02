import { useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import moment from 'moment';
import KpiRow from './KpiRow';
import LiveCamera from './LiveCamera';
import LiveAttendance from './LiveAttendance';
import LatestIncident from './LatestIncident';
import MultiSiteNetwork from './MultiSiteNetwork';
import LiveThreatFeed from './LiveThreatFeed';
import EngineActivity from './EngineActivity';
import { useApi } from '../../../hooks/useApi';
import { getHeaderStats, getDetectionChart, getCriticalityStats, getRecentIncidents } from '../../../helpers/dashboard';
import { getChannels, getAttendance } from '../../../helpers/monitoring';
import { fetchIncidents } from '../../../helpers/incidents';
import { useAttendanceSocket } from '../../../context/AttendanceSocketContext';

const DETECTION_SAMPLE_LIMIT = 1000;

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

  // KPI header stats — overall counts (NOT date-restricted; headerStats returns
  // 0 alerts when filtered to a single day, which zeroed the tiles).
  const header = useApi(() => getHeaderStats({}), [], { pollMs: 60000 });

  // Detection chart (engine activity + KPI sparklines)
  const detChart = useApi(() => getDetectionChart({ location }), [location], { pollMs: 120000 });
  const dailyTotals = useMemo(() => {
    const t = [0, 0, 0, 0, 0, 0, 0];
    Object.values(detChart.data || {}).forEach((arr) => {
      (Array.isArray(arr) ? arr : []).forEach((v, i) => (t[i] += Number(v) || 0));
    });
    return t;
  }, [detChart.data]);

  // Threat feed (also feeds per-site alert tally for the map)
  const crit = useApi(() => getCriticalityStats({ location }, { skip: 0, limit: 50 }), [location], { pollMs: 30000 });
  const alerts = crit.data?.recentAlerts || [];

  // Recent incidents — TWO separate fetches:
  //   1. fetchIncidents (same API as Incident Center) → truly most-recent single incident
  //   2. getRecentIncidents (dashboard) → latest-per-type, used only for camera overlays
  const latestApi = useApi(
    () => fetchIncidents({ skip: 0, limit: 1 }, location ? { location } : {}),
    [location],
    { pollMs: 30000 }
  );
  const latestIncident = latestApi.data?.items?.[0] || null;

  const recentByType = useApi(() => getRecentIncidents(location ? { location } : {}), [location], { pollMs: 30000 });
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
  const channels = useApi(() => getChannels({ location, limit: 12 }), [location]);

  // All channels (with their location) — used to map alerts -> site for the map.
  const allChannels = useApi(() => getChannels({ limit: 500 }), []);
  const sitesEnriched = useMemo(() => {
    // channelId -> site (location) name, lower-cased for matching; tally cams/site
    const chLoc = {};
    const camCount = {};
    (allChannels.data || []).forEach((c) => {
      const id = c._id || c.id;
      const loc = (c.location || c.locationName || '').toLowerCase();
      if (id) chLoc[id] = loc;
      if (loc) camCount[loc] = (camCount[loc] || 0) + 1;
    });
    // tally recent alerts per site
    const tally = {};
    alerts.forEach((a) => {
      const cid = a.channelId?._id || a.channelId;
      const loc = chLoc[cid];
      if (!loc) return;
      if (!tally[loc]) tally[loc] = { alertCount: 0, critCount: 0 };
      tally[loc].alertCount += 1;
      const sev = (a.severity || '').toLowerCase();
      if (sev === 'high' || sev === 'critical') tally[loc].critCount += 1;
    });
    return sites.map((s) => {
      const key = (s.locationName || s.name || '').toLowerCase();
      const t = tally[key] || { alertCount: 0, critCount: 0 };
      return { ...s, alertCount: t.alertCount, critCount: t.critCount, cameraCount: camCount[key] || 0 };
    });
  }, [allChannels.data, alerts, sites]);

  // Live attendance — pass a wide date range (data exists from Dec 2025 per attendanceLogsStartDate).
  // Without startDate/endDate the API returns 0; with a range it returns real records.
  const today = moment().format('YYYY-MM-DD');
  const sixMonthsAgo = moment().subtract(6, 'months').format('YYYY-MM-DD');
  const attendance = useApi(
    () => getAttendance({ startDate: sixMonthsAgo, endDate: today, limit: 12 }),
    [today],
    { pollMs: 60000 }
  );
  const people = Array.isArray(attendance.data) ? attendance.data : attendance.data?.data || [];
  const { attendanceLogs } = useAttendanceSocket() || {};

  // Engine activity · Today — aggregate today's incidents by detection type.
  const todayFilter = location ? { location, startDate: today, endDate: today } : { startDate: today, endDate: today };
  const todayApi = useApi(
    () => fetchIncidents({ skip: 0, limit: DETECTION_SAMPLE_LIMIT }, todayFilter),
    [location, today],
    { pollMs: 120000 }
  );
  const todayEngines = useMemo(() => aggregateTodayEngines(todayApi.data?.items), [todayApi.data]);

  // Detection events · 24h — bucket the last 24 hours of incidents by hour.
  const yesterday = dateFilter(1);
  const dayFilter = location ? { location, startDate: yesterday, endDate: today } : { startDate: yesterday, endDate: today };
  const dayApi = useApi(
    () => fetchIncidents({ skip: 0, limit: DETECTION_SAMPLE_LIMIT }, dayFilter),
    [location, yesterday, today],
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
      <KpiRow
        stats={header.data || {}}
        dailyTotals={dailyTotals}
        sitesCount={sites.length}
        loading={header.loading}
      />

      {/* Live camera + attendance | latest incident + controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18 }} className="vq-cc-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <LiveCamera channels={channels.data || []} loading={channels.loading} latestByChannel={latestByChannel} />
          <LiveAttendance
            people={people}
            socketLogs={attendanceLogs}
            loading={attendance.loading}
            error={attendance.error}
            isEmpty={!attendance.loading && !attendance.error && people.length === 0 && !(attendanceLogs || []).length}
            onRetry={attendance.refetch}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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

      {/* Map */}
      <MultiSiteNetwork sites={sitesEnriched} />

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
