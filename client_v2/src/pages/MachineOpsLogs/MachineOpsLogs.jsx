import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage?v=machine-ops-logs-2';
import { MACHINE_OPS_CONFIG } from '@/pages/IncidentLogs/configs?v=machine-ops-logs-2';

export default function MachineOpsLogs() {
  return <IncidentLogsPage config={MACHINE_OPS_CONFIG} />;
}
