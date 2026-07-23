import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Panel, Badge } from '../../../components/primitives';
import { AsyncBoundary, Loading } from '../../../components/States';
import DateRangePicker from '../../../components/DateRangePicker';
import { severity, detectionLabel, shortDateTime, timeAgo, mediaUrl } from '../../../lib/format';
import { fetchIncidents, fetchIncidentById, updateReportStatus } from '../../../helpers/incidents';

const PAGE_SIZE = 50;
// Auto-refresh only while the user is looking at just the first page — once
// they've scrolled to load more, a silent 30s poll would reset/shrink the
// list out from under them, so polling pauses until they're back on page 1.
const POLL_MS = 30000;

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High' },
  { key: 'moderate', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

// Client-side status filter — the same New/Acknowledged/Resolved states
// statusOf() already derives per row, just relabeled here ("Active" = New).
const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'Active' },
  { key: 'acknowledged', label: 'Acknowledged' },
];

function statusKeyOf(item) {
  if (item.resolved) return 'resolved';
  if (item.report?.status === true) return 'acknowledged';
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
  if (item.report?.status === true) return { label: 'Acknowledged', color: 'var(--blue)' };
  return { label: 'New', color: 'var(--warn)' };
}
function normalizeIncidentCounts(counts, totalCount = 0) {
  const n = (value) => Number(value) || 0;
  return {
    severity: {
      all: n(counts?.severity?.all ?? totalCount),
      high: n(counts?.severity?.high),
      moderate: n(counts?.severity?.moderate),
      low: n(counts?.severity?.low),
    },
    status: {
      all: n(counts?.status?.all ?? totalCount),
      new: n(counts?.status?.new),
      acknowledged: n(counts?.status?.acknowledged),
    },
  };
}
function btnStyle(variant) {
  const base = { fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '7px 18px', cursor: 'pointer', border: '1px solid transparent', transition: 'all .15s' };
  if (variant === 'primary') return { ...base, background: 'var(--blue)', color: '#fff', border: '1px solid var(--blue)' };
  return { ...base, background: 'var(--bg2)', color: 'var(--tx2)', border: '1px solid var(--bd)' };
}

