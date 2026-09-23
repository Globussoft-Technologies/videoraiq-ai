import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { UNAUTHORIZED_PARKING_CONFIG } from '@/pages/IncidentLogs/configs';

const UnauthorizedParkingLogs = () => (
  <IncidentLogsPage config={UNAUTHORIZED_PARKING_CONFIG} />
);

export default UnauthorizedParkingLogs;
