import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Panel, Badge } from '../../../components/primitives';
import { AsyncBoundary, Loading } from '../../../components/States';
import DateRangePicker from '../../../components/DateRangePicker';
import { severity, detectionLabel, shortDateTime, timeAgo, mediaUrl } from '../../../lib/format';
import { fetchIncidents, fetchIncidentById, updateReportStatus, updateIncidentResolved } from '../../../helpers/incidents';

const PAGE_SIZE = 50;
// Auto-refresh only while the user is looking at just the first page â€” once
// they've scrolled to load more, a silent 30s poll would reset/shrink the
// list out from under them, so polling pauses until they're back on page 1.
const POLL_MS = 30000;
const ALL_STATUS_FILTER = ['new', 'resolved', 'reported'];

const incidentIdOf = (incident) => String(
  incident?._id || incident?.id || incident?.incidentId || ''
);

function exportClipFilename(incident) {
  const name = incident?.incidentName || detectionLabel(incident?.incidentType) || 'alert';
  const safeName = String(name)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${safeName || 'alert'}.jpg`;
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High' },
  { key: 'moderate', label: 'Med' },
  { key: 'low', label: 'Low' },
];

// Status filter — New/Resolved; Report is handled separately.
// statusOf() already derives per row, just relabeled here ("Active" = New).
const STATUS_TABS = [
  { key: 'new', label: 'Active' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'reported', label: 'Reported' },
];

function statusKeyOf(item) {
  if (item.resolved) return 'resolved';
  return 'new';
}

function tab(active) {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    color: active ? 'var(--blue)' : 'var(--tx2)',
    background: active ? 'rgba(59,130,246,.14)' : 'var(--bg2)',
    border: `1px solid ${active ? 'rgba(59,130,246,.45)' : 'var(--bd)'}`,
  };
}

function statusOf(item) {
  if (item.resolved) return { label: 'Resolved', color: 'var(--ok)' };
  if (item?.report?.status) return { label: 'Reported', color: 'var(--crit)' };
  return { label: 'New', color: 'var(--crit)' };
}

function confidenceOf(item) {
  const apiPercentage = item?.ConfidenceScoreInPercentage
    ?? item?.confidenceScoreInPercentage;
  const rawConfidence = apiPercentage
    ?? item?.confidence
    ?? item?.accuracy
    ?? item?.score;

  if (rawConfidence == null || rawConfidence === '') return null;
  const hasPercentageSuffix = typeof rawConfidence === 'string' && rawConfidence.includes('%');
  const numericConfidence = Number(
    typeof rawConfidence === 'string' ? rawConfidence.replace('%', '').trim() : rawConfidence,
  );
  if (!Number.isFinite(numericConfidence)) return null;

  // The incidents API's named percentage field is already 0-100. Only older
  // generic confidence fields use a 0-1 ratio.
  const percentage = apiPercentage == null
    && !hasPercentageSuffix
    && numericConfidence >= 0
    && numericConfidence <= 1
    ? numericConfidence * 100
    : numericConfidence;
  return Math.min(100, Math.max(0, percentage));
}

function formatConfidence(item) {
  const confidence = confidenceOf(item);
  if (confidence == null) return '_';
  return `${Math.round(confidence * 10) / 10}%`;
}

function alertSeverityMeta(rawSeverity) {
  const raw = String(rawSeverity || '').toLowerCase();
  if (raw === 'critical') return { label: 'CRIT', color: 'var(--crit)', accent: 'var(--crit)', bg: 'transparent', border: 'var(--crit)', minWidth: 34 };
  if (raw === 'high') return { label: 'HIGH', color: 'var(--crit)', accent: 'var(--crit)', bg: 'transparent', border: 'var(--crit)', minWidth: 36 };
  if (raw === 'moderate' || raw === 'medium') return { label: 'MED', color: 'var(--warn)', accent: 'var(--warn)', bg: 'transparent', border: 'var(--warn)', minWidth: 32 };
  if (raw === 'low') return { label: 'LOW', color: 'var(--tx3)', accent: 'var(--tx3)', bg: 'transparent', border: 'var(--tx3)', minWidth: 32 };
  return { label: String(rawSeverity || 'INFO').toUpperCase(), color: 'var(--blue)', accent: 'var(--blue)', bg: 'transparent', border: 'var(--blue)', minWidth: 34 };
}

function incidentTypeCode(item) {
  const raw = item?.incidentCode || item?.eventCode || item?.code || item?.incidentType || item?.type || '';
  const label = detectionLabel(raw);
  const words = label.split(/\s+/).filter(Boolean);
  const code = words.length > 1 ? words.map((word) => word[0]).join('') : label.replace(/[^a-z0-9]/gi, '').slice(0, 4);
  return (code || 'EVT').toUpperCase().slice(0, 5);
}

function shortIncidentName(item) {
  const title = detectionLabel(item?.incidentType);
  if (/^ppe\s+compliant$/i.test(title)) return 'PPE';
  return title;
}

// Map certain incident types to colors that match severity levels used
// elsewhere in the app. Falls back to the incident's severity accent.
function typeAccentFor(item, sevMeta) {
  const title = (shortIncidentName(item) || detectionLabel(item?.incidentType || '') || '').toString().toLowerCase();
  const code = (incidentTypeCode(item) || '').toUpperCase();
  if (code === 'PPE' || title.includes('ppe')) return '#ff6b00';
  if (code === 'CD' || title.includes('crowd')) return 'var(--warn)';
  if (code === 'UA' || title.includes('unauthoriz')) return 'var(--crit)';
  // default: use the severity accent if present
  return (sevMeta && (sevMeta.accent || sevMeta.color)) || 'var(--blue)';
}

function incidentDescription(item) {
  return item?.description || item?.message || item?.alertDescription || item?.eventDescription || '';
}

function cameraNameOf(item) {
  return item?.channelData?.customName || item?.channelData?.name || item?.cameraName || item?.camera || item?.channelName || '';
}

function locationNameOf(item) {
  return item?.locationData?.locationName || item?.locationData?.name || item?.channelData?.location || item?.nvrData?.location || item?.location || '';
}

function alertDetailParts(item) {
  const parts = [];
  const camera = cameraNameOf(item);
  const location = locationNameOf(item);
  const confidence = confidenceOf(item);
  if (camera) parts.push(camera);
  if (location) parts.push(location);
  if (confidence != null) parts.push(`${Math.round(confidence * 10) / 10}% conf`);
  return parts;
}
function countsFromLoadedIncidents(items = [], totalCount = 0) {
  const counts = {
    severity: { all: Number(totalCount) || items.length, high: 0, moderate: 0, low: 0 },
    status: { all: Number(totalCount) || items.length, new: 0, resolved: 0, reported: 0 },
  };
  items.forEach((item) => {
    const sev = (item?.severity || '').toLowerCase();
    if (sev === 'high') counts.severity.high += 1;
    if (sev === 'moderate' || sev === 'medium') counts.severity.moderate += 1;
    if (sev === 'low') counts.severity.low += 1;
    const status = statusKeyOf(item);
    if (status === 'new') counts.status.new += 1;
    if (status === 'resolved') counts.status.resolved += 1;
    if (!item?.resolved && item?.report?.status) counts.status.reported += 1;
  });
  return counts;
}

function normalizeIncidentCounts(counts, totalCount = 0, fallbackItems = []) {
  const n = (value) => Number(value) || 0;
  if (!counts?.severity && !counts?.status) {
    return countsFromLoadedIncidents(fallbackItems, totalCount);
  }
  return {
    severity: {
      all: n(counts?.severity?.all ?? totalCount),
      high: n(counts?.severity?.high),
      moderate: n(counts?.severity?.moderate ?? counts?.severity?.medium),
      low: n(counts?.severity?.low),
    },
    status: {
      all: n(counts?.status?.all ?? totalCount),
      new: n(counts?.status?.new),
      resolved: n(counts?.status?.resolved),
      reported: n(counts?.status?.reported),
    },
  };
}
function btnStyle(variant) {
  const base = { fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '7px 18px', cursor: 'pointer', border: '1px solid transparent', transition: 'all .15s' };
  if (variant === 'primary') return { ...base, background: 'var(--blue)', color: '#fff', border: '1px solid var(--blue)' };
  return { ...base, background: 'var(--bg2)', color: 'var(--tx2)', border: '1px solid var(--bd)' };
}

/* â”€â”€ Report modal â€” same update-report-status flow used in Incident Center â”€â”€ */
function ReportModal({ item, onClose, onSuccess }) {
  const existing = item.report?.status && item.report?.description ? item.report : null;
  const [desc, setDesc]       = useState(existing?.description || '');
  const [editing, setEditing] = useState(!existing);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  async function submit() {
    if (!desc.trim()) { setErr('Please enter a description'); return; }
    setLoading(true); setErr('');
    try {
      const updated = await updateReportStatus({ incidentId: item._id || item.id, status: true, description: desc.trim() });
      toast.success('Reported');
      onSuccess?.(updated?.incident || updated?.data?.incident || updated);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.body?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: 16, boxSizing: 'border-box' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(420px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, padding: '24px', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>Report Incident</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {existing && !editing && (
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ok)', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 20, padding: '3px 10px' }}>
                âœ“ Reported
              </span>
            )}
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--bd)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx3)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {existing && !editing ? (
          <>
            <div style={{ background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 10, padding: '14px', marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ok)', marginBottom: 8 }}>Report Status: Completed</div>
              <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{existing.description}</div>
              {existing.reportedAt && (
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 10 }}>
                  Submitted on {new Date(existing.reportedAt).toLocaleString()}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnStyle('secondary')}>Close</button>
              <button onClick={() => setEditing(true)} style={btnStyle('primary')}>Edit Report</button>
            </div>
          </>
        ) : (
          <>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)', display: 'block', marginBottom: 7 }}>Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Describe the incident and actions taken..."
              rows={4}
              style={{
                width: '100%', boxSizing: 'border-box',
                borderRadius: 10, border: '1px solid var(--bd2)',
                background: 'var(--bg2)', color: 'var(--tx)',
                fontSize: 13, padding: '10px 12px',
                resize: 'vertical', outline: 'none',
                fontFamily: 'inherit', lineHeight: 1.55,
              }}
            />
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 5, marginBottom: 14 }}>
              Provide details about the incident and any actions taken.
            </div>
            {err && <div style={{ fontSize: 12, color: 'var(--crit)', marginBottom: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { if (editing && existing) { setEditing(false); setDesc(existing.description); } else onClose(); }}
                style={btnStyle('secondary')}
                disabled={loading}
              >
                {editing && existing ? 'Cancel' : 'Close'}
              </button>
              <button onClick={submit} style={btnStyle('primary')} disabled={loading || !desc.trim()}>
                {loading ? 'Reportingâ€¦' : 'Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AlertsView() {
  const ctx = useOutletContext() || {};
  const location = ctx.location || '';
  const routerLocation = useLocation();
  const navigate = useNavigate();
  // A KPI card elsewhere (Command Center's "Active Alerts" tile) can
  // deep-link here with an initial status filter via navigate(..., { state }).
  const initialStatusFilter = routerLocation.state?.statusFilter;
  // A notification click (Header's bell tray) deep-links here with a specific
  // incident id â€” fetched directly by id since it may not be in the general
  // feed's first page (older, or hidden by whatever tab/filter is active).
  const routedAlert = routerLocation.state?.alert || null;
  const initialAlertId = routerLocation.state?.alertId
    || new URLSearchParams(routerLocation.search).get('alertId')
    || incidentIdOf(routedAlert);
  const [sev, setSev] = useState('all');
  const [statusFilter, setStatusFilter] = useState(() => initialStatusFilter || 'all');
  const [selected, setSelected] = useState(routedAlert);
  const [deepLinkedIncident, setDeepLinkedIncident] = useState(routedAlert);
  const suppressAlertFetchRef = useRef('');
  const preserveInitialSelectionRef = useRef(Boolean(initialAlertId || routedAlert));

  useEffect(() => {
    if (routedAlert) {
      setDeepLinkedIncident(routedAlert);
      setSelected(routedAlert);
    }
    if (!initialAlertId) return undefined;
    if (suppressAlertFetchRef.current === String(initialAlertId)) {
      suppressAlertFetchRef.current = '';
      return undefined;
    }
    let cancelled = false;
    fetchIncidentById(initialAlertId)
      .then((incident) => {
        if (cancelled || !incident) return;
        setDeepLinkedIncident(incident);
        setSelected(incident);
      })
      .catch(() => {
        if (!cancelled && !routedAlert) toast.error('Could not load that alert');
      });
    return () => { cancelled = true; };
  }, [initialAlertId, routedAlert]);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filter = useMemo(() => {
    const f = {};
    if (location) f.location = location;
    if (dateFrom && dateTo) { f.startDate = dateFrom; f.endDate = dateTo; }
    return f;
  }, [location, dateFrom, dateTo]);

  const severityFilterValue = useCallback((value) => {
    if (value === 'high') return ['high', 'High', 'HIGH'];
    if (value === 'moderate') return ['moderate', 'medium', 'Moderate', 'Medium', 'MODERATE', 'MEDIUM'];
    if (value === 'low') return ['low', 'Low', 'LOW'];
    return value;
  }, []);

  // The table filter is server-side: clicking High/Medium/Low/Active/etc.
  // must search the full incident set, not only the first loaded page.
  const listFilter = useMemo(() => {
    const f = { ...filter };
    if (sev !== 'all') f.severity = severityFilterValue(sev);
    // The v2 API defaults missing statusFilter to unresolved/active only.
    // Alerts "All" should mean Active + Resolved, so send both explicitly.
    f.statusFilter = statusFilter === 'all' ? ALL_STATUS_FILTER : statusFilter;
    return f;
  }, [filter, sev, statusFilter, severityFilterValue]);

  const clearDate = useCallback(() => { setDateFrom(''); setDateTo(''); }, []);

  const hasFilters = sev !== 'all' || statusFilter !== 'all' || !!(dateFrom && dateTo);
  const clearAllFilters = useCallback(() => {
    setSev('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  }, []);

  const handleSelectAlert = useCallback((incident) => {
    setSelected(incident);
    const incidentId = incidentIdOf(incident);
    if (!incidentId || incidentId === String(initialAlertId || '')) return;

    // This row is already loaded, so only synchronize the address bar. The
    // deep-link fetch effect skips this ID and the old pinned row is released.
    suppressAlertFetchRef.current = incidentId;
    setDeepLinkedIncident(null);
    const params = new URLSearchParams(routerLocation.search);
    params.set('alertId', incidentId);
    navigate(
      { pathname: routerLocation.pathname, search: `?${params.toString()}` },
      { replace: true, state: null },
    );
  }, [initialAlertId, navigate, routerLocation.pathname, routerLocation.search]);

  // Manual pagination (not useApi) so pages can accumulate as the user
  // scrolls, instead of each fetch replacing the whole list.
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [countSummary, setCountSummary] = useState(() => normalizeIncidentCounts(null, 0));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const deepLinkedRowRef = useRef(null);
  const requestIdRef = useRef(0);
  const countsRequestIdRef = useRef(0);

  const hasMore = items.length < totalCount;
  // Polling only resumes once the user is back down to just the first page â€”
  // otherwise a background refresh would silently wipe out scrolled-in pages.
  const isFirstPageOnly = items.length <= PAGE_SIZE;

  const loadPage = useCallback(async (skip, { append }) => {
    const requestId = ++requestIdRef.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const result = await fetchIncidents({ skip, limit: PAGE_SIZE }, listFilter);
      if (requestId !== requestIdRef.current) return; // superseded by a newer request
      setItems((prev) => (append ? [...prev, ...result.items] : result.items));
      setTotalCount(result.totalCount);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(err);
    } finally {
      if (requestId === requestIdRef.current) {
        append ? setLoadingMore(false) : setLoading(false);
      }
    }
  }, [listFilter]);

  const loadCounts = useCallback(async () => {
    const requestId = ++countsRequestIdRef.current;
    try {
      const result = await fetchIncidents({ skip: 0, limit: 1 }, { ...filter, statusFilter: ALL_STATUS_FILTER });
      if (requestId !== countsRequestIdRef.current) return;

      // Backward-compatible fallback for a running backend that has not been
      // restarted with aggregate `counts` yet: ask the existing paginated API
      // for one row per chip filter and use only each response's totalCount.
      const [high, moderate, low, active, resolved, reported] = await Promise.all([
        fetchIncidents({ skip: 0, limit: 1 }, { ...filter, severity: severityFilterValue('high'), statusFilter: ALL_STATUS_FILTER }),
        fetchIncidents({ skip: 0, limit: 1 }, { ...filter, severity: severityFilterValue('moderate'), statusFilter: ALL_STATUS_FILTER }),
        fetchIncidents({ skip: 0, limit: 1 }, { ...filter, severity: severityFilterValue('low'), statusFilter: ALL_STATUS_FILTER }),
        fetchIncidents({ skip: 0, limit: 1 }, { ...filter, statusFilter: 'new' }),
        fetchIncidents({ skip: 0, limit: 1 }, { ...filter, statusFilter: 'resolved' }),
        fetchIncidents({ skip: 0, limit: 1 }, { ...filter, statusFilter: 'reported' }),
      ]);
      if (requestId !== countsRequestIdRef.current) return;
      setCountSummary({
        severity: {
          all: Number(result.counts?.severity?.all ?? result.totalCount) || 0,
          high: Number(result.counts?.severity?.high ?? high.totalCount) || 0,
          moderate: Number(result.counts?.severity?.moderate ?? result.counts?.severity?.medium ?? moderate.totalCount) || 0,
          low: Number(result.counts?.severity?.low ?? low.totalCount) || 0,
        },
        status: {
          all: Number(result.counts?.status?.all ?? result.totalCount) || 0,
          new: Number(result.counts?.status?.new ?? active.totalCount) || 0,
          resolved: Number(result.counts?.status?.resolved ?? resolved.totalCount) || 0,
          reported: Number(result.counts?.status?.reported ?? reported.totalCount) || 0,
        },
      });
    } catch {
      // Keep the current chip counts if the count requests fail.
    }
  }, [filter, severityFilterValue]);

  // Filter change (e.g. site switch or chip click) resets back to page 1.
  useEffect(() => {
    // Keep a routed alert selected while the normal first page loads. It may
    // be much older than PAGE_SIZE and is rendered separately below.
    if (!preserveInitialSelectionRef.current) setSelected(null);
    loadPage(0, { append: false });
  }, [loadPage]);

  // Chip counts stay based on the full site/date result set, independent of
  // which chip is currently selected and independent of pagination.
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Poll only while sitting on just the first page.
  useEffect(() => {
    if (!isFirstPageOnly) return;
    const id = setInterval(() => loadPage(0, { append: false }), POLL_MS);
    return () => clearInterval(id);
  }, [isFirstPageOnly, loadPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    loadPage(items.length, { append: true });
  }, [loading, loadingMore, hasMore, items.length, loadPage]);

  const handleScroll = useCallback((e) => {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) loadMore();
  }, [loadMore]);

  const refetch = useCallback(() => loadPage(0, { append: false }), [loadPage]);

  const rows = useMemo(() => {
    if (!deepLinkedIncident) return items;
    const deepLinkedId = incidentIdOf(deepLinkedIncident);
    return [
      deepLinkedIncident,
      ...items.filter((item) => incidentIdOf(item) !== deepLinkedId),
    ];
  }, [items, deepLinkedIncident]);

  // The deep-linked row is deliberately prepended, so bring the internal
  // table scroller back to its top after the incident has loaded.
  useEffect(() => {
    if (!deepLinkedIncident || loading) return undefined;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      deepLinkedRowRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [deepLinkedIncident, loading]);

  // Per-tab counts come from the backend aggregate for the full filtered result
  // set, not from the currently loaded pagination page.
  const sevCounts = countSummary.severity;
  const statusCounts = countSummary.status;

  const active = selected || rows[0] || null;
  const activeId = incidentIdOf(active);
  const activeResolved = !!active?.resolved;
  const activeReported = !!active?.report?.status;
  const activeStatus = active ? statusOf(active) : null;
  const activeConfidence = active ? formatConfidence(active) : '_';
  const canReportActive = !!activeId && !activeResolved && !activeReported;
  const activeImageUrl = active?.Image ? mediaUrl(active.Image) : '';
  const activeSeverityMeta = active ? alertSeverityMeta(active.severity) : null;
  const activeTypeLabel = active ? shortIncidentName(active) : '';
  const activeDescription = incidentDescription(active) || active?.incidentName || detectionLabel(active?.incidentType);
  const activeCameraName = cameraNameOf(active) || active?.channelData?.name || '_';
  const activeLocationName = locationNameOf(active);
  const activeCameraLine = [activeCameraName, activeLocationName].filter(Boolean).join(' - ') || '_';

  async function exportActiveClipImage() {
    if (!activeImageUrl) {
      toast.error('No alert snapshot available to export.');
      return;
    }
    const filename = exportClipFilename(active);
    try {
      const response = await fetch(activeImageUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = document.createElement('a');
      link.href = activeImageUrl;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  async function resolveActive() {
    if (!activeId || activeResolved) return;
    setBusy(true);
    try {
      await updateIncidentResolved({ incidentId: activeId, incidentType: active?.incidentType, resolved: true });
      const markResolved = (incident) => {
        if (incidentIdOf(incident) !== activeId) return incident;
        return { ...incident, resolved: true, report: { ...(incident.report || {}), status: false, description: "", resolvedAt: new Date().toISOString(), reportedAt: null } };
      };
      setItems((prev) => prev.map(markResolved));
      setSelected((prev) => markResolved(prev));
      setDeepLinkedIncident((prev) => markResolved(prev));
      toast.success('Resolved');
      refetch();
      loadCounts();
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Could not resolve');
    } finally {
      setBusy(false);
    }
  }

  const handleReportSuccess = useCallback((updatedIncident) => {
    const updatedReport = updatedIncident?.report || {};
    const idToUpdate = incidentIdOf(updatedIncident) || activeId;
    const markReported = (incident) => {
      if (!incident || incidentIdOf(incident) !== idToUpdate) return incident;
      return {
        ...incident,
        report: {
          ...(incident.report || {}),
          ...updatedReport,
          status: true,
        },
      };
    };
    setItems((prev) => prev.map(markReported));
    setSelected((prev) => markReported(prev));
    setDeepLinkedIncident((prev) => markReported(prev));
    refetch();
    loadCounts();
  }, [activeId, refetch, loadCounts]);

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @media (max-width: 1100px) {
          .vq-alerts-grid { grid-template-columns: 1fr !important; }
          .vq-alerts-detail { position: static !important; }
        }
        @media (max-width: 640px) {
          .vq-alerts-row-head { grid-template-columns: 42px 1fr 72px !important; }
          .vq-alerts-row-head .vq-alerts-col-status { display: none !important; }
          .vq-alerts-row { grid-template-columns: 42px 1fr 72px !important; }
          .vq-alerts-row .vq-alerts-col-status { display: none !important; }
        }
        @media (max-width: 420px) {
          .vq-alerts-row-head { grid-template-columns: 38px 1fr 60px !important; }
          .vq-alerts-row { grid-template-columns: 38px 1fr 60px !important; }
        }
      `}</style>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map((t) => <div key={t.key} onClick={() => setSev(t.key)} style={tab(sev === t.key)}>{t.label} ({sevCounts[t.key]})</div>)}
        <div style={{ width: 1, height: 20, background: 'var(--bd2)' }} />
        {STATUS_TABS.map((t) => <div key={t.key} onClick={() => setStatusFilter(t.key)} style={tab(statusFilter === t.key)}>{t.label} ({statusCounts[t.key]})</div>)}
        <div style={{ width: 1, height: 20, background: 'var(--bd2)' }} />
        <DateRangePicker from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} onClear={clearDate} />
        {hasFilters && (
          <button onClick={clearAllFilters} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--crit)', border: '1px solid var(--crit)', borderRadius: 7, cursor: 'pointer', padding: '5px 10px' }}>
            <X size={13} /> Clear
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx3)' }}>
          {sev === 'all' && statusFilter === 'all' ? `${items.length} of ${totalCount} events` : `${rows.length} events`}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 16, minWidth: 0 }} className="vq-cc-grid vq-alerts-grid">
        {/* Table */}
        <Panel style={{ overflow: 'hidden', minWidth: 0 }}>
          <div className="vq-alerts-row-head" style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 110px 100px', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--bd)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>
            <span>SEV</span><span>EVENT</span><span>TIME</span><span className="vq-alerts-col-status">STATUS</span>
          </div>
          <AsyncBoundary loading={loading} error={error} isEmpty={!loading && !error && rows.length === 0} onRetry={refetch} minH={300} emptyLabel="No alerts">
            {() => (
              <div ref={listRef} onScroll={handleScroll} className="vq-scroll" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
                {rows.map((it, index) => {
                  const s = severity(it.severity);
                  const sevMeta = alertSeverityMeta(it.severity);
                  const st = statusOf(it);
                  const eventTitle = shortIncidentName(it) || detectionLabel(it?.incidentType);
                  const typeCode = incidentTypeCode(it);
                  // Remove a leading type code from the full title (e.g. "PPE PPE compliance...")
                  let rawTitle = String(eventTitle || '').trim();
                  if (typeCode && new RegExp('^' + typeCode + '\\b', 'i').test(rawTitle)) {
                    rawTitle = rawTitle.replace(new RegExp('^' + typeCode + '\\b\s*-?\s*', 'i'), '');
                  }
                  // Truncate long titles for the list view but keep the full title on hover
                  const displayTitle = rawTitle.length > 42 ? rawTitle.slice(0, 42).trim() + '…' : rawTitle;
                  // Hide the title when it's essentially the same as the incident type label
                  const typeLabel = detectionLabel(it?.incidentType || it?.incidentCode || it?.eventCode || it?.code || it?.type || '');
                  const norm = (s = '') => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
                  const displayNorm = norm(displayTitle);
                  const typeNorm = norm(typeLabel) || norm(typeCode);
                  const hideDuplicateTitle = !displayTitle || (typeNorm && (displayNorm === typeNorm || displayNorm.startsWith(typeNorm) || displayNorm.includes(typeNorm)));
                  const typeColor = typeAccentFor(it, sevMeta);
                  const eventDescription = incidentDescription(it);
                  const detailParts = alertDetailParts(it);
                  const rowId = incidentIdOf(it);
                  const isSel = !!activeId && activeId === rowId;
                  const isDeepLinked = !!rowId && rowId === incidentIdOf(deepLinkedIncident);
                  return (
                    <div
                      key={rowId || index}
                      ref={isDeepLinked ? deepLinkedRowRef : undefined}
                      onClick={() => handleSelectAlert(it)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelectAlert(it);
                        }
                      }}
                      role="button"
                      tabIndex={isSel ? 0 : -1}
                      aria-current={isSel ? 'true' : undefined}
                      className="vq-alerts-row"
                      style={{
                        display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 110px 100px', gap: 8,
                        alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(148,163,184,.16)',
                        cursor: 'pointer', outline: 'none',
                        background: isSel ? 'rgba(59,130,246,.13)' : 'transparent',
                        boxShadow: isSel
                          ? 'inset 3px 0 var(--blue)'
                          : 'none',
                        transition: 'background .18s, box-shadow .18s',
                      }}
                    >
                      <span style={{ justifySelf: 'start', minWidth: sevMeta.minWidth, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 700, lineHeight: 1, color: sevMeta.color, background: sevMeta.bg, border: '1px solid ' + sevMeta.border, borderRadius: 4, padding: '3px 5px' }}>{sevMeta.label}</span>
                      <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 8, rowGap: 3, alignItems: 'start' }}>
                        <span style={{
                          fontFamily: 'var(--disp)',
                          fontSize: 11,
                          fontWeight: 800,
                          lineHeight: 1.35,
                          letterSpacing: '.04em',
                          color: typeColor,
                          whiteSpace: 'nowrap',
                        }}>{typeCode}</span>
                        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {!hideDuplicateTitle && (
                            <span title={eventTitle} style={{ fontFamily: 'var(--disp)', fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '0 1 auto' }}>{displayTitle}</span>
                          )}
                        {eventDescription && <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{eventDescription}</span>}
                        </div>
                        {detailParts.length > 0 && <div style={{ gridColumn: '1 / -1', fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detailParts.join(' - ')}</div>}
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{timeAgo(it.timeOfIncident)}</span>
                      <span className="vq-alerts-col-status" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: st.color, fontWeight: 600, minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, flex: '0 0 auto' }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.label}</span>
                      </span>
                    </div>
                  );
                })}
                {loadingMore && <Loading label="Loading moreâ€¦" minH={60} />}
              </div>
            )}
          </AsyncBoundary>
        </Panel>

        {/* Detail */}
        <Panel className="vq-alerts-detail" style={{ overflow: 'hidden', alignSelf: 'flex-start', position: 'sticky', top: 0, minWidth: 0, padding: 10 }}>
          {!active ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>Select an alert to inspect</div>
          ) : (
            <>
              <div style={{ position: 'relative', aspectRatio: '16/9', background: '#0a0e15', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--bd)' }}>
                {active.Image ? (
                  <img src={mediaUrl(active.Image)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 11.5 }}>No snapshot</div>
                )}
                <span style={{ position: 'absolute', top: 10, left: 10, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 800, color: '#fff', background: 'rgba(7,10,18,.72)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 5, padding: '4px 7px', letterSpacing: '.04em' }}>
                  {activeCameraName}
                </span>
                <span style={{ position: 'absolute', top: 10, right: 10, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 800, color: activeSeverityMeta.color, background: 'rgba(7,10,18,.72)', border: `1px solid ${activeSeverityMeta.border}`, borderRadius: 5, padding: '4px 8px', letterSpacing: '.06em' }}>
                  {activeSeverityMeta.label === 'CRIT' ? 'CRITICAL' : activeSeverityMeta.label}
                </span>
              </div>
              <div style={{ padding: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <Badge color="#ff6b00" style={{ fontSize: 10, padding: '4px 8px', borderRadius: 5 }}>{activeTypeLabel}</Badge>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{shortDateTime(active.timeOfIncident)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: 'var(--tx)', wordBreak: 'break-word' }}>{activeDescription}</div>
                <div style={{ fontSize: 12, color: 'var(--tx2)', wordBreak: 'break-word' }}>{activeCameraLine}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 1 }}>
                  <div style={{ minWidth: 0, padding: '9px 11px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
                    <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>Confidence</div>
                    <div style={{ fontSize: 16, lineHeight: 1.1, fontWeight: 800, color: confidenceOf(active) == null ? 'var(--tx3)' : '#ff6b00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      { activeConfidence}
                    </div>
                  </div>
                  <div style={{ minWidth: 0, padding: '9px 11px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
                    <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 4 }}>Status</div>
                    <div style={{ fontSize: 14, lineHeight: 1.15, fontWeight: 800, color: activeStatus.color, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeStatus.label}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 2 }}>
                  <div onClick={busy || activeResolved ? undefined : resolveActive} aria-disabled={busy || activeResolved} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: activeResolved ? 'var(--tx3)' : '#fff', background: activeResolved ? 'var(--bg2)' : 'linear-gradient(135deg,var(--blue),var(--violet))', border: activeResolved ? '1px solid var(--bd)' : '1px solid transparent', borderRadius: 8, padding: '10px 10px', cursor: busy ? 'wait' : activeResolved ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                    {busy ? '…' : activeResolved ? 'Resolved' : 'Resolve'}
                  </div>
                  <div onClick={canReportActive ? () => setReportOpen(true) : undefined} aria-disabled={!canReportActive} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: canReportActive ? 'var(--crit)' : 'var(--tx3)', background: canReportActive ? 'transparent' : 'var(--bg2)', border: canReportActive ? '1px solid rgba(255,77,77,.45)' : '1px solid var(--bd)', borderRadius: 8, padding: '10px 10px', cursor: canReportActive ? 'pointer' : 'not-allowed' }}>
                    {activeReported ? 'Reported' : 'Report'}
                  </div>
                </div>
                <div onClick={activeImageUrl ? exportActiveClipImage : undefined} aria-disabled={!activeImageUrl} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: activeImageUrl ? 'var(--tx2)' : 'var(--tx3)', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 12px', cursor: activeImageUrl ? 'pointer' : 'not-allowed' }}>
                  Export clip{active.videoLink ? ' - view full timeline' : ''}
                </div>
                {false && active.videoLink && (
                  <a href={active.videoLink} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--blue)', textAlign: 'center', textDecoration: 'none' }}>
                    Export clip Â· view full timeline â†’
                  </a>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>

      {reportOpen && active && (
        <ReportModal
          item={active}
          onClose={() => setReportOpen(false)}
          onSuccess={handleReportSuccess}
        />
      )}
    </div>
  );
}


















