import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Activity,
  AlertTriangle,
  Clock3,
  Eye,
  EyeOff,
  FileDown,
  Inbox,
  LogOut,
  MailCheck,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  EmailMonitoringAuthError,
  getEmailMonitoringActivity,
  getEmailMonitoringDashboard,
  getEmailMonitoringMe,
  getEmailMonitoringOrganizations,
  getEmailMonitoringToken,
  loginEmailMonitoring,
  logoutEmailMonitoring,
} from '@/helpers/emailMonitoring';

const RANGE_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: 'last7' },
  { label: 'Last 30 Days', value: 'last30' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
];

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Sent', value: 'sent' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Opened', value: 'opened' },
  { label: 'Clicked', value: 'clicked' },
  { label: 'Failed', value: 'failed' },
  { label: 'Bounced', value: 'bounced' },
  { label: 'Spam', value: 'spam' },
  { label: 'Queued', value: 'queued' },
  { label: 'Deferred', value: 'deferred' },
];

const REFRESH_OPTIONS = [
  { label: '15 sec', value: '15 sec', ms: 15000 },
  { label: '30 sec', value: '30 sec', ms: 30000 },
  { label: '1 min', value: '1 min', ms: 60000 },
  { label: '5 min', value: '5 min', ms: 300000 },
];

const EMPTY_ACTIVITY = { page: 1, limit: 25, total: 0, rows: [] };
const DEFAULT_HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const CHART_FONT = 'Inter, Poppins, system-ui, sans-serif';

function firstValue(source, keys, fallback = null) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') return source[key];
  }
  return fallback;
}

function textValue(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') {
    for (const key of ['label', 'name', 'hour', 'time', 'day', 'date', 'month', 'status', 'title', 'email', 'id', 'value', 'count']) {
      const nested = value?.[key];
      if (nested !== undefined && nested !== null && nested !== '') return textValue(nested, fallback);
    }
    return fallback;
  }
  return String(value);
}

function numberValue(value, fallback = 0) {
  if (value && typeof value === 'object') {
    for (const key of ['count', 'value', 'total', 'sent', 'received', 'emails']) {
      const nested = value?.[key];
      if (nested !== undefined && nested !== null && nested !== '') {
        const nestedNumber = numberValue(nested, Number.NaN);
        if (Number.isFinite(nestedNumber)) return nestedNumber;
      }
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '--';
  const n = numberValue(value, Number.NaN);
  if (!Number.isFinite(n)) return textValue(value, '--');
  return new Intl.NumberFormat('en-IN').format(n);
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'string' && value.includes('%')) return value;
  const n = numberValue(value, Number.NaN);
  if (!Number.isFinite(n)) return textValue(value, '--');
  return `${n.toFixed(n % 1 ? 1 : 0)}%`;
}

function titleCase(value) {
  return textValue(value, '-')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (['failed', 'bounced', 'spam', 'rejected'].includes(s)) return 'bg-amber-50 text-amber-700';
  if (['queued', 'pending', 'deferred'].includes(s)) return 'bg-blue-50 text-blue-700';
  return 'bg-emerald-50 text-emerald-700';
}

function normalizeOrganizations(data) {
  const list = Array.isArray(data) ? data : data?.organizations || [];
  return list
    .map((org) => ({
      adminId: textValue(org.adminId || org.id, ''),
      name: textValue(org.name || org.orgName || org.organization || org.email || org.userId || org.orgId, 'Organization'),
    }))
    .filter((org) => org.adminId);
}

function normalizeTrend(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return { categories: [], sent: [], received: [] };
  return {
    categories: rows.map((row) => textValue(firstValue(row, ['label', 'hour', 'time', 'day', 'date', 'month'], ''), '')),
    sent: rows.map((row) => numberValue(firstValue(row, ['sent', 'sentCount', 'emailsSent', 'outbound'], 0))),
    received: rows.map((row) => numberValue(firstValue(row, ['received', 'receivedCount', 'emailsReceived', 'inbound'], 0))),
  };
}

function normalizeDistribution(input) {
  const rows = Array.isArray(input)
    ? input
    : Object.entries(input || {}).map(([label, value]) => ({ label, value }));
  return rows
    .map((item) => ({
      label: titleCase(firstValue(item, ['label', 'status', 'name', 'category'], 'Unknown')),
      value: numberValue(firstValue(item, ['value', 'count', 'total'], 0)),
    }))
    .filter((item) => item.value > 0);
}

function normalizeDomainTraffic(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => ({
      domain: textValue(firstValue(item, ['domain', 'name', 'label'], 'Unknown'), 'Unknown'),
      count: numberValue(firstValue(item, ['count', 'value', 'total'], 0)),
    }))
    .filter((item) => item.count > 0);
}

