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
import { Badge, Panel, PanelHeader } from '../../../components/primitives';
import {
  EmailMonitoringAuthError,
  getEmailMonitoringActivity,
  getEmailMonitoringDashboard,
  getEmailMonitoringMe,
  getEmailMonitoringOrganizations,
  getEmailMonitoringToken,
  loginEmailMonitoring,
  logoutEmailMonitoring,
} from '../../../helpers/emailMonitoring';

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

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (['failed', 'bounced', 'spam', 'rejected'].includes(s)) return 'var(--warn)';
  if (['queued', 'pending', 'deferred'].includes(s)) return 'var(--blue)';
  return 'var(--ok)';
}

function normalizeOrganizations(data) {
  const list = Array.isArray(data) ? data : data?.organizations || [];
  return list
    .map((org) => ({
      adminId: textValue(org.adminId || org.id, ''),
      name: textValue(org.name || org.orgName || org.organization || org.email || org.userId || org.orgId, 'Organization'),
      email: textValue(org.email, ''),
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
    {
      label: 'Emails Sent',
      value: formatNumber(firstValue(kpis, ['sentToday', 'sent', 'emailsSentToday', 'totalSent', 'sentEmails'])),
      helper: 'Outbound volume',
      icon: Send,
      color: '#3b82f6',
    },
    {
      label: 'Emails Received',
      value: formatNumber(firstValue(kpis, ['receivedToday', 'received', 'emailsReceivedToday', 'totalReceived', 'receivedEmails'])),
      helper: 'Inbound volume',
      icon: Inbox,
      color: '#22c55e',
    },
    {
      label: 'Failed',
      value: formatNumber(firstValue(kpis, ['failed', 'failedEmails', 'failures'])),
      helper: 'Needs review',
      icon: XCircle,
      color: '#ff4d4d',
    },
    {
      label: 'Pending',
      value: formatNumber(firstValue(kpis, ['pending', 'pendingEmails', 'queued', 'deferred'])),
      helper: 'Queue status',
      icon: Clock3,
      color: '#f5a623',
    },
    {
      label: 'Delivery Rate',
      value: formatPercent(firstValue(kpis, ['deliveryRate', 'deliveryRatePct', 'deliveredRate'])),
      helper: 'Delivery health',
      icon: MailCheck,
      color: '#22d3ee',
    },
  ];
}

function buildPerformanceKpis(performance = {}, kpis = {}) {
  return [
    {
      label: 'Average Emails / Hour',
      value: formatNumber(firstValue(performance, ['averageEmailsPerHour', 'avgEmailsPerHour', 'emailsPerHour'])),
      icon: Activity,
    },
    {
      label: 'Peak Hour',
      value: textValue(firstValue(performance, ['peakHour', 'busiestHour'], '--'), '--'),
      icon: Clock3,
    },
    {
      label: 'Bounce Rate',
      value: formatPercent(firstValue(performance, ['bounceRate', 'bounceRatePct'], firstValue(kpis, ['bounceRate']))),
      icon: ShieldAlert,
    },
  ];
}

function chartOptions(categories) {
  return {
    chart: { toolbar: { show: false }, zoom: { enabled: false }, fontFamily: 'var(--ui)', foreColor: '#98a2bd' },
    colors: ['#3b82f6', '#22c55e'],
    dataLabels: { enabled: false },
    stroke: { width: 3, curve: 'smooth' },
    grid: { borderColor: 'rgba(148, 163, 184, .18)', strokeDashArray: 4 },
    xaxis: { categories },
    legend: { position: 'top', horizontalAlign: 'right' },
    tooltip: { theme: 'dark' },
    noData: { text: 'No data' },
  };
}

function donutOptions(labels) {
  return {
    chart: { toolbar: { show: false }, fontFamily: 'var(--ui)', foreColor: '#98a2bd' },
    labels,
    colors: ['#22c55e', '#3b82f6', '#a855f7', '#ff4d4d', '#f5a623', '#7c88a5', '#22d3ee'],
    dataLabels: { enabled: false },
    legend: { position: 'bottom' },
    plotOptions: {
      pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: 'Events', color: '#98a2bd' } } } },
    },
    noData: { text: 'No data' },
  };
}

function domainOptions(categories) {
  return {
    chart: { toolbar: { show: false }, fontFamily: 'var(--ui)', foreColor: '#98a2bd' },
    colors: ['#22d3ee'],
    dataLabels: { enabled: false },
    plotOptions: { bar: { borderRadius: 5, horizontal: true } },
    xaxis: { categories },
    grid: { borderColor: 'rgba(148, 163, 184, .18)' },
    tooltip: { theme: 'dark' },
    noData: { text: 'No data' },
  };
}

