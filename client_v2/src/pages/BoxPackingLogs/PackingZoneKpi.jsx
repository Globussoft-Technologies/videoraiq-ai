import { Kpi } from '@/pages/SolderLine/ui';

export default function PackingZoneKpi({ stations, color = '#22d3ee', style }) {
  return <Kpi label="Total workers"
    value={stations.reduce((total, station) => total + (station.workers || []).length, 0)}
    title="Distinct completedBy worker IDs, counted once per camera and NVR across the date range. IDs are not assumed to identify the same person across cameras."
    sub="Recorded worker IDs per camera/NVR"
    color={color} style={style} />;
}