function normalizeTopSenders(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => ({
      name: textValue(firstValue(item, ['name', 'sender', 'email', 'label'], 'Unknown'), 'Unknown'),
      count: numberValue(firstValue(item, ['count', 'total', 'emails', 'value'], 0)),
    }))
    .filter((item) => item.count > 0);
}

function normalizeAlerts(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((item, index) => ({
    title: textValue(firstValue(item, ['title', 'name', 'type'], `Alert ${index + 1}`), `Alert ${index + 1}`),
    detail: textValue(firstValue(item, ['detail', 'message', 'description'], ''), ''),
    level: textValue(firstValue(item, ['level', 'severity', 'status'], 'Watch'), 'Watch'),
  }));
}

function normalizeHeatmap(input) {
  const sourceRows = Array.isArray(input) ? input : input?.rows;
  if (Array.isArray(sourceRows)) {
    const days = (input?.days || sourceRows[0]?.days || DEFAULT_HEATMAP_DAYS).map((day) => textValue(day, ''));
    return {
      days,
      rows: sourceRows.map((row) => ({
        hour: textValue(firstValue(row, ['hour', 'time', 'label'], ''), ''),
        values: Array.isArray(row.values) ? row.values.map((v) => numberValue(v)) : days.map((day) => numberValue(row[day], 0)),
      })),
    };
  }
  if (input && typeof input === 'object') {
    const hours = Object.keys(input);
    const first = input[hours[0]];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const days = Object.keys(first).map((day) => textValue(day, ''));
      return {
        days,
        rows: hours.map((hour) => ({
          hour: textValue(hour, ''),
          values: days.map((day) => numberValue(input[hour]?.[day], 0)),
        })),
      };
    }
  }
  return { days: DEFAULT_HEATMAP_DAYS, rows: [] };
}

