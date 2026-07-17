import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { WATER_SPILL_CONFIG } from '@/pages/IncidentLogs/configs';

/** Water spillage detection logs. */
const WaterSpillLogs = () => <IncidentLogsPage config={WATER_SPILL_CONFIG} />;

export default WaterSpillLogs;
