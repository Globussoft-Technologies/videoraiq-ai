import React from 'react';
import IncidentLogsPage from '@/pages/IncidentLogs/IncidentLogsPage';
import { STOCK_COUNTING_CONFIG } from '@/pages/IncidentLogs/configs';

const StockCountingLogs = () => <IncidentLogsPage config={STOCK_COUNTING_CONFIG} />;

export default StockCountingLogs;