function normalizeActivity(data) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return {
    page: numberValue(data?.page, 1),
    limit: numberValue(data?.limit, 25),
    total: numberValue(data?.total, rows.length),
    rows: rows.map((row, index) => ({
      id: row.id || row.messageId || `${row.timestamp || row.time || 'row'}-${index}`,
      time: textValue(row.time || (row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'), '-'),
      organization: textValue(row.organization || row.organizationName, '-'),
      direction: titleCase(row.direction),
      sender: textValue(row.sender, '-'),
      recipient: textValue(row.recipient, '-'),
      subject: textValue(row.subject, '-'),
      status: titleCase(row.status),
      rawStatus: row.status || '',
    })),
  };
}

function buildKpis(kpis = {}) {
  return [
    { label: 'Emails Sent', value: formatNumber(firstValue(kpis, ['sentToday', 'sent', 'emailsSentToday', 'totalSent', 'sentEmails'])), helper: 'Outbound volume', icon: Send, tone: '#0f779d' },
    { label: 'Emails Received', value: formatNumber(firstValue(kpis, ['receivedToday', 'received', 'emailsReceivedToday', 'totalReceived', 'receivedEmails'])), helper: 'Inbound volume', icon: Inbox, tone: '#16a34a' },
    { label: 'Failed Emails', value: formatNumber(firstValue(kpis, ['failed', 'failedEmails', 'failures'])), helper: 'Needs review', icon: XCircle, tone: '#dc2626' },
    { label: 'Pending Emails', value: formatNumber(firstValue(kpis, ['pending', 'pendingEmails', 'queued', 'deferred'])), helper: 'Queue status', icon: Clock3, tone: '#d97706' },
    { label: 'Delivery Rate', value: formatPercent(firstValue(kpis, ['deliveryRate', 'deliveryRatePct', 'deliveredRate'])), helper: 'Delivery health', icon: MailCheck, tone: '#2563eb' },
  ];
}

function buildPerformanceKpis(performance = {}, kpis = {}) {
  return [
    { label: 'Average Emails / Hour', value: formatNumber(firstValue(performance, ['averageEmailsPerHour', 'avgEmailsPerHour', 'emailsPerHour'])), icon: Activity },
    { label: 'Peak Hour', value: textValue(firstValue(performance, ['peakHour', 'busiestHour'], '--'), '--'), icon: Clock3 },
    { label: 'Bounce Rate', value: formatPercent(firstValue(performance, ['bounceRate', 'bounceRatePct'], firstValue(kpis, ['bounceRate']))), icon: ShieldAlert },
  ];
}

function lineOptions(categories) {
  return {
    chart: { toolbar: { show: false }, zoom: { enabled: false }, fontFamily: CHART_FONT },
    colors: ['#0f779d', '#16a34a'],
    dataLabels: { enabled: false },
    stroke: { width: 3, curve: 'smooth' },
    grid: { borderColor: '#e9eef5', strokeDashArray: 4 },
    xaxis: { categories, labels: { style: { colors: '#64748b', fontSize: '11px' } } },
    yaxis: { labels: { style: { colors: '#64748b', fontSize: '11px' } } },
    legend: { position: 'top', horizontalAlign: 'right', labels: { colors: '#334155' } },
    tooltip: { theme: 'light' },
    noData: { text: 'No data' },
  };
}

function donutOptions(labels) {
  return {
    chart: { toolbar: { show: false }, fontFamily: CHART_FONT },
    labels,
    colors: ['#16a34a', '#0f779d', '#7c3aed', '#dc2626', '#f59e0b', '#64748b', '#38bdf8'],
    dataLabels: { enabled: false },
    legend: { position: 'bottom', labels: { colors: '#334155' } },
    plotOptions: { pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: 'Events', color: '#64748b' } } } } },
    noData: { text: 'No data' },
  };
}

function domainOptions(categories) {
  return {
    chart: { toolbar: { show: false }, fontFamily: CHART_FONT },
    colors: ['#0f779d'],
    dataLabels: { enabled: false },
    plotOptions: { bar: { borderRadius: 5, horizontal: true } },
    xaxis: { categories, labels: { style: { colors: '#64748b', fontSize: '11px' } } },
    yaxis: { labels: { style: { colors: '#334155', fontSize: '11px' } } },
    grid: { borderColor: '#e9eef5' },
    tooltip: { theme: 'light' },
    noData: { text: 'No data' },
  };
}

function heatColor(value) {
  if (value >= 70) return '#0f779d';
  if (value >= 55) return '#38bdf8';
  if (value >= 35) return '#93c5fd';
  return '#dbeafe';
}