/* ── Report modal — same update-report-status flow used in Incident Center ── */
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
      await updateReportStatus({ incidentId: item._id || item.id, status: true, description: desc.trim() });
      toast.success('Reported');
      onSuccess?.();
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
                ✓ Reported
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
                {loading ? 'Reporting…' : 'Report'}
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
  // A KPI card elsewhere (Command Center's "Active Alerts" tile) can
  // deep-link here with an initial status filter via navigate(..., { state }).
  const initialStatusFilter = routerLocation.state?.statusFilter;
  // A notification click (Header's bell tray) deep-links here with a specific
  // incident id — fetched directly by id since it may not be in the general
  // feed's first page (older, or hidden by whatever tab/filter is active).
  const initialAlertId = routerLocation.state?.alertId;
  const [sev, setSev] = useState('all');
  const [statusFilter, setStatusFilter] = useState(() => initialStatusFilter || 'all');
  const [selected, setSelected] = useState(null);
  const [deepLinkedIncident, setDeepLinkedIncident] = useState(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState(() => new Set());

  useEffect(() => {
    if (!initialAlertId) return;
    let cancelled = false;
    fetchIncidentById(initialAlertId)
      .then((incident) => {
        if (cancelled || !incident) return;
        setDeepLinkedIncident(incident);
        setSelected(incident);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load that alert');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAlertId]);
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

  // The table filter is server-side: clicking High/Medium/Low/Active/etc.
  // must search the full incident set, not only the first loaded page.
  const listFilter = useMemo(() => {
    const f = { ...filter };
    if (sev !== 'all') f.severity = sev;
    if (statusFilter !== 'all') f.statusFilter = statusFilter;
    return f;
  }, [filter, sev, statusFilter]);

  const clearDate = useCallback(() => { setDateFrom(''); setDateTo(''); }, []);

  const hasFilters = sev !== 'all' || statusFilter !== 'all' || !!(dateFrom && dateTo);
  const clearAllFilters = useCallback(() => {
    setSev('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  }, []);

  // Manual pagination (not useApi) so pages can accumulate as the user
  // scrolls, instead of each fetch replacing the whole list.
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [countSummary, setCountSummary] = useState(() => normalizeIncidentCounts(null, 0));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const requestIdRef = useRef(0);
  const countsRequestIdRef = useRef(0);

  const hasMore = items.length < totalCount;
  // Polling only resumes once the user is back down to just the first page —
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
      const result = await fetchIncidents({ skip: 0, limit: 1 }, filter);
      if (requestId !== countsRequestIdRef.current) return;
      setCountSummary(normalizeIncidentCounts(result.counts, result.totalCount));
    } catch {
      if (requestId === countsRequestIdRef.current) {
        setCountSummary(normalizeIncidentCounts(null, 0));
      }
    }
  }, [filter]);

  // Filter change (e.g. site switch or chip click) resets back to page 1.
  useEffect(() => {
    setSelected(null);
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

  const rows = items;

  // Per-tab counts come from the backend aggregate for the full filtered result
  // set, not from the currently loaded pagination page.
  const sevCounts = countSummary.severity;
  const statusCounts = countSummary.status;

  const active = selected || rows[0] || null;
  const activeId = active?._id || active?.id;
  const activeAcknowledged = !!active?.report?.status || (activeId ? acknowledgedIds.has(activeId) : false);

  async function acknowledge() {
    if (!activeId || activeAcknowledged) return;
    setBusy(true);
    try {
      await updateReportStatus({ incidentId: activeId, status: true, description: '' });
      const markAcknowledged = (incident) => {
        const id = incident?._id || incident?.id;
        if (id !== activeId) return incident;
        return { ...incident, report: { ...(incident.report || {}), status: true } };
      };
      setAcknowledgedIds((prev) => {
        const next = new Set(prev);
        next.add(activeId);
        return next;
      });
      setItems((prev) => prev.map(markAcknowledged));
      setSelected((prev) => markAcknowledged(prev));
      setDeepLinkedIncident((prev) => markAcknowledged(prev));
      toast.success('Acknowledged');
      refetch();
    } catch {
      toast.error('Could not acknowledge');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @media (max-width: 1100px) {
          .vq-alerts-grid { grid-template-columns: 1fr !important; }
          .vq-alerts-detail { position: static !important; }
        }
        @media (max-width: 640px) {
          .vq-alerts-row-head { grid-template-columns: 46px 1fr 72px !important; }
          .vq-alerts-row-head .vq-alerts-col-status { display: none !important; }
          .vq-alerts-row { grid-template-columns: 46px 1fr 72px !important; }
          .vq-alerts-row .vq-alerts-col-status { display: none !important; }
        }
        @media (max-width: 420px) {
          .vq-alerts-row-head { grid-template-columns: 40px 1fr 60px !important; }
          .vq-alerts-row { grid-template-columns: 40px 1fr 60px !important; }
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, minWidth: 0 }} className="vq-cc-grid vq-alerts-grid">
        {/* Table */}
        <Panel style={{ overflow: 'hidden', minWidth: 0 }}>
          <div className="vq-alerts-row-head" style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 110px', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--bd)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>
            <span>SEVERITY</span><span>EVENT</span><span>TIME</span><span className="vq-alerts-col-status">STATUS</span>
          </div>
          <AsyncBoundary loading={loading} error={error} isEmpty={!loading && !error && rows.length === 0} onRetry={refetch} minH={300} emptyLabel="No alerts">
            {() => (
              <div ref={listRef} onScroll={handleScroll} className="vq-scroll" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
                {rows.map((it) => {
                  const s = severity(it.severity);
                  const st = statusOf(it);
                  const isSel = active && active._id === it._id;
                  return (
                    <div
                      key={it._id}
                      onClick={() => setSelected(it)}
                      className="vq-alerts-row"
                      style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 110px', gap: 8, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--bd)', cursor: 'pointer', background: isSel ? 'var(--bg2)' : 'transparent' }}
                    >
                      <Badge color={s.color}>{s.short}</Badge>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.incidentName || detectionLabel(it.incidentType)}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[it.channelData?.name, it.nvrData?.nvrName].filter(Boolean).join(' · ')}</div>
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{timeAgo(it.timeOfIncident)}</span>
                      <span className="vq-alerts-col-status" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: st.color, fontWeight: 600, minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, flex: '0 0 auto' }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.label}</span>
                      </span>
                    </div>
                  );
                })}
                {loadingMore && <Loading label="Loading more…" minH={60} />}
              </div>
            )}
          </AsyncBoundary>
        </Panel>

        {/* Detail */}
        <Panel className="vq-alerts-detail" style={{ overflow: 'hidden', alignSelf: 'flex-start', position: 'sticky', top: 0, minWidth: 0 }}>
          {!active ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>Select an alert to inspect</div>
          ) : (
            <>
              <div style={{ position: 'relative', aspectRatio: '16/9', background: '#0a0e15' }}>
                {active.Image ? (
                  <img src={mediaUrl(active.Image)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 11.5 }}>No snapshot</div>
                )}
              </div>
              <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge color={severity(active.severity).color} solid>{detectionLabel(active.incidentType)}</Badge>
                  <Badge color={severity(active.severity).color}>{severity(active.severity).short}</Badge>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{shortDateTime(active.timeOfIncident)}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}>{active.incidentName || detectionLabel(active.incidentType)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', wordBreak: 'break-word' }}>{[active.channelData?.name, active.nvrData?.nvrName, active.location].filter(Boolean).join(' · ')}</div>
                {active.description && <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4, wordBreak: 'break-word' }}>{active.description}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <div onClick={busy || activeAcknowledged ? undefined : acknowledge} aria-disabled={busy || activeAcknowledged} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: activeAcknowledged ? 'var(--tx3)' : '#fff', background: activeAcknowledged ? 'var(--bg2)' : 'linear-gradient(135deg,var(--blue),var(--violet))', border: activeAcknowledged ? '1px solid var(--bd)' : '1px solid transparent', borderRadius: 8, padding: 9, cursor: busy ? 'wait' : activeAcknowledged ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                    {busy ? '…' : activeAcknowledged ? 'Acknowledged' : 'Acknowledge'}
                  </div>
                  <div onClick={() => setReportOpen(true)} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--crit)', border: '1px solid rgba(255,77,77,.4)', borderRadius: 8, padding: 9, cursor: 'pointer' }}>
                    {active.report?.status ? 'Reported' : 'Report'}
                  </div>
                </div>
                {active.videoLink && (
                  <a href={active.videoLink} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--blue)', textAlign: 'center', textDecoration: 'none' }}>
                    Export clip · view full timeline →
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
          onSuccess={refetch}
        />
      )}
    </div>
  );
}



