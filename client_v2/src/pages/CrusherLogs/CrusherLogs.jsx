import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { CRUSHER_CONFIG } from '@/pages/IncidentLogs/configs';

/** Crusher operating-state detection logs. */
const CrusherLogs = () => <IncidentLogsPage config={CRUSHER_CONFIG} />;

export default CrusherLogs;