function heatColor(value) {
  if (value >= 70) return 'rgba(59,130,246,.95)';
  if (value >= 55) return 'rgba(34,211,238,.78)';
  if (value >= 35) return 'rgba(34,197,94,.45)';
  return 'rgba(148,163,184,.18)';
}

function Section({ title, action, children, style = {} }) {
  return (
    <Panel style={{ overflow: 'hidden', minWidth: 0, ...style }}>
      <PanelHeader title={title} action={action} />
      <div style={{ padding: 16 }}>{children}</div>
    </Panel>
  );
}

function EmptyText({ children = 'No data available' }) {
  return <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>{children}</div>;
}

function MetricCard({ metric }) {
  const Icon = metric.icon;
  return (
    <Panel gradient style={{ padding: 15, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>{metric.label}</div>
          <div style={{ marginTop: 9, fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{metric.value}</div>
        </div>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: `${metric.color}20`, color: metric.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Icon size={19} strokeWidth={1.8} />
        </span>
      </div>
      <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--tx3)' }}>{metric.helper}</div>
    </Panel>
  );
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
  const selectedOrganization = adminId === 'all'
    ? 'All Organizations'
    : organizations.find((org) => org.adminId === adminId)?.name || 'Selected Organization';
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
      headStyles: { fillColor: [59, 130, 246] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Time', 'Organization', 'Direction', 'Sender', 'Recipient', 'Subject', 'Status']],
      body: activity.rows.length
        ? activity.rows.map((row) => [row.time, row.organization, row.direction, row.sender, row.recipient, row.subject, row.status])
        : [['-', '-', '-', '-', '-', 'No activity data', '-']],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save('email-monitoring-report.pdf');
  };

  if (!authReady) {
    return (
      <div style={{ padding: 22 }}>
        <Panel style={{ padding: 22, color: 'var(--tx2)' }}>Checking email monitoring session...</Panel>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100%', padding: 22, display: 'grid', placeItems: 'center' }}>
        <Panel style={{ width: 'min(420px, 100%)', padding: 22 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--tx3)' }}>EMAIL OPERATIONS</div>
          <div style={{ marginTop: 6, fontFamily: 'var(--disp)', fontSize: 22, fontWeight: 700 }}>Email Monitoring Login</div>
          <div style={{ marginTop: 5, fontSize: 12.5, color: 'var(--tx2)' }}>Use the one-day email monitoring dashboard token.</div>

          <form onSubmit={handleLogin} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              value={loginForm.username}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="Username"
              autoComplete="username"
              style={{ height: 40, borderRadius: 9, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx)', padding: '0 12px', outline: 'none' }}
            />
            <div style={{ position: 'relative' }}>
              <input
                value={loginForm.password}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Password"
                type={showLoginPassword ? 'text' : 'password'}
                autoComplete="current-password"
                style={{ width: '100%', height: 40, borderRadius: 9, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx)', padding: '0 42px 0 12px', outline: 'none', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword((value) => !value)}
                aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                title={showLoginPassword ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, border: 0, borderRadius: 7, background: 'transparent', color: 'var(--tx3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                {showLoginPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
              </button>
            </div>
            {loginError && <div style={{ color: 'var(--crit)', fontSize: 12 }}>{loginError}</div>}
            <button
              type="submit"
              disabled={loginLoading || !loginForm.username.trim() || !loginForm.password}
              style={{ height: 40, borderRadius: 9, border: 0, background: 'linear-gradient(135deg,var(--blue),var(--violet))', color: '#fff', fontWeight: 700, cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading ? 0.7 : 1 }}
            >
              {loginLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </Panel>
      </div>
    );
  }

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`
        @media (max-width: 1180px) {
          .vq-email-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .vq-email-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .vq-email-kpis { grid-template-columns: 1fr !important; }
          .vq-email-topbar { align-items: stretch !important; }
          .vq-email-actions { width: 100%; justify-content: stretch !important; }
          .vq-email-actions > * { flex: 1 1 auto; }
          .vq-email-table { min-width: 860px; }
        }
      `}</style>

      <div className="vq-email-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.1em', color: 'var(--tx3)' }}>EMAIL OPERATIONS</div>
          <div style={{ marginTop: 4, fontFamily: 'var(--disp)', fontSize: 24, fontWeight: 700 }}>Email Monitoring</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--tx2)' }}>
            Traffic, delivery health, queue status, and recent mail activity.
            {authUser?.username ? ` Signed in as ${authUser.username}.` : ''}
          </div>
        </div>

        <div className="vq-email-actions" style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <select value={refreshEvery} onChange={(event) => setRefreshEvery(event.target.value)} style={{ height: 36, borderRadius: 9, background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--bd)', padding: '0 11px', outline: 'none', fontSize: 12.5 }}>
            {REFRESH_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select
            value={adminId}
            onChange={(event) => { setAdminId(event.target.value); setPage(1); }}
            style={{ height: 36, minWidth: 220, borderRadius: 9, background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--bd)', padding: '0 11px', outline: 'none', fontSize: 12.5 }}
          >
            <option value="all">All Organizations</option>
            {organizations.map((org) => <option key={org.adminId} value={org.adminId}>{org.name}</option>)}
          </select>
          <button type="button" onClick={() => { fetchDashboard(); fetchActivity(); }} style={{ height: 36, width: 38, borderRadius: 9, background: 'var(--bg2)', color: 'var(--tx2)', border: '1px solid var(--bd)', display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Refresh">
            <RefreshCw size={15} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={exportPdf} style={{ height: 36, borderRadius: 9, background: 'linear-gradient(135deg,var(--blue),var(--violet))', color: '#fff', border: 0, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <FileDown size={15} strokeWidth={1.8} />
            Export PDF
          </button>
          <button type="button" onClick={handleLogout} style={{ height: 36, width: 38, borderRadius: 9, background: 'var(--bg2)', color: 'var(--tx2)', border: '1px solid var(--bd)', display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Logout">
            <LogOut size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {pageError && (
        <Panel style={{ padding: 12, color: 'var(--warn)', borderColor: 'rgba(245,166,35,.4)', background: 'rgba(245,166,35,.08)', fontSize: 12 }}>
          {pageError}
        </Panel>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {RANGE_OPTIONS.map((filter) => {
          const active = activeRange === filter.value;
          return (
            <button key={filter.value} type="button" onClick={() => { setActiveRange(filter.value); setPage(1); }} style={{ borderRadius: 8, border: `1px solid ${active ? 'rgba(59,130,246,.55)' : 'var(--bd)'}`, background: active ? 'rgba(59,130,246,.15)' : 'var(--bg2)', color: active ? 'var(--blue)' : 'var(--tx2)', padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {filter.label}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
        {dashboardLoading ? 'Loading dashboard...' : orgLoading ? 'Loading organizations...' : `Showing ${selectedRangeLabel} for ${selectedOrganization}`}
      </div>

      <div className="vq-email-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
        {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </div>

      <div className="vq-email-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <Section title="Hourly Sent vs Received">
          <ReactApexChart type="line" height={310} options={chartOptions(hourly.categories)} series={[{ name: 'Sent', data: hourly.sent }, { name: 'Received', data: hourly.received }]} />
        </Section>

        <Section title="Status Distribution">
          <ReactApexChart type="donut" height={310} options={donutOptions(statusDistribution.length ? statusDistribution.map((item) => item.label) : ['No data'])} series={statusDistribution.length ? statusDistribution.map((item) => item.value) : [0]} />
        </Section>
      </div>

      <div className="vq-email-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <Section title="Daily Trend">
          <ReactApexChart type="area" height={280} options={chartOptions(daily.categories)} series={[{ name: 'Sent', data: daily.sent }, { name: 'Received', data: daily.received }]} />
        </Section>

        <Section title="Domain Traffic">
          <ReactApexChart type="bar" height={280} options={domainOptions(domainTraffic.map((item) => item.domain))} series={[{ name: 'Emails', data: domainTraffic.map((item) => item.count) }]} />
        </Section>
      </div>

      <div className="vq-email-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <Section title="Busiest Hours Heatmap">
          {heatmap.rows.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: `64px repeat(${heatmap.days.length}, minmax(0, 1fr))`, gap: 8, fontSize: 11.5 }}>
              <span />
              {heatmap.days.map((day) => <span key={day} style={{ textAlign: 'center', color: 'var(--tx3)', fontWeight: 700 }}>{day}</span>)}
              {heatmap.rows.map((row) => (
                <Fragment key={row.hour}>
                  <span style={{ display: 'flex', alignItems: 'center', color: 'var(--tx3)' }}>{row.hour}</span>
                  {row.values.map((value, index) => (
                    <span key={`${row.hour}-${index}`} style={{ height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: heatColor(value), color: value >= 55 ? '#fff' : 'var(--tx2)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map((alert) => (
                <div key={`${alert.title}-${alert.level}`} style={{ border: '1px solid rgba(245,166,35,.32)', background: 'rgba(245,166,35,.08)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <AlertTriangle size={16} strokeWidth={1.8} style={{ color: 'var(--warn)', marginTop: 1, flex: '0 0 auto' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{alert.title}</span>
                        <Badge color="var(--warn)">{titleCase(alert.level)}</Badge>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.45, color: 'var(--tx2)' }}>{alert.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyText>No active alerts</EmptyText>}
        </Section>
      </div>

      <div className="vq-email-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 18 }}>
        <Section title="Top Senders">
          {topSenders.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topSenders.map((sender) => (
                <div key={sender.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: '10px 12px' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{sender.name}</span>
                  <Badge color="var(--cyan)" solid>{sender.count}</Badge>
                </div>
              ))}
            </div>
          ) : <EmptyText>No sender data</EmptyText>}
        </Section>

        <Section title="Performance KPIs">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }} className="vq-email-kpis">
            {performanceKpis.map(({ label, value, icon: Icon }) => (
              <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 11, padding: 14 }}>
                <Icon size={18} strokeWidth={1.8} style={{ color: 'var(--blue)' }} />
                <div style={{ marginTop: 11, fontFamily: 'var(--disp)', fontSize: 19, fontWeight: 700 }}>{value}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--tx3)' }}>{label}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section
        title="Recent Email Activity"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search sender, recipient, subject" style={{ height: 34, width: 250, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx)', outline: 'none', padding: '0 11px', fontSize: 12 }} />
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} style={{ height: 34, borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx)', outline: 'none', padding: '0 10px', fontSize: 12 }}>
              {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
        }
      >
        <div className="vq-scroll" style={{ overflowX: 'auto' }}>
          <table className="vq-email-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: 'var(--tx3)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.06em', textAlign: 'left', borderBottom: '1px solid var(--bd)' }}>
                <th style={{ padding: '0 12px 10px 0' }}>TIME</th>
                <th style={{ padding: '0 12px 10px 0' }}>ORGANIZATION</th>
                <th style={{ padding: '0 12px 10px 0' }}>DIRECTION</th>
                <th style={{ padding: '0 12px 10px 0' }}>SENDER</th>
                <th style={{ padding: '0 12px 10px 0' }}>RECIPIENT</th>
                <th style={{ padding: '0 12px 10px 0' }}>SUBJECT</th>
                <th style={{ padding: '0 0 10px 0' }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {activityLoading && !activity.rows.length ? (
                <tr><td colSpan={7} style={{ padding: 18, textAlign: 'center', color: 'var(--tx3)' }}>Loading activity...</td></tr>
              ) : activity.rows.length ? activity.rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                  <td style={{ padding: '12px 12px 12px 0', color: 'var(--tx3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{row.time}</td>
                  <td style={{ padding: '12px 12px 12px 0', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{row.organization}</td>
                  <td style={{ padding: '12px 12px 12px 0', color: 'var(--tx2)' }}>{row.direction}</td>
                  <td style={{ padding: '12px 12px 12px 0', color: 'var(--tx2)' }}>{row.sender}</td>
                  <td style={{ padding: '12px 12px 12px 0', color: 'var(--tx2)' }}>{row.recipient}</td>
                  <td style={{ padding: '12px 12px 12px 0', fontWeight: 600 }}>{row.subject}</td>
                  <td style={{ padding: '12px 0' }}><Badge color={statusColor(row.rawStatus)}>{row.status}</Badge></td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={{ padding: 18, textAlign: 'center', color: 'var(--tx3)' }}>No email activity found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, fontSize: 12, color: 'var(--tx3)' }}>
          <span>{activity.total} total emails</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" disabled={page <= 1 || activityLoading} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid var(--bd)', background: 'var(--bg2)', color: page <= 1 ? 'var(--tx3)' : 'var(--tx)', cursor: page <= 1 ? 'default' : 'pointer' }}>Prev</button>
            <span>{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages || activityLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid var(--bd)', background: 'var(--bg2)', color: page >= totalPages ? 'var(--tx3)' : 'var(--tx)', cursor: page >= totalPages ? 'default' : 'pointer' }}>Next</button>
          </div>
        </div>
      </Section>
    </div>
  );
}
