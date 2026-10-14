import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import moment from 'moment-timezone';
import { usePermissions } from '@/context/PermissionContext';
import { useModuleConfig } from '@/context/ModuleConfigContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import PresetDateRangePicker from '@/components/PresetDateRangePicker';
import { getConfiguredTimezone } from '@/utils/timezone';
import { fetchSolderLine } from './api';
import { alertRows, buildSolderLine } from './solderLineData';
import { mono, BAD, OK, DataLoader, NoPeriodData } from './ui';
import Overview, { CameraStations } from './Overview';
import AlertLogs from './AlertLogs';
import Reports from './Reports';
import SolderSummary from './SolderSummary';

const REFRESH_MS = 30000;
const TABS = [
  { view: 'overview', label: 'Overview', to: '/solder-line', modulePageKey: 'solderLine' },
  { view: 'logs', label: 'Alert Logs', to: '/solder-line/logs', modulePageKey: 'solderAlertLogs' },
  { view: 'reports', label: 'Reports', to: '/solder-line/reports', modulePageKey: 'operatorReports' },
];

/**
 * Solder Line (deskSolarShoulderDetection): one shell for the Overview, Alert
 * Logs and Reports tabs. The tabs share one date range and one fetch, so
 * switching tabs never refetches and the Alert Logs count matches the logs.
 */
export default function SolderLine() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const view = TABS.find((t) => t.view !== 'overview' && pathname.startsWith(t.to))?.view || 'overview';
  const { permissions, loading: permissionsLoading } = usePermissions();
  const { modules } = useModuleConfig();
  const visibleTabs = TABS.filter((tab) => modules?.solarLineQc?.[tab.modulePageKey] === true);
  const canOpenLogs = modules?.solarLineQc?.solderAlertLogs === true;
  const today = moment.tz(getConfiguredTimezone()).format('YYYY-MM-DD');
  const [range, setRange] = useState({ startDate: today, endDate: today });
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);
  const requestRef = useRef(null);

  const logs = permissions?.logs;
  const canView = typeof logs?.deskSolarShoulderLogs?.view === 'boolean'
    ? logs.deskSolarShoulderLogs.view
    : typeof logs?.global?.view === 'boolean' ? logs.global.view : Boolean(logs?.view);

  const load = useCallback(async (quiet = false) => {
    // Refreshes must not cancel a date-filter request that is still loading.
    if (quiet && requestRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const res = await fetchSolderLine(range, { signal: controller.signal });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setRaw(res?.data?.body?.data || null);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setError(err?.response?.data?.body?.message || 'Could not load the solder line.');
      if (!quiet) setRaw(null);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, [range]);

  const changeRange = useCallback((nextRange) => {
    if (nextRange.startDate === range.startDate && nextRange.endDate === range.endDate) return;
    requestRef.current?.abort();
    setLoading(true);
    setError(null);
    setRange(nextRange);
  }, [range]);

  useEffect(() => {
    load();
    return () => requestRef.current?.abort();
  }, [load]);
  // Live while the range includes today: new alerts and closed absences show up.
  useEffect(() => {
    if (range.endDate < today) return undefined;
    const t = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [load, range.endDate, today]);

  const model = useMemo(() => buildSolderLine(raw), [raw]);
  const rows = useMemo(() => alertRows(model), [model]);

  if (permissionsLoading) return <PageLoader />;
  if (!canView) return <AccessDenied message="You do not have permission to view the solder line." onBack={() => navigate(-1)} />;

  const live = !loading && model?.isToday;
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0 22px', position: 'sticky', top: 0, zIndex: 40, background: 'var(--bg1solid)', borderBottom: '1px solid var(--bd)' }}>
        {visibleTabs.map((t) => (
          <NavLink key={t.view} to={t.to} end style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px 10px', fontSize: 13.5, fontWeight: 600,
            textDecoration: 'none', color: isActive ? 'var(--tx)' : 'var(--tx3)', marginBottom: -1,
            borderBottom: `2px solid ${isActive ? 'var(--blue)' : 'transparent'}`,
          })}>
            {t.label}
            {t.view === 'logs' && !loading && rows.length > 0 && (
              <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: '#fff', background: BAD, borderRadius: 8, padding: '1px 6px' }}>{rows.length}</span>
            )}
          </NavLink>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }}>
          {live && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, border: `1px solid ${OK}66`, background: `${OK}1a` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: OK, animation: 'vq-blink 1.4s ease-in-out infinite' }} />
              <span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: OK }}>LIVE</span>
            </span>
          )}
          <PresetDateRangePicker
            startDate={range.startDate}
            endDate={range.endDate}
            maxDate={today}
            onRangeChange={({ start, end }) => {
              const startDate = start ? moment(start).format('YYYY-MM-DD') : today;
              changeRange({ startDate, endDate: end ? moment(end).format('YYYY-MM-DD') : startDate });
            }}
          />
        </div>
      </div>

      <div aria-busy={loading} style={{ padding: '22px 22px 40px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${BAD}66`, color: BAD, fontSize: 12.5 }}>
          {error} <button type="button" onClick={() => load()} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
        </div>
      )}
      {!loading && model?.truncated && (
        <div style={{ fontSize: 12, color: 'var(--warn)' }}>Showing up to 5,000 alerts and panel records in this range. Pick a shorter range to see them all.</div>
      )}

      {loading && <DataLoader />}
      {/* Keep report controls mounted so changing periods preserves the report type. */}
      <div hidden={loading} style={!loading ? { display: 'flex', flexDirection: 'column', gap: 18 } : undefined}>
      {!model ? !error && <NoPeriodData /> : (
        <>
          <SolderSummary model={model} selected={selected} onSelect={setSelected}>
            {view === 'overview' && <CameraStations model={model} sel={selected} setSel={setSelected} />}
          </SolderSummary>
          {view === 'overview' && <Overview model={model} selected={selected} onSelect={setSelected} range={range} onOpenLogs={canOpenLogs ? () => navigate('/solder-line/logs') : null} />}
          {view === 'logs' && <AlertLogs model={model} rows={rows} range={range} />}
          {view === 'reports' && <Reports model={model} selected={selected} onSelect={setSelected} range={range} today={today} onRangeChange={changeRange} />}
        </>
      )}
      </div>
      </div>
    </div>
  );
}
