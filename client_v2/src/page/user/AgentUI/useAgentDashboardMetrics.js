import { useEffect, useMemo, useState } from 'react';
import moment from 'moment-timezone';
import { useApi } from '@/hooks/useApi';
import { useTimezone } from '@/context/TimezoneContext';
import { getChannels } from '@/helpers/monitoring';
import { fetchIncidents } from '@/helpers/incidents';
import { getDetectionChart } from '@/helpers/dashboard';
import { getAnalyticsOverview } from '@/helpers/analytics';
import { cameraStatusId, isCameraRtspOnline } from '@/helpers/cameraStatus';
import { useCameraStatusStream } from '@/hooks/useCameraStatusStream';

export function useAgentDashboardMetrics() {
  const { timezone } = useTimezone();
  const [today, setToday] = useState(() => moment().tz(timezone).format('YYYY-MM-DD'));
  useEffect(() => {
    const updateDay = () => setToday(moment().tz(timezone).format('YYYY-MM-DD'));
    updateDay();
    const timer = window.setInterval(updateDay, 60000);
    return () => window.clearInterval(timer);
  }, [timezone]);
  const inventory = useApi(async () => {
    const all = [];
    const pageSize = 100;
    for (let skip = 0; ; skip += pageSize) {
      const page = await getChannels({ skip, limit: pageSize });
      all.push(...page);
      if (page.length < pageSize) return all;
    }
  }, [], { pollMs: 60000, pollSilent: true });
  const channels = Array.isArray(inventory.data) ? inventory.data : [];
  const targets = useMemo(() => channels.filter((channel) => cameraStatusId(channel)), [inventory.data]);
  const status = useCameraStatusStream(targets, { enabled: targets.length > 0 });
  const todayDetections = useApi(
    () => getAnalyticsOverview({ startDate: today, endDate: today, timezone }),
    [today, timezone], { pollMs: 60000, pollSilent: true },
  );
  const openIncidents = useApi(
    () => fetchIncidents({ skip: 0, limit: 1 }, { statusFilter: 'new' }),
    [], { pollMs: 60000, pollSilent: true },
  );
  const chart = useApi(() => getDetectionChart(), [], { pollMs: 120000, pollSilent: true });

  const statusById = useMemo(() => Object.fromEntries(
    (status.data?.cameras || []).filter((camera) => camera?.id).map((camera) => [camera.id, camera]),
  ), [status.data]);
  const camerasOnline = status.data ? channels.filter((channel) => isCameraRtspOnline(statusById[cameraStatusId(channel)])).length : null;
  const cameraBars = status.data ? channels.slice(0, 12).map((channel) =>
    isCameraRtspOnline(statusById[cameraStatusId(channel)]) ? 100 : 0) : [];
  // The overview returns a per-engine breakdown for the same day and scope as
  // totalDetections, so the mini chart cannot drift from the number above it.
  const detectionBars = Array.isArray(todayDetections.data?.byType)
    ? todayDetections.data.byType.filter((row) => Number(row.count) > 0)
    : [];

  return {
    cameras: camerasOnline,
    detections: todayDetections.data && Number.isFinite(Number(todayDetections.data.totalDetections))
      ? Number(todayDetections.data.totalDetections) : null,
    incidents: openIncidents.data ? Number(openIncidents.data.totalCount) : null,
    cameraBars,
    detectionBars,
    analyticsReady: Boolean(chart.data && !chart.error),
  };
}
