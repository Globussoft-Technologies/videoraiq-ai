import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import moment from 'moment-timezone';
import HygieneOverview from './HygieneOverview';
import HygieneIncidentTable from './HygieneIncidentTable';
import HygieneReports from './HygieneReports';
import { Activity, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Download, FileText, LoaderCircle, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import PresetDateRangePicker from '@/components/PresetDateRangePicker';
import { useTheme } from '@/theme/ThemeContext';
import getAccessToken from '@/utils/getAccessToken';
import { getConfiguredTimezone } from '@/utils/timezone';
import { HYGIENE_CATEGORY_OPTIONS } from '@/helpers/hygieneDetection';
import { Panel, PanelHead, Kpi, KpiGrid, SnapshotPreview } from '@/pages/SolderLine/ui';
import './hygiene.css';

const TABS = [{ id: 'overview', label: 'Overview', icon: BarChart3 }, { id: 'logs', label: 'Incident logs', icon: Activity }, { id: 'reports', label: 'Reports', icon: FileText }];
const number = value => new Intl.NumberFormat().format(value || 0);

function exportCsv(name, headers, rows) {
  // Protect spreadsheet users from formula execution in model descriptions.
  const cell = value => `"${String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&").replace(/"/g, '""')}"`;
  const blob = new Blob(['\uFEFF', [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${name}.csv`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Empty({ title = 'No incidents in this period', text = 'Try another date range or clear the filters.' }) {
  return <div className="hy-empty"><ShieldCheck size={34} /><strong>{title}</strong><span>{text}</span></div>;
}

export default function HygieneAnalytics() {
  const { theme } = useTheme();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'overview';
  const timezone = getConfiguredTimezone();
  const today = moment.tz(timezone).format('YYYY-MM-DD');
  const [filters, setFilters] = useState(() => ({ startDate: moment.tz(timezone).subtract(6, 'days').format('YYYY-MM-DD'), endDate: today, camera: '', zone: '', category: '', severity: '', status: '' }));
  const [page, setPage] = useState(1);
  const [reportType, setReportType] = useState('categories');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);
  const [preview, setPreview] = useState(null);
  const request = useRef(null);
  const hasLoaded = useRef(false);
  const comparisonCache = useRef(new Map());
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const change = patch => {
    request.current?.abort();
    setFilters(current => ({ ...current, ...patch })); setPage(1); setPreview(null);
  };
  const load = useCallback(async (quiet = false) => {
    if (quiet && request.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    // Loading is an initial state only. Never tear down mounted charts, tiles,
    // tables or their scroll position for a filter, refresh or page change.
    if (!hasLoaded.current) setLoading(true);
    setError('');
    try {
      const fetchData = params => axios.get(`${import.meta.env.VITE_BACKEND}/incidents/hygiene-analytics`, {
        params, signal: controller.signal,
        headers: { Accept: 'application/json', 'x-access-token': getAccessToken() },
      });
      const response = await fetchData({ ...filters, page });
      if (controller.signal.aborted || request.current !== controller) return;
      if (response.data?.body?.status !== 'success') throw new Error(response.data?.body?.message || 'Could not load hygiene analytics.');
      const next = response.data.body.data;
      const comparisonKey = JSON.stringify({ ...filters, category: '' });
      // Category navigation must never replace the comparison with filtered
      // totals, regardless of which backend version serves the request.
      if (!filters.category) {
        const overview = { categories: next.categories || [], categoryHours: next.categoryHours || [] };
        comparisonCache.current.set(comparisonKey, overview);
        next.categoryOverview = overview;
      } else if (comparisonCache.current.has(comparisonKey)) {
        next.categoryOverview = comparisonCache.current.get(comparisonKey);
      } else {
        const comparison = await fetchData({ ...filters, category: '', page: 1 });
        if (controller.signal.aborted || request.current !== controller) return;
        if (comparison.data?.body?.status !== 'success') throw new Error('Could not load category comparison.');
        next.categoryOverview = {
          categories: comparison.data.body.data.categories,
          categoryHours: comparison.data.body.data.categoryHours,
        };
        comparisonCache.current.set(comparisonKey, next.categoryOverview);
      }
      const lastPage = Math.max(1, Math.ceil((next.summary?.incidents || 0) / 25));
      if (page > lastPage) { setPage(lastPage); return; }
      hasLoaded.current = true;
      setData(next); setUpdated(new Date());
    } catch (err) {
      if (!controller.signal.aborted && request.current === controller) setError(err.response?.data?.body?.message || err.message || 'Could not load hygiene analytics.');
    } finally {
      if (request.current === controller) { request.current = null; if (!controller.signal.aborted) setLoading(false); }
    }
  }, [filters, page]);
  useEffect(() => { load(); return () => request.current?.abort(); }, [load]);
  useEffect(() => {
    if (filters.endDate < today) return undefined;
    const timer = setInterval(() => { if (!document.hidden) load(true); }, 30000);
    return () => clearInterval(timer);
  }, [load, filters.endDate, today]);

  const summary = data?.summary || {};
  const cameras = data?.options?.cameras || [];
  const cameraName = id => cameras.find(c => c.id === String(id))?.name || 'Unavailable camera';
  const trend = useMemo(() => {
    if (!data) return [];
    const rows = new Map(data.trend.map(row => [row._id, row]));
    const values = [];
    const day = moment(filters.startDate); const last = moment(filters.endDate);
    while (day.isSameOrBefore(last, 'day') && values.length < 366) { const date = day.format('YYYY-MM-DD'); values.push({ _id: date, incidents: 0, violations: 0, ...rows.get(date) }); day.add(1, 'day'); }
    return values;
  }, [data, filters.startDate, filters.endDate]);
  const chartBase = {
    chart: { background: 'transparent', foreColor: theme === 'dark' ? '#94a3b8' : '#64748b', fontFamily: 'inherit', toolbar: { show: false }, animations: { enabled: !reducedMotion, speed: 500 } },
    theme: { mode: theme }, grid: { borderColor: theme === 'dark' ? '#ffffff0d' : '#0000000d', strokeDashArray: 4 },
    tooltip: { theme }, dataLabels: { enabled: false }, legend: { position: 'top', horizontalAlign: 'right' },
    yaxis: { min: 0, forceNiceScale: true, labels: { formatter: value => Number.isInteger(value) ? number(value) : '' } },
  };
  const switchTab = next => { if (next === 'overview') setPage(1); setPreview(null); setParams(current => { const nextParams = new URLSearchParams(current); nextParams.set('tab', next); return nextParams; }); };
  const exportName = `hygiene-${filters.startDate}-${filters.endDate}`;
  const activeFilters = ['camera', 'zone', 'category', 'severity', 'status'].filter(key => filters[key]).length;
  return <div className="hy-page">
    <div className="hy-toolbar">
      <div className="hy-tabs" role="tablist" aria-label="Hygiene analytics views" onKeyDown={event => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const index = TABS.findIndex(t => t.id === tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        switchTab(TABS[next].id); document.getElementById(`hy-tab-${TABS[next].id}`)?.focus();
      }}>
        {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" id={`hy-tab-${id}`} aria-selected={tab === id} aria-controls="hy-panel" tabIndex={tab === id ? 0 : -1} className={tab === id ? 'active' : ''} onClick={() => switchTab(id)}><Icon size={15} />{label}</button>)}
      </div>
      <div className="hy-actions"><button type="button" className="hy-icon-button" aria-label="Refresh hygiene analytics" disabled={loading} onClick={() => load()}><RefreshCw size={15} className={loading ? 'hy-spin' : ''} /></button><PresetDateRangePicker startDate={filters.startDate} endDate={filters.endDate} maxDate={today} onRangeChange={({ start, end }) => change({ startDate: start ? moment(start).format('YYYY-MM-DD') : today, endDate: end ? moment(end).format('YYYY-MM-DD') : start ? moment(start).format('YYYY-MM-DD') : today })} /></div>
    </div>
    <div className="hy-content">
      <div className="hy-period-heading"><span>Hygiene monitoring <b>{moment(filters.startDate).format('DD MMM')} – {moment(filters.endDate).format('DD MMM YYYY')}</b></span><span>{updated && `Updated ${moment(updated).tz(data?.timezone || timezone).format('HH:mm:ss')} · `}{data?.timezone || timezone}</span></div>
      <div className="hy-filters"><SlidersHorizontal size={16} /><label>Camera<select value={filters.camera} onChange={e => change({ camera: e.target.value })}><option value="">All cameras</option>{cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}{filters.camera && !cameras.some(c => c.id === filters.camera) && <option value={filters.camera}>Selected camera</option>}</select></label><label>Zone<select value={filters.zone} onChange={e => change({ zone: e.target.value })}><option value="">All zones</option>{[...new Set([...(data?.options?.zones || []), ...(filters.zone ? [filters.zone] : [])])].map(z => <option key={z}>{z}</option>)}</select></label><label>Category<select value={filters.category} onChange={e => change({ category: e.target.value })}><option value="">All categories</option>{HYGIENE_CATEGORY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label>Severity<select value={filters.severity} onChange={e => change({ severity: e.target.value })}><option value="">All severities</option>{['high', 'moderate', 'low'].map(s => <option key={s}>{s}</option>)}</select></label><label>Status<select value={filters.status} onChange={e => change({ status: e.target.value })}><option value="">All statuses</option><option value="open">Unresolved</option><option value="resolved">Resolved</option></select></label>{activeFilters > 0 && <button type="button" className="hy-link" onClick={() => change({ camera: '', zone: '', category: '', severity: '', status: '' })}>Clear ({activeFilters})</button>}</div>
      {error && <div className="hy-error" role="alert">{error}<button type="button" onClick={() => load()}>Retry</button></div>}
      {loading ? <div className="hy-empty" role="status"><LoaderCircle className="hy-spin" size={30} /><span>Loading hygiene insights…</span></div> : data && <>
        <KpiGrid><Kpi label="Incident alerts" value={number(summary.incidents)} sub="Recorded detection events" color="#14b8a6" /><Kpi label="Violations" value={number(summary.violations)} sub={filters.category ? "Selected category only" : "Reported across matching incidents"} color="#a78bfa" /><Kpi label="High-risk incidents" value={number(summary.high)} sub="Incidents flagged high risk" color="#f97316" /><Kpi label="Unresolved" value={number(summary.open)} sub="Incidents pending resolution" color="#ef4444" /><Kpi label="Cameras with alerts" value={number(summary.cameras)} sub="In the selected period" color="#38bdf8" /></KpiGrid>
        <div role="tabpanel" id="hy-panel" aria-labelledby={`hy-tab-${tab}`} tabIndex={0} key={tab} className="hy-tab-content">
          {tab === 'overview' && <HygieneOverview data={data} filters={filters} trend={trend} chartBase={chartBase} cameraName={cameraName} onFilter={change} onOpenLogs={() => switchTab('logs')} onPreview={setPreview} onExport={(suffix, headers, rows) => exportCsv(`${exportName}-${suffix}`, headers, rows)} />}
          {tab === 'logs' && <Panel><PanelHead title="Incident register" sub={`${number(summary.incidents)} matching incidents`} right={<button type="button" className="hy-button" disabled={!data.events.length} onClick={() => exportCsv(`${exportName}-page-${page}`, ['Time', 'Timezone', 'Camera', 'Zone', 'Severity', 'Status', 'Violations', 'Description'], data.events.map(e => [moment(e.timeOfIncident).tz(data.timezone).format('YYYY-MM-DD HH:mm:ss'), data.timezone, cameraName(e.channelId), e.zone, e.severity, e.resolved ? 'Resolved' : 'Unresolved', e.violationCount, e.description]))}><Download size={14} />Export this page</button>} />
            <HygieneIncidentTable events={data.events} timezone={data.timezone} cameraName={cameraName} onPreview={setPreview} /><div className="hy-pagination"><span>{summary.incidents ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, summary.incidents)}` : '0'} of {number(summary.incidents)}</span><div><button type="button" className="hy-icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button><span>Page {page} of {Math.max(1, Math.ceil((summary.incidents || 0) / 25))}</span><button type="button" className="hy-icon-button" aria-label="Next page" disabled={page * 25 >= summary.incidents} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button></div></div>
          </Panel>}
          {tab === 'reports' && <HygieneReports type={reportType} onTypeChange={setReportType} data={data} trend={trend} cameraName={cameraName} filters={filters} today={today} onRangeChange={change} updated={updated} />}
        </div>
      </>}
    </div>
    <SnapshotPreview items={(data?.events || []).map(e => ({ _id: e._id, image: e.Image }))} openId={preview} onOpen={setPreview} onClose={() => setPreview(null)} />
  </div>;
}
