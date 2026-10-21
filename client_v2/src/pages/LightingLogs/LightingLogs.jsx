import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { LIGHTING_CONFIG } from '@/pages/IncidentLogs/configs';

export default function LightingLogs() {
  return <IncidentLogsPage config={LIGHTING_CONFIG} />;
}
