import React from 'react';
import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { WRONG_LOCATION_CONFIG } from '@/pages/IncidentLogs/configs';

const WrongLocationLogs = () => <IncidentLogsPage config={WRONG_LOCATION_CONFIG} />;

export default WrongLocationLogs;
