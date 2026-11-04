import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { GENDER_AGE_CONFIG } from '@/pages/IncidentLogs/configs';

export default function GenderAgeLogs() {
  return <IncidentLogsPage config={GENDER_AGE_CONFIG} />;
}
