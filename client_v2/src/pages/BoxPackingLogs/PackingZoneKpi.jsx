import { Kpi } from '@/pages/SolderLine/ui';
import { packingWorkerCount } from './boxPackingData';

export default function PackingZoneKpi({ stations = [], color = '#22d3ee', style }) {
  const rows = stations.flatMap((station) => station.rows || []);
  return <Kpi label="Total workers"
    value={packingWorkerCount(rows)}
    title="Unique worker IDs associated with the selected camera stations."
    sub="Workers associated with selected stations"
    color={color} style={style} />;
}
