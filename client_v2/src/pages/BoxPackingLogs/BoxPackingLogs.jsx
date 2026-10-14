import { useLogsConfig } from '@/context/LogsConfigContext';
import { IS_LICENSING_ENABLED } from '@/helpers/license';
import PageLoader from '@/components/PageLoader';
import { ErrorState } from '@/components/States';
import AccessDenied from '@/components/AccessDenied';
import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { BOX_PACKING_CONFIG } from '@/pages/IncidentLogs/configs';

export default function BoxPackingLogs() {
  const { logs, loading, refresh } = useLogsConfig();
  if (loading) return <PageLoader />;
  // With licensing disabled, the provider intentionally leaves logs null.
  if (IS_LICENSING_ENABLED && !logs) return <ErrorState error={new Error('Unable to load detection access.')} onRetry={refresh} minH={360} />;
  if (logs?.boxPackingLogs === false) return <AccessDenied message="Box Packing Logs are not enabled for your account." />;
  return <IncidentLogsPage config={BOX_PACKING_CONFIG} />;
}
