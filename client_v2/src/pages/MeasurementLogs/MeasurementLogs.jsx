import { useCallback, useEffect, useMemo, useState } from 'react';
import moment from 'moment';
import { getMeasurementAnalytics } from './api';
import MeasurementKpis from './components/MeasurementKpis';
import MeasurementAnalytics from './components/MeasurementAnalytics';
import MeasurementRecords from './components/MeasurementRecords';
import ReportsAutomation from './components/ReportsAutomation';
import PresetDateRangePicker from '@/components/PresetDateRangePicker';

// { from, to } are YYYY-MM-DD strings (inclusive) or null. Turn them into
// inclusive ISO bounds for the API (fromDate / toDate).
const toIsoWindow = ({ from, to } = {}) => {
  const params = {};
  if (from) params.fromDate = moment(from, 'YYYY-MM-DD').startOf('day').toISOString();
  if (to) params.toDate = moment(to, 'YYYY-MM-DD').endOf('day').toISOString();
  return params;
};

const dateKey = (d) => (d ? moment(d).format('YYYY-MM-DD') : null);

/**
 * Mattress Measurement Logs — declared vs measured L×W×H, deviation analytics,
 * filterable records (list / grid), report downloads and automated email
 * schedules. A single global date-range filter (shared PresetDateRangePicker)
 * scopes the KPI row, the analytics cards and the records table together.
 */
const MeasurementLogs = () => {
  // Rows currently matching the table filters — shared so both the table
  // toolbar and the Download Report panel export the same selection.
  const [rows, setRows] = useState([]);

  // Global date-range filter. { from, to } as YYYY-MM-DD strings; null = off.
  const [dateRange, setDateRange] = useState({ from: null, to: null });

  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError('');
    try {
      setAnalytics(await getMeasurementAnalytics(toIsoWindow(dateRange)));
    } catch (e) {
      setAnalyticsError(e?.message || 'Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const maxDate = useMemo(() => new Date(), []);

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-[var(--disp)] font-semibold text-[16px] text-[var(--tx)]">
            Mattress Measurement Logs
          </h1>
          <p className="text-[11.5px] text-[var(--tx3)] mt-px">
            Declared vs measured L×W×H · deviation, exports &amp; scheduled reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-semibold tracking-[.05em] text-[var(--tx3)] uppercase hidden lg:block">
            Date range
          </span>
          <PresetDateRangePicker
            startDate={dateRange.from}
            endDate={dateRange.to}
            maxDate={maxDate}
            onRangeChange={({ start, end }) =>
              setDateRange({ from: dateKey(start), to: dateKey(end) })
            }
          />
        </div>
      </div>
      <MeasurementKpis
        kpis={analytics?.kpis}
        loading={analyticsLoading}
        error={analyticsError}
      />
      <MeasurementAnalytics
        deviationByAxis={analytics?.deviationByAxis}
        throughput={analytics?.throughput}
        throughputUnit={analytics?.throughputUnit}
        mismatchBySku={analytics?.mismatchBySku}
        dateRange={dateRange}
        loading={analyticsLoading}
      />
      <MeasurementRecords onRowsChange={setRows} dateRange={dateRange} />
      <ReportsAutomation rows={rows} />
    </div>
  );
};

export default MeasurementLogs;
