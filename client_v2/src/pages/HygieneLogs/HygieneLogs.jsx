import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { HYGIENE_CONFIG } from '@/pages/IncidentLogs/configs';

export default function HygieneLogs() {
  return <IncidentLogsPage config={HYGIENE_CONFIG} />;
}
