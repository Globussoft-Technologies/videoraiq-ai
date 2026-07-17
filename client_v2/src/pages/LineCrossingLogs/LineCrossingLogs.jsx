import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { LINE_CROSSING_CONFIG } from '@/pages/IncidentLogs/configs';

/** Boundary / line-crossing detection logs. */
const LineCrossingLogs = () => <IncidentLogsPage config={LINE_CROSSING_CONFIG} />;

export default LineCrossingLogs;
