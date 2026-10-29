import React from 'react';
import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { UNIFORM_CONFIG } from '@/pages/IncidentLogs/configs';
export default function UniformLogs() {
  return <IncidentLogsPage config={UNIFORM_CONFIG} />;
}
