import { useState } from 'react';
import RangeFilter, { defaultRange, rangeParams } from './RangeFilter';
import OverviewKpiRow from './OverviewKpiRow';
import DetectionVolumeCard from './DetectionVolumeCard';
import EngineShareCard from './EngineShareCard';
import ActivityHeatmapCard from './ActivityHeatmapCard';
import TopCamerasCard from './TopCamerasCard';
import PeakActivityCard from './PeakActivityCard';
import DetectionsByHourCard from './DetectionsByHourCard';
import SitePerformanceCard from './SitePerformanceCard';
import ResponseFunnelCard from './ResponseFunnelCard';

/**
 * Trends, heatmaps & engine performance. Every widget on this page is backed
 * by /api/v1/analytics/* — nothing is static/mocked. The 7 Days / 30 Days /
 * Custom range filter drives every widget except Detections by Hour, which
 * is inherently single-day ("today") and has its own dedicated endpoint.
 *
 * The original mockup's False Positive Rate / Mean Response Time / Platform
 * Uptime KPI tiles and the Model Performance card (precision/recall/F1/mAP)
 * were dropped because nothing in the system tracks that data; they're
 * replaced with Resolved Rate / Active Cameras / Busiest Site and Peak
 * Activity (busiest hour/day), which are real.
 */
export default function Analytics() {
  const [range, setRange] = useState(defaultRange);
  const params = rangeParams(range);

  return (
    <div className="vq-analytics-page p-[22px] flex flex-col gap-[18px]">
      <RangeFilter range={range} onChange={setRange} />

      <OverviewKpiRow params={params} />

      {/* Detection Volume | Share by Engine */}
      <div className="vq-analytics-row grid grid-cols-[1.5fr_1fr] gap-[18px]">
        <DetectionVolumeCard params={params} />
        <EngineShareCard params={params} />
      </div>

      {/* Activity Heatmap | Top Cameras by Events */}
      <div className="vq-analytics-row grid grid-cols-[1.3fr_1fr] gap-[18px]">
        <ActivityHeatmapCard params={params} />
        <TopCamerasCard params={params} limit={5} />
      </div>

      {/* Peak Activity | Detections by Hour */}
      <div className="vq-analytics-row grid grid-cols-[1fr_1.4fr] gap-[18px]">
        <PeakActivityCard params={params} />
        <DetectionsByHourCard />
      </div>

      {/* Site Performance | Response Funnel */}
      <div className="vq-analytics-row grid grid-cols-[1.4fr_1fr] gap-[18px]">
        <SitePerformanceCard params={params} />
        <ResponseFunnelCard params={params} />
      </div>
    </div>
  );
}
