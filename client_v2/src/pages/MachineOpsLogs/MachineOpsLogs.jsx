import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { MACHINE_OPS_CONFIG } from '@/pages/IncidentLogs/configs';

export default function MachineOpsLogs() {
  return <IncidentLogsPage config={MACHINE_OPS_CONFIG} />;
}
