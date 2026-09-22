import React from 'react';
import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { OIL_LEAKAGE_CONFIG } from '@/pages/IncidentLogs/configs';

const OilLeakageLogs = () => <IncidentLogsPage config={OIL_LEAKAGE_CONFIG} />;

export default OilLeakageLogs;
