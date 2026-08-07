import { useEffect, useState } from 'react';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import RangeFilter, { defaultRange, rangeParams } from './RangeFilter';
import { AnalyticsRefreshProvider, useAnalyticsRefreshAll } from './AnalyticsRefreshContext';
import OverviewKpiRow from './OverviewKpiRow';
import DetectionVolumeCard from './DetectionVolumeCard';
import EngineShareCard from './EngineShareCard';
import ActivityHeatmapCard from './ActivityHeatmapCard';
import TopCamerasCard from './TopCamerasCard';
import PeakActivityCard from './PeakActivityCard';
import DetectionsByHourCard from './DetectionsByHourCard';
import SitePerformanceCard from './SitePerformanceCard';
import ResponseFunnelCard from './ResponseFunnelCard';
import AttendanceAnalytics from './AttendanceAnalytics';

/**
 * Trends, heatmaps & engine performance. Every widget on this page is backed
 * by /analytics/* — nothing is static/mocked. The 7 Days / 30 Days /
 * Custom range filter drives every widget except Detections by Hour, which
 * is inherently single-day ("today") and has its own dedicated endpoint.
 *
 * The original mockup's False Positive Rate / Mean Response Time / Platform
 * Uptime KPI tiles and the Model Performance card (precision/recall/F1/mAP)
 * were dropped because nothing in the system tracks that data; they're
 * replaced with Resolved Rate / Active Cameras / Busiest Site and Peak
 * Activity (busiest hour/day), which are real.
 */
const REFRESH_KEY = 'analytics_auto_refresh_enabled';
const INTERVAL_KEY = 'analytics_auto_refresh_interval';

/**
 * Auto-refresh, matching the control on Incident Center and the log pages.
 *
 * Defaults to OFF here, unlike those pages. Analytics aggregates over a date
 * range rather than tailing a live feed, so a 30-day chart re-running on a
 * timer is mostly wasted queries — several of these endpoints are the heaviest
 * on the server. Turning it on is a deliberate choice, and it persists.
 */
function AnalyticsToolbar({ range, onRangeChange }) {
  const refreshAll = useAnalyticsRefreshAll();

  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem(REFRESH_KEY) === 'true');
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const parsed = parseInt(localStorage.getItem(INTERVAL_KEY), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60;
  });

  useEffect(() => localStorage.setItem(REFRESH_KEY, autoRefresh), [autoRefresh]);
  useEffect(() => localStorage.setItem(INTERVAL_KEY, refreshInterval), [refreshInterval]);

  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0 || !refreshAll) return undefined;
    const id = setInterval(() => refreshAll({ silent: true }), refreshInterval * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshInterval, refreshAll]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <RangeFilter range={range} onChange={onRangeChange} />
      <div style={{ marginLeft: 'auto' }}>
        <AutoRefreshComponent
          isActive={autoRefresh}
          onActiveChange={setAutoRefresh}
          refreshInterval={refreshInterval}
          onIntervalChange={setRefreshInterval}
          // Wrapped, not passed directly: onClick would hand the button's
          // MouseEvent straight through as the options argument.
          onManualRefresh={() => refreshAll?.({ silent: false })}
        />
      </div>
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState(defaultRange);
  const params = rangeParams(range);

  return (
    <AnalyticsRefreshProvider>
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <AnalyticsToolbar range={range} onRangeChange={setRange} />

      <OverviewKpiRow params={params} />

      <AttendanceAnalytics params={params} />

      {/* Detection Volume | Share by Engine */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }} className="vq-analytics-row">
        <DetectionVolumeCard params={params} />
        <EngineShareCard params={params} />
      </div>

      {/* Activity Heatmap | Top Cameras by Events */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18 }} className="vq-analytics-row">
        <ActivityHeatmapCard params={params} />
        <TopCamerasCard params={params} limit={5} />
      </div>

      {/* Peak Activity | Detections by Hour */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18 }} className="vq-analytics-row">
        <PeakActivityCard params={params} />
        <DetectionsByHourCard />
      </div>

      {/* Site Performance | Response Funnel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }} className="vq-analytics-row">
        <SitePerformanceCard params={params} />
        <ResponseFunnelCard params={params} />
      </div>
    </div>
    </AnalyticsRefreshProvider>
  );
}
