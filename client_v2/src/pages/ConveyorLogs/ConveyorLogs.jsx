import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { CONVEYOR_CONFIG } from '@/pages/IncidentLogs/configs';

/** Conveyor load / running-state detection logs. */
const ConveyorLogs = () => <IncidentLogsPage config={CONVEYOR_CONFIG} />;

export default ConveyorLogs;