function Section({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-[12px] border border-[#e7edf4] bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#1f2937]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyText({ children = 'No data available' }) {
  return <div className="py-5 text-center text-xs text-[#64748b]">{children}</div>;
}

export default function EmailMonitoringDashboard() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getEmailMonitoringToken());
  const [authUser, setAuthUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [activeRange, setActiveRange] = useState('today');
  const [adminId, setAdminId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshEvery, setRefreshEvery] = useState('1 min');

  const [organizations, setOrganizations] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [activity, setActivity] = useState(EMPTY_ACTIVITY);
  const [orgLoading, setOrgLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const handleAuthError = useCallback((error) => {
    if (error instanceof EmailMonitoringAuthError || error?.name === 'EmailMonitoringAuthError') {
      setIsAuthenticated(false);
      setAuthUser(null);
      setDashboard(null);
      setActivity(EMPTY_ACTIVITY);
      setPageError('Email monitoring session expired. Please sign in again.');
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      if (!getEmailMonitoringToken()) {
        if (active) {
          setIsAuthenticated(false);
          setAuthReady(true);
        }
        return;
      }
      try {
        const me = await getEmailMonitoringMe();
        if (active) {
          setAuthUser(me);
          setIsAuthenticated(true);
          setPageError('');
        }
      } catch (error) {
        if (active && !handleAuthError(error)) setPageError(error.message || 'Failed to validate email monitoring session');
      } finally {
        if (active) setAuthReady(true);
      }
    }
    checkSession();
    return () => { active = false; };
  }, [handleAuthError]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const fetchOrganizations = useCallback(async () => {
    if (!isAuthenticated) return;
    setOrgLoading(true);
    try {
      const data = await getEmailMonitoringOrganizations();
      setOrganizations(normalizeOrganizations(data));
    } catch (error) {
      if (!handleAuthError(error)) setPageError(error.message || 'Failed to load organizations');
    } finally {
      setOrgLoading(false);
    }
  }, [handleAuthError, isAuthenticated]);

  const fetchDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) return;
    if (!silent) setDashboardLoading(true);
    try {
      const data = await getEmailMonitoringDashboard({ range: activeRange, adminId, page: 1, limit: 25 });
      setDashboard(data || {});
      if (data?.activity) setActivity(normalizeActivity(data.activity));
      setPageError('');
    } catch (error) {
      if (!handleAuthError(error)) setPageError(error.message || 'Failed to load email monitoring dashboard');
    } finally {
      if (!silent) setDashboardLoading(false);
    }
  }, [activeRange, adminId, handleAuthError, isAuthenticated]);

  const fetchActivity = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) return;
    if (!silent) setActivityLoading(true);
    try {
      const params = { range: activeRange, adminId, page, limit: 25, status: statusFilter };
      if (debouncedSearch) params.search = debouncedSearch;
      const data = await getEmailMonitoringActivity(params);
      setActivity(normalizeActivity(data));
    } catch (error) {
      if (!handleAuthError(error)) setPageError(error.message || 'Failed to load email activity');
    } finally {
      if (!silent) setActivityLoading(false);
    }
  }, [activeRange, adminId, debouncedSearch, handleAuthError, isAuthenticated, page, statusFilter]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchOrganizations();
  }, [fetchOrganizations, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setPage(1);
    fetchDashboard();
  }, [activeRange, adminId, fetchDashboard, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchActivity();
  }, [fetchActivity, isAuthenticated]);

  useEffect(() => {
    const ms = REFRESH_OPTIONS.find((item) => item.value === refreshEvery)?.ms || 0;
    if (!isAuthenticated || !ms) return undefined;
    const id = setInterval(() => {
      fetchDashboard({ silent: true });
      fetchActivity({ silent: true });
    }, ms);
    return () => clearInterval(id);
  }, [fetchActivity, fetchDashboard, isAuthenticated, refreshEvery]);

  const charts = dashboard?.charts || {};
  const hourly = useMemo(() => normalizeTrend(charts.hourly), [charts.hourly]);
  const daily = useMemo(() => normalizeTrend(charts.daily), [charts.daily]);
  const statusDistribution = useMemo(() => normalizeDistribution(charts.statusDistribution), [charts.statusDistribution]);
  const domainTraffic = useMemo(() => normalizeDomainTraffic(charts.domainTraffic), [charts.domainTraffic]);
  const heatmap = useMemo(() => normalizeHeatmap(charts.heatmap), [charts.heatmap]);
  const topSenders = useMemo(() => normalizeTopSenders(dashboard?.topSenders), [dashboard?.topSenders]);
  const alerts = useMemo(() => normalizeAlerts(dashboard?.alerts), [dashboard?.alerts]);
  const metrics = useMemo(() => buildKpis(dashboard?.kpis), [dashboard?.kpis]);
  const performanceKpis = useMemo(() => buildPerformanceKpis(dashboard?.performanceKpis, dashboard?.kpis), [dashboard?.performanceKpis, dashboard?.kpis]);

  const selectedRangeLabel = RANGE_OPTIONS.find((item) => item.value === activeRange)?.label || 'Today';
  const selectedOrganization = adminId === 'all' ? 'All Organizations' : organizations.find((org) => org.adminId === adminId)?.name || 'Selected Organization';
  const totalPages = Math.max(1, Math.ceil((activity.total || 0) / (activity.limit || 25)));

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      await loginEmailMonitoring(loginForm.username.trim(), loginForm.password);
      const me = await getEmailMonitoringMe();
      setAuthUser(me);
      setIsAuthenticated(true);
      setAuthReady(true);
      setPageError('');
    } catch (error) {
      setLoginError(error.message || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    logoutEmailMonitoring();
    setIsAuthenticated(false);
    setAuthUser(null);
    setDashboard(null);
    setActivity(EMPTY_ACTIVITY);
  };

  const exportPdf = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(16);
    doc.text('Email Monitoring Report', 14, 16);
    doc.setFontSize(10);
    doc.text(`Range: ${selectedRangeLabel} | Organization: ${selectedOrganization} | Refresh: ${refreshEvery}`, 14, 23);

    autoTable(doc, {
      startY: 30,
      head: [['Metric', 'Value', 'Note']],
      body: metrics.map((item) => [item.label, item.value, item.helper]),
      theme: 'grid',
      headStyles: { fillColor: [7, 72, 106] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Time', 'Organization', 'Direction', 'Sender', 'Recipient', 'Subject', 'Status']],
      body: activity.rows.length
        ? activity.rows.map((row) => [row.time, row.organization, row.direction, row.sender, row.recipient, row.subject, row.status])
        : [['-', '-', '-', '-', '-', 'No activity data', '-']],
      theme: 'striped',
      headStyles: { fillColor: [7, 72, 106] },
    });

    doc.save('email-monitoring-report.pdf');
  };

  if (!authReady) {
    return <div className="min-h-full bg-[#f6f8fb] p-6 text-sm text-[#64748b]">Checking email monitoring session...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="grid min-h-full place-items-center bg-[#f6f8fb] p-6">
        <form onSubmit={handleLogin} className="w-full max-w-[420px] rounded-[14px] border border-[#e7edf4] bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#64748b]">Email Operations</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#111827]">Email Monitoring Login</h1>
          <p className="mt-1 text-sm text-[#64748b]">Use the one-day email monitoring dashboard token.</p>
          <div className="mt-5 space-y-3">
            <input value={loginForm.username} onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))} placeholder="Username" autoComplete="username" className="h-10 w-full rounded-[8px] border border-[#dbe3ef] px-3 text-sm outline-none" />
            <div className="relative">
              <input
                value={loginForm.password}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Password"
                type={showLoginPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="h-10 w-full rounded-[8px] border border-[#dbe3ef] px-3 pr-10 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword((value) => !value)}
                aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                title={showLoginPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[7px] text-[#64748b]"
              >
                {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {loginError && <p className="text-xs font-medium text-red-600">{loginError}</p>}
            <button type="submit" disabled={loginLoading || !loginForm.username.trim() || !loginForm.password} className="h-10 w-full rounded-[8px] bg-[#07486A] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {loginLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f6f8fb] p-4 md:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-[14px] border border-[#e7edf4] bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#64748b]">Monitoring</p>
            <h1 className="mt-1 text-xl font-semibold text-[#111827] md:text-2xl">Email Monitoring Dashboard</h1>
            <p className="mt-1 text-sm text-[#64748b]">
              Traffic, delivery health, queue status, and recent mail activity.
              {authUser?.username ? ` Signed in as ${authUser.username}.` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={refreshEvery} onChange={(event) => setRefreshEvery(event.target.value)} className="h-10 rounded-[8px] border border-[#dbe3ef] bg-white px-3 text-sm text-[#334155] outline-none">
              {REFRESH_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={adminId} onChange={(event) => { setAdminId(event.target.value); setPage(1); }} className="h-10 min-w-[220px] rounded-[8px] border border-[#dbe3ef] bg-white px-3 text-sm text-[#334155] outline-none">
              <option value="all">All Organizations</option>
              {organizations.map((org) => <option key={org.adminId} value={org.adminId}>{org.name}</option>)}
            </select>
            <button type="button" onClick={() => { fetchDashboard(); fetchActivity(); }} className="grid h-10 w-10 place-items-center rounded-[8px] border border-[#dbe3ef] bg-white text-[#334155]" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button type="button" onClick={exportPdf} className="flex h-10 items-center gap-2 rounded-[8px] bg-[#07486A] px-4 text-sm font-semibold text-white shadow-sm">
              <FileDown className="h-4 w-4" />
              Export PDF
            </button>
            <button type="button" onClick={handleLogout} className="grid h-10 w-10 place-items-center rounded-[8px] border border-[#dbe3ef] bg-white text-[#334155]" title="Logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {pageError && <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{pageError}</div>}

        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((filter) => (
            <button key={filter.value} type="button" onClick={() => { setActiveRange(filter.value); setPage(1); }} className={`rounded-[8px] border px-3 py-2 text-xs font-semibold transition ${activeRange === filter.value ? 'border-[#07486A] bg-[#07486A] text-white' : 'border-[#dbe3ef] bg-white text-[#475569]'}`}>
              {filter.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-[#64748b]">{dashboardLoading ? 'Loading dashboard...' : orgLoading ? 'Loading organizations...' : `Showing ${selectedRangeLabel} for ${selectedOrganization}`}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map(({ label, value, helper, icon: Icon, tone }) => (
            <div key={label} className="rounded-[12px] border border-[#e7edf4] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#64748b]">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{value}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ background: `${tone}16`, color: tone }}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-xs text-[#64748b]">{helper}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Section title="Hourly Sent vs Received" className="xl:col-span-2">
            <ReactApexChart type="line" height={310} options={lineOptions(hourly.categories)} series={[{ name: 'Sent', data: hourly.sent }, { name: 'Received', data: hourly.received }]} />
          </Section>

          <Section title="Email Status Distribution">
            <ReactApexChart type="donut" height={310} options={donutOptions(statusDistribution.length ? statusDistribution.map((item) => item.label) : ['No data'])} series={statusDistribution.length ? statusDistribution.map((item) => item.value) : [0]} />
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Section title="Daily Trend" className="xl:col-span-2">
            <ReactApexChart type="area" height={280} options={lineOptions(daily.categories)} series={[{ name: 'Sent', data: daily.sent }, { name: 'Received', data: daily.received }]} />
          </Section>

          <Section title="Domain Traffic">
            <ReactApexChart type="bar" height={280} options={domainOptions(domainTraffic.map((item) => item.domain))} series={[{ name: 'Emails', data: domainTraffic.map((item) => item.count) }]} />
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Section title="Busiest Hours Heatmap" className="xl:col-span-2">
            {heatmap.rows.length ? (
              <div className="grid gap-2 text-xs" style={{ gridTemplateColumns: `64px repeat(${heatmap.days.length}, minmax(0, 1fr))` }}>
                <span />
                {heatmap.days.map((day) => <span key={day} className="text-center font-semibold text-[#64748b]">{day}</span>)}
                {heatmap.rows.map((row) => (
                  <Fragment key={row.hour}>
                    <span className="flex items-center text-[#64748b]">{row.hour}</span>
                    {row.values.map((value, index) => (
                      <span key={`${row.hour}-${index}`} className="flex h-9 items-center justify-center rounded-[7px] font-semibold" style={{ background: heatColor(value), color: value >= 55 ? '#fff' : '#1e3a8a' }}>
                        {value}
                      </span>
                    ))}
                  </Fragment>
                ))}
              </div>
            ) : <EmptyText>No heatmap data available</EmptyText>}
          </Section>

          <Section title="Operational Alerts">
            {alerts.length ? (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div key={`${alert.title}-${alert.level}`} className="rounded-[10px] border border-[#fde8cc] bg-[#fffbeb] p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#d97706]" />
                      <div>
                        <p className="text-sm font-semibold text-[#92400e]">{alert.title}</p>
                        <p className="mt-1 text-xs text-[#9a6a2f]">{alert.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyText>No active alerts</EmptyText>}
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Section title="Top Senders">
            {topSenders.length ? (
              <div className="space-y-3">
                {topSenders.map((sender) => (
                  <div key={sender.name} className="flex items-center justify-between rounded-[10px] bg-[#f8fafc] px-3 py-3">
                    <span className="text-sm font-medium text-[#334155]">{sender.name}</span>
                    <span className="rounded-full bg-[#e5f6ff] px-3 py-1 text-xs font-semibold text-[#07486A]">{sender.count}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyText>No sender data</EmptyText>}
          </Section>

          <Section title="Performance KPIs" className="xl:col-span-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {performanceKpis.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-[10px] bg-[#f8fafc] p-4">
                  <Icon className="h-5 w-5 text-[#07486A]" />
                  <p className="mt-3 text-lg font-semibold text-[#0f172a]">{value}</p>
                  <p className="mt-1 text-xs text-[#64748b]">{label}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section
          title="Recent Email Activity"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search sender, recipient, subject" className="h-9 w-64 max-w-full rounded-[8px] border border-[#dbe3ef] px-3 text-xs outline-none" />
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="h-9 rounded-[8px] border border-[#dbe3ef] bg-white px-3 text-xs outline-none">
                {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#e7edf4] text-xs uppercase tracking-[0.08em] text-[#64748b]">
                  <th className="py-3 pr-4 font-semibold">Time</th>
                  <th className="py-3 pr-4 font-semibold">Organization</th>
                  <th className="py-3 pr-4 font-semibold">Direction</th>
                  <th className="py-3 pr-4 font-semibold">Sender</th>
                  <th className="py-3 pr-4 font-semibold">Recipient</th>
                  <th className="py-3 pr-4 font-semibold">Subject</th>
                  <th className="py-3 pr-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {activityLoading && !activity.rows.length ? (
                  <tr><td colSpan={7} className="py-5 text-center text-[#64748b]">Loading activity...</td></tr>
                ) : activity.rows.length ? activity.rows.map((row) => (
                  <tr key={row.id} className="border-b border-[#eef2f7] last:border-0">
                    <td className="py-3 pr-4 text-[#64748b]">{row.time}</td>
                    <td className="py-3 pr-4 text-[#334155]">{row.organization}</td>
                    <td className="py-3 pr-4 text-[#334155]">{row.direction}</td>
                    <td className="py-3 pr-4 text-[#334155]">{row.sender}</td>
                    <td className="py-3 pr-4 text-[#334155]">{row.recipient}</td>
                    <td className="py-3 pr-4 font-medium text-[#0f172a]">{row.subject}</td>
                    <td className="py-3 pr-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(row.rawStatus)}`}>{row.status}</span></td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="py-5 text-center text-[#64748b]">No email activity found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748b]">
            <span>{activity.total} total emails</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1 || activityLoading} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-8 rounded-[7px] border border-[#dbe3ef] px-3 text-[#334155] disabled:cursor-default disabled:opacity-50">Prev</button>
              <span>{page} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages || activityLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-8 rounded-[7px] border border-[#dbe3ef] px-3 text-[#334155] disabled:cursor-default disabled:opacity-50">Next</button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
