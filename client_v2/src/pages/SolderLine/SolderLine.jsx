import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { mono, BAD, OK } from './ui';
import Overview from './Overview';
import AlertLogs from './AlertLogs';
import Reports from './Reports';

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

  const logs = permissions?.logs;
  const canView = typeof logs?.deskSolarShoulderLogs?.view === 'boolean'
    ? logs.deskSolarShoulderLogs.view
    : typeof logs?.global?.view === 'boolean' ? logs.global.view : Boolean(logs?.view);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetchSolderLine(range);
      setRaw(res?.data?.body?.data || null);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.body?.message || 'Could not load the solder line.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);
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

  const live = model?.isToday;
  return (
    <div style={{ padding: '18px 22px 40px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--bd)' }}>
        {visibleTabs.map((t) => (
          <NavLink key={t.view} to={t.to} end style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px 10px', fontSize: 13.5, fontWeight: 600,
            textDecoration: 'none', color: isActive ? 'var(--tx)' : 'var(--tx3)', marginBottom: -1,
            borderBottom: `2px solid ${isActive ? 'var(--blue)' : 'transparent'}`,
          })}>
            {t.label}
            {t.view === 'logs' && rows.length > 0 && (
              <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: '#fff', background: BAD, borderRadius: 8, padding: '1px 6px' }}>{rows.length}</span>
            )}
          </NavLink>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
          {model && (
            <span style={{ ...mono, fontSize: 10.5, color: 'var(--tx3)' }}>
              {model.stations.length} STATION{model.stations.length === 1 ? '' : 'S'} · {model.line.operators} OPERATORS
            </span>
          )}
          {live && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, border: `1px solid ${OK}66`, background: `${OK}1a` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: OK, animation: 'vq-blink 1.4s ease-in-out infinite' }} />
              <span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: OK }}>LIVE</span>
            </span>
          )}
          {view !== 'reports' && (
            <PresetDateRangePicker
              startDate={range.startDate}
              endDate={range.endDate}
              maxDate={today}
              onRangeChange={({ start, end }) => {
                const startDate = start ? moment(start).format('YYYY-MM-DD') : today;
                setRange({ startDate, endDate: end ? moment(end).format('YYYY-MM-DD') : startDate });
              }}
            />
          )}
        </span>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${BAD}66`, color: BAD, fontSize: 12.5 }}>
          {error} <button type="button" onClick={() => load()} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
        </div>
      )}
      {model?.truncated && (
        <div style={{ fontSize: 12, color: 'var(--warn)' }}>Showing the first 5,000 alerts of this range. Pick a shorter range to see them all.</div>
      )}

      {loading && !model ? <PageLoader /> : !model ? null : (
        <>
          {view === 'overview' && <Overview model={model} onOpenLogs={canOpenLogs ? () => navigate('/solder-line/logs') : null} />}
          {view === 'logs' && <AlertLogs model={model} rows={rows} />}
          {view === 'reports' && <Reports model={model} range={range} today={today} onRangeChange={setRange} />}
        </>
      )}
    </div>
  );
}
