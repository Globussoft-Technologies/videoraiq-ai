import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { UNAUTHORIZED_ACCESS_CONFIG } from '@/pages/IncidentLogs/configs';

/** Restricted-zone / unauthorized-access detection logs. */
const UnauthorizedAccessLogs = () => <IncidentLogsPage config={UNAUTHORIZED_ACCESS_CONFIG} />;

export default UnauthorizedAccessLogs;
