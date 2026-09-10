import { useEffect, useMemo, useState } from 'react';
import moment from 'moment';
import { Search, List, Grid2x2, Download, X, Loader2, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { DOWNLOADS, STATUS_META, devColor } from '../data';
import { exportMeasurementRecords } from '../export';
import { getMeasurementRecords } from '../api';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';

// snap | order·ref | sku·model | printed | measured | Δ | conf | match | station | when·result
// Every column is a fixed width so nothing stretches into a mid-table gap; the
// MATCH bar takes any surplus on wide viewports (1fr), keeping slack at the
// right edge. Widen ORDER·REF / SKU·MODEL to use the freed space.
const GRID_COLS =
  '52px minmax(200px,1.15fr) minmax(184px,1.05fr) 112px 118px 118px 56px 150px 92px 122px';
const GRID_MIN_W = 1180;

// DS measurement confidence → colour + label. Anything under 0.6 is unreliable
// and the printed/measured comparison should not be trusted without the photo.
const confMeta = (c) => {
  if (c == null) return { color: 'var(--tx3)', label: '—' };
  if (c >= 0.8) return { color: 'var(--ok)', label: c.toFixed(2) };
  if (c >= 0.6) return { color: 'var(--warn)', label: c.toFixed(2) };
  return { color: 'var(--crit)', label: c.toFixed(2) };
};

// MATCH = how well the measured size matches the label, 0–100%.
//   100%  → measured lands exactly on the label
//    50%  → worst axis is half its tolerance off
//     0%  → worst axis is at or beyond tolerance  (→ Mismatch)
// It's the worst axis that counts: matchPct = 100 − devFrac × 100, floored at 0.
const matchPctOf = (r) => {
  if (!Number.isFinite(r.devFrac)) return null;
  return Math.max(0, Math.round(100 - r.devFrac * 100));
};

const matchLabel = (r) => {
  if (r.devPct === 'QR unread') return 'QR unread';
  const pct = matchPctOf(r);
  return pct == null ? r.devPct : `${pct}% match`;
};

// Status filter pill — `accent` is a theme-token colour for the active state.
const StatusPill = ({ active, accent = 'var(--blue)', onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={active ? { background: accent, borderColor: accent } : undefined}
    className={`inline-flex items-center text-[11.5px] font-semibold px-[12px] h-[32px] rounded-[8px] cursor-pointer border transition-colors select-none ${
      active
        ? 'text-white'
        : 'bg-[var(--bg2)] text-[var(--tx2)] border-[var(--bd)] hover:text-[var(--tx)]'
    }`}
  >
    {children}
  </button>
);

// MATCH cell — a bar showing the match % with the "NN% match" label beside it.
//  • ≥ 70% match  → green
//  • 30–70%       → amber (drifting toward the tolerance edge)
//  • < 30%        → red
//  •  0%          → out of tolerance (Mismatch)
const matchColor = (pct) =>
  pct >= 70 ? 'var(--ok)' : pct >= 30 ? 'var(--warn)' : 'var(--crit)';

// What the MATCH %, bar length and colour mean — shown on hovering the bar.
const MATCH_LEGEND = [
  { when: 'measured ≈ label', label: '90–100% match', dot: 'var(--ok)', bar: 'green, near-full bar' },
  { when: 'half the tolerance off', label: '~50% match', dot: 'var(--warn)', bar: 'amber, half bar' },
  { when: 'at / past tolerance', label: '0% match', dot: 'var(--crit)', bar: 'red, empty bar → Mismatch' },
  { when: 'QR unread', label: 'QR unread', dot: 'var(--tx3)', bar: 'grey, empty bar' },
];

const MatchLegendPopover = ({ anchor }) => {
  if (!anchor) return null;
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 190);
  const left = Math.min(anchor.left, window.innerWidth - 312);
  return (
    <div
      className="fixed z-[80] w-[300px] p-[11px_13px] rounded-[10px] bg-[var(--bg1solid)] border border-[var(--bd2)] shadow-2xl pointer-events-none"
      style={{ top, left }}
    >
      <div className="text-[10.5px] font-semibold text-[var(--tx)]">Match to label</div>
      <div className="text-[9.5px] text-[var(--tx3)] mt-[2px] mb-[8px] leading-[1.4]">
        100% = measured lands on the label · 0% = worst axis is at or beyond its tolerance
      </div>
      {MATCH_LEGEND.map((m) => (
        <div key={m.when} className="flex items-center gap-[7px] py-[3px]">
          <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: m.dot }} />
          <span className="text-[10px] text-[var(--tx2)] flex-1 min-w-0">
            {m.when}
            <span className="block text-[8.5px] text-[var(--tx3)]">{m.bar}</span>
          </span>
          <span
            className="font-[var(--mono)] text-[9.5px] font-semibold shrink-0"
            style={{ color: m.dot }}
          >
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
};

const MatchCell = ({ r }) => {
  const unread = r.devPct === 'QR unread';
  const pct = matchPctOf(r) ?? 0;
  const color = matchColor(pct);
  const [anchor, setAnchor] = useState(null);
  return (
    <span className="flex items-center gap-[8px] min-w-0">
      <span
        className="w-[70px] shrink-0 h-[6px] rounded-[3px] bg-[var(--track)] overflow-hidden block cursor-help"
        onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setAnchor(null)}
      >
        {!unread && (
          <span
            className="block h-full rounded-[3px] transition-[width]"
            style={{ width: `${Math.max(pct, 3)}%`, background: color }}
          />
        )}
      </span>
      <span
        className="font-[var(--mono)] text-[9.5px] whitespace-nowrap shrink-0"
        style={{ color: unread ? 'var(--tx3)' : color }}
      >
        {matchLabel(r)}
      </span>
      {anchor && <MatchLegendPopover anchor={anchor} />}
    </span>
  );
};

// SNAP thumbnail with a graceful fallback: a muted "no image" tile when the
// row has no snapshot URL, or when the URL fails to load (404 / expired).
const NoImageTile = ({ size = 'sm' }) => (
  <span
    className={`${
      size === 'lg' ? 'w-full h-full' : 'w-[44px] h-[30px]'
    } shrink-0 rounded-[6px] bg-[var(--bg2)] border border-[var(--bd)] flex flex-col items-center justify-center gap-[2px] text-[var(--tx3)]`}
    title="No snapshot"
  >
    <ImageOff size={size === 'lg' ? 22 : 13} strokeWidth={1.6} />
    {size === 'lg' && <span className="font-[var(--mono)] text-[9px]">No snapshot</span>}
  </span>
);

const SnapThumb = ({ src, onOpen }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <NoImageTile />;
  return (
    <button
      type="button"
      onClick={onOpen}
      title="View snapshot"
      className="w-[44px] h-[30px] shrink-0 rounded-[6px] overflow-hidden bg-[var(--bg2)] block cursor-pointer border-0 p-0 transition-opacity hover:opacity-80"
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
    </button>
  );
};

// Large snapshot for the grid card — same fallback, fills its container.
const SnapImage = ({ src }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4px] text-[var(--tx3)]">
        <ImageOff size={24} strokeWidth={1.5} />
        <span className="font-[var(--mono)] text-[10px]">No snapshot</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="absolute inset-0 w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
};

const DevTriple = ({ r }) => (
  <span className="flex gap-[6px] font-[var(--mono)] text-[11px] font-semibold whitespace-nowrap">
    <span style={{ color: devColor(r.devL) }}>{r.devL}</span>
    <span className="text-[var(--tx3)]">/</span>
    <span style={{ color: devColor(r.devB) }}>{r.devB}</span>
    <span className="text-[var(--tx3)]">/</span>
    <span style={{ color: devColor(r.devH) }}>{r.devH}</span>
  </span>
);

const DL_KEY = { PDF: 'pdf', XLSX: 'xlsx', CSV: 'csv' };

// Gradient fill + soft glow per format — same treatment as the Live Demo
// "All · Excel / All · PDF" buttons.
const DL_STYLE = {
  PDF: {
    background: 'linear-gradient(135deg,#ff7a7a,#ff4d4d)',
    boxShadow: '0 6px 16px rgba(255,77,77,0.3)',
  },
  XLSX: {
    background: 'linear-gradient(135deg,#34d399,#22c55e)',
    boxShadow: '0 6px 16px rgba(34,197,94,0.3)',
  },
  CSV: {
    background: 'linear-gradient(135deg,#67e8f9,#22d3ee)',
    boxShadow: '0 6px 16px rgba(34,211,238,0.3)',
  },
};

// Turn the global { from, to } (YYYY-MM-DD) range into inclusive ISO bounds
// for the /measurement-logs query.
const toIsoWindow = ({ from, to } = {}) => {
  const params = {};
  if (from) params.fromDate = moment(from, 'YYYY-MM-DD').startOf('day').toISOString();
  if (to) params.toDate = moment(to, 'YYYY-MM-DD').endOf('day').toISOString();
  return params;
};

const PAGE_SIZES = [12, 25, 50, 100];

const MeasurementRecords = ({ onRowsChange, dateRange }) => {
  const [statusF, setStatusF] = useState('all');
  const [skuF, setSkuF] = useState('all');
  const [stationF, setStationF] = useState('all');
  const [q, setQ] = useState('');
  // Debounced copy of `q` — the actual value sent to the API.
  const [qDebounced, setQDebounced] = useState('');
  const [view, setView] = useState('list');
  // Index into the CURRENT PAGE of the record whose snapshot is open.
  const [previewIdx, setPreviewIdx] = useState(-1);

  // Pagination (client-side over the already-filtered result set).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [goto, setGoto] = useState('');

  // Server-filtered records from /measurement-logs.
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // SKU / station option lists — captured from the first successful response
  // and kept stable so narrowing a filter never empties its own dropdown.
  const [skuList, setSkuList] = useState([]);
  const [stationList, setStationList] = useState([]);

  const fromDate = dateRange?.from || null;
  const toDate = dateRange?.to || null;

  // Debounce the free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = {
      limit: 1000,
      ...toIsoWindow({ from: fromDate, to: toDate }),
    };
    if (statusF !== 'all') params.status = statusF;
    if (skuF !== 'all') params.sku = skuF;
    if (stationF !== 'all') params.station = stationF;
    if (qDebounced) params.q = qDebounced;

    getMeasurementRecords(params)
      .then(({ rows, skus, stations }) => {
        if (cancelled) return;
        setRecords(rows);
        setError('');
        // Only seed the option lists from an unfiltered-ish response so a
        // narrow filter can't shrink the choices permanently.
        if (skus?.length) setSkuList((prev) => (skus.length >= prev.length ? skus : prev));
        if (stations?.length)
          setStationList((prev) => (stations.length >= prev.length ? stations : prev));
      })
      .catch((e) => {
        if (!cancelled) {
          setRecords([]);
          setError(e?.message || 'Failed to load records');
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, statusF, skuF, stationF, qDebounced]);

  const skuOptions = useMemo(() => {
    const base = skuList.length
      ? skuList
      : [...new Set(records.map((r) => r.sku).filter((s) => s && s !== '—'))].sort();
    return ['all', ...base];
  }, [skuList, records]);
  const stationOptions = useMemo(() => {
    const base = stationList.length
      ? stationList
      : [...new Set(records.map((r) => r.station).filter((s) => s && s !== '—'))].sort();
    return ['all', ...base];
  }, [stationList, records]);

  // The server already applied every filter — the table renders rows as-is.
  const filtered = records;

  const filterActive = statusF !== 'all' || skuF !== 'all' || stationF !== 'all' || q;

  const clear = () => {
    setStatusF('all');
    setSkuF('all');
    setStationF('all');
    setQ('');
  };

  // Any filter / result change sends the user back to the first page.
  useEffect(() => {
    setPage(1);
  }, [statusF, skuF, stationF, qDebounced, fromDate, toDate, pageSize]);

  const totalRows = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize],
  );

  // Close any open snapshot when the visible page changes underneath it.
  useEffect(() => {
    setPreviewIdx(-1);
  }, [safePage, pageSize]);

  // Bubble the FULL filtered selection up so Download Report / exports still
  // cover every matching record, not just the visible page.
  const shown = totalRows;
  useEffect(() => {
    onRowsChange?.(filtered);
  }, [filtered, onRowsChange]);

  const gotoPage = () => {
    const n = parseInt(goto, 10);
    if (Number.isFinite(n)) setPage(Math.min(Math.max(n, 1), pageCount));
    setGoto('');
  };

  const selectCls =
    'h-[34px] pl-[11px] pr-[26px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[12px] text-[var(--tx2)] cursor-pointer outline-none transition-colors hover:border-[var(--blue)] focus:border-[var(--blue)] focus:text-[var(--tx)]';
  const fieldWrap =
    'flex items-center gap-[7px] h-[34px] px-[10px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[var(--tx3)] transition-colors focus-within:border-[var(--blue)] focus-within:text-[var(--tx2)]';

  return (
    <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[14px] overflow-hidden">
      {/* ── single-row toolbar ── */}
      <div className="flex items-center gap-2 p-[13px_16px] border-b border-[var(--bd)] flex-wrap">
        <span className="font-[var(--disp)] font-semibold text-[14px] mr-2">Measurement Records</span>
        <StatusPill active={statusF === 'all'} onClick={() => setStatusF('all')}>All</StatusPill>
        <StatusPill active={statusF === 'pass'} accent="var(--ok)" onClick={() => setStatusF('pass')}>Pass</StatusPill>
        <StatusPill active={statusF === 'mismatch'} accent="var(--crit)" onClick={() => setStatusF('mismatch')}>Mismatch</StatusPill>
        <StatusPill active={statusF === 'qrerr'} accent="var(--warn)" onClick={() => setStatusF('qrerr')}>QR Error</StatusPill>

        <select className={selectCls} value={skuF} onChange={(e) => setSkuF(e.target.value)}>
          {skuOptions.map((v) => (
            <option key={v} value={v}>{v === 'all' ? 'All SKUs' : v}</option>
          ))}
        </select>
        <select className={selectCls} value={stationF} onChange={(e) => setStationF(e.target.value)}>
          {stationOptions.map((v) => (
            <option key={v} value={v}>{v === 'all' ? 'All Stations' : v}</option>
          ))}
        </select>

        <span className={`${fieldWrap} w-[190px]`}>
          <Search size={14} strokeWidth={1.8} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order / Ref / SKU"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12px] font-[var(--mono)] text-[var(--tx)] placeholder:text-[var(--tx3)]"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="shrink-0 text-[var(--tx3)] hover:text-[var(--crit)] transition-colors"
              aria-label="Clear search"
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          )}
        </span>

        {filterActive && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-[5px] h-[34px] px-[10px] rounded-[8px] text-[11.5px] font-semibold text-[var(--crit)] border border-[var(--bd)] hover:border-[var(--crit)] hover:bg-[rgba(255,77,77,.08)] cursor-pointer transition-colors whitespace-nowrap"
          >
            <X size={13} strokeWidth={2.2} />Clear
          </button>
        )}

        <span className="ml-auto flex items-center gap-[10px]">
          {loading ? (
            <Loader2 size={13} className="animate-spin text-[var(--tx3)]" />
          ) : (
            error && (
              <span
                className="font-[var(--mono)] text-[9px] font-semibold text-[var(--crit)] border border-[var(--crit)] rounded-[4px] px-[5px] py-px"
                title={error}
              >
                ERROR
              </span>
            )
          )}
          <span className="font-[var(--mono)] text-[10.5px] text-[var(--tx3)]">
            {shown} record{shown === 1 ? '' : 's'}
          </span>
          <div className="flex gap-[3px] bg-[var(--bg2)] border border-[var(--bd)] rounded-[8px] p-[3px]">
            <button
              type="button"
              onClick={() => setView('list')}
              style={view === 'list' ? { background: 'linear-gradient(135deg,var(--blue),var(--violet))' } : undefined}
              className={`flex items-center gap-1 text-[11px] font-semibold px-[9px] py-[5px] rounded-[6px] cursor-pointer transition-colors ${
                view === 'list' ? 'text-white' : 'text-[var(--tx2)] hover:text-[var(--tx)]'
              }`}
            >
              <List size={13} />List
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              style={view === 'grid' ? { background: 'linear-gradient(135deg,var(--blue),var(--violet))' } : undefined}
              className={`flex items-center gap-1 text-[11px] font-semibold px-[9px] py-[5px] rounded-[6px] cursor-pointer transition-colors ${
                view === 'grid' ? 'text-white' : 'text-[var(--tx2)] hover:text-[var(--tx)]'
              }`}
            >
              <Grid2x2 size={13} />Grid
            </button>
          </div>
          {DOWNLOADS.map((d) => (
            <button
              key={d.fmt}
              type="button"
              onClick={() => exportMeasurementRecords(DL_KEY[d.fmt], filtered)}
              title={`Export ${shown} record${shown === 1 ? '' : 's'} as ${d.fmt}`}
              className="flex items-center gap-[6px] font-[var(--mono)] text-[11px] font-semibold rounded-[9px] px-[13px] py-[7px] cursor-pointer border-0 text-white transition-all hover:brightness-105 active:scale-95"
              style={DL_STYLE[d.fmt]}
            >
              <Download size={13} />{d.fmt}
            </button>
          ))}
        </span>
      </div>

      {view === 'list' ? (
        <div className="max-h-[520px] overflow-auto">
          <div style={{ minWidth: GRID_MIN_W }}>
          <div
            className="grid gap-x-[10px] p-[10px_16px] border-b border-[var(--bd2)] font-[var(--mono)] text-[9px] tracking-[.06em] text-[var(--tx3)] bg-[var(--bg1solid)] sticky top-0 z-[2]"
            style={{ gridTemplateColumns: GRID_COLS }}
          >
            <span>SNAP</span><span>ORDER · REF</span><span>SKU · MODEL</span>
            <span>PRINTED L×W×H</span><span>MEASURED L×W×H</span><span>Δ L / W / H (in)</span>
            <span>CONF</span><span>MATCH</span><span>STATION</span><span>WHEN · RESULT</span>
          </div>
          <div>
            {pageRows.map((r, idx) => {
              const sm = STATUS_META[r.status];
              return (
                <div
                  key={r.id}
                  className="grid gap-x-[10px] p-[10px_16px] border-b border-[var(--bd)] items-center text-[12.5px] transition-colors hover:bg-[var(--bg2)]"
                  style={{ gridTemplateColumns: GRID_COLS }}
                >
                  <SnapThumb src={r.shot} onOpen={() => setPreviewIdx(idx)} />
                  <span className="min-w-0">
                    <span className="block font-[var(--mono)] text-[11.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                      {r.orderId}
                    </span>
                    <span className="block font-[var(--mono)] text-[10px] text-[var(--tx3)] whitespace-nowrap overflow-hidden text-ellipsis">
                      {r.refNo}
                      {r.orderItem && r.orderItem !== '—' ? ` · ${r.orderItem}` : ''}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block font-[var(--mono)] text-[11.5px] font-semibold tracking-[.03em] whitespace-nowrap overflow-hidden text-ellipsis">
                      {r.sku}
                    </span>
                    <span className="block text-[11px] text-[var(--tx3)] whitespace-nowrap overflow-hidden text-ellipsis">
                      {[r.model, r.colour].filter((v) => v && v !== '—').join(' · ') || '—'}
                    </span>
                  </span>
                  <span className="font-[var(--mono)] text-[11px] text-[var(--tx2)] whitespace-nowrap">{r.declared}&#8243;</span>
                  <span
                    className="font-[var(--mono)] text-[11px] font-semibold text-[var(--tx)] whitespace-nowrap"
                    title={`DS raw ${r.measuredRaw}${r.measuredUnit ? ` (${r.measuredUnit})` : ''}${
                      r.implausible ? ' — implausible vs the label, verify against the photo' : ''
                    }`}
                  >
                    {r.measured}&#8243;
                  </span>
                  <DevTriple r={r} />
                  {(() => {
                    const cm = confMeta(r.confidence);
                    return (
                      <span
                        className="flex items-center gap-[4px] font-[var(--mono)] text-[10.5px] font-bold whitespace-nowrap"
                        style={{ color: cm.color }}
                        title={`DS confidence ${cm.label}`}
                      >
                        <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: cm.color }} />
                        {cm.label}
                      </span>
                    );
                  })()}
                  <MatchCell r={r} />
                  <span
                    className="font-[var(--mono)] text-[10.5px] text-[var(--tx2)] whitespace-nowrap overflow-hidden text-ellipsis"
                    title={r.station}
                  >
                    {r.station}
                  </span>
                  <span title={r.dateTime}>
                    <span className="block font-[var(--mono)] text-[11px] text-[var(--tx2)]">{r.time}</span>
                    <span className="block font-[var(--mono)] text-[9px] text-[var(--tx3)]">{r.date}</span>
                    <span
                      className="flex items-center gap-[5px] text-[10px] font-semibold mt-[2px]"
                      style={{ color: sm.color }}
                    >
                      <span
                        className="w-[6px] h-[6px] rounded-full shrink-0"
                        style={{ background: sm.color }}
                      />
                      {sm.label}
                    </span>
                  </span>
                </div>
              );
            })}
            {!pageRows.length && (
              <div className="p-8 text-center text-[12.5px] text-[var(--tx3)]">
                {loading ? 'Loading…' : 'No records match these filters.'}
              </div>
            )}
          </div>
          </div>
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-[13px]">
          {pageRows.map((r, idx) => {
            const sm = STATUS_META[r.status];
            const cm = confMeta(r.confidence);
            const matchP = matchPctOf(r);
            const hasShot = Boolean(r.shot);
            return (
              <div
                key={r.id}
                className="bg-[var(--bg2)] border border-[var(--bd)] rounded-[13px] overflow-hidden transition-colors hover:border-[var(--blue)] flex flex-col"
              >
                {/* Snapshot */}
                <div
                  onClick={() => hasShot && setPreviewIdx(idx)}
                  className={`relative aspect-[16/10] bg-[#0a0e15] shrink-0 ${
                    hasShot ? 'cursor-pointer' : ''
                  }`}
                  title={hasShot ? 'View snapshot' : undefined}
                >
                  <SnapImage src={r.shot} />
                  {hasShot && (
                    <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/55" />
                  )}
                  {/* status badge */}
                  <div
                    className="absolute top-2 right-[9px] font-[var(--mono)] text-[9px] font-bold bg-black/65 px-[6px] py-[2px] rounded-[5px] backdrop-blur-sm"
                    style={{ color: sm.color, border: `1px solid ${sm.color}` }}
                  >
                    {sm.label}
                  </div>
                  {/* confidence badge */}
                  <div
                    className="absolute top-2 left-[9px] font-[var(--mono)] text-[9px] font-bold bg-black/65 px-[6px] py-[2px] rounded-[5px] backdrop-blur-sm"
                    style={{ color: cm.color }}
                  >
                    conf {cm.label}
                  </div>
                </div>

                {/* Body */}
                <div className="p-[11px] flex flex-col gap-[7px] flex-1">
                  <div>
                    <div className="text-[12px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                      {[r.sku, r.model].filter((v) => v && v !== '—').join(' · ')}
                    </div>
                    <div className="font-[var(--mono)] text-[9.5px] text-[var(--tx3)] mt-[2px] whitespace-nowrap overflow-hidden text-ellipsis">
                      order {r.orderId} · ref {r.refNo}
                    </div>
                  </div>

                  {/* printed → measured */}
                  <div className="grid grid-cols-2 gap-[6px] font-[var(--mono)] text-[10px]">
                    <div className="rounded-[6px] bg-[var(--bg1)] border border-[var(--bd)] px-[8px] py-[5px]">
                      <div className="text-[8px] uppercase tracking-wide text-[var(--tx3)]">Printed</div>
                      <div className="text-[var(--tx2)] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                        {r.declared}&#8243;
                      </div>
                    </div>
                    <div className="rounded-[6px] bg-[var(--bg1)] border border-[var(--bd)] px-[8px] py-[5px]">
                      <div className="text-[8px] uppercase tracking-wide text-[var(--tx3)]">Measured</div>
                      <div className="font-semibold text-[var(--tx)] whitespace-nowrap overflow-hidden text-ellipsis">
                        {r.measured}&#8243;
                      </div>
                    </div>
                  </div>

                  {/* deviation triple */}
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[8px] uppercase tracking-wide text-[var(--tx3)] font-[var(--mono)]">
                      Δ L/W/H
                    </span>
                    <span className="flex gap-[6px] font-[var(--mono)] text-[11px] font-semibold">
                      <span style={{ color: devColor(r.devL) }}>{r.devL}</span>
                      <span className="text-[var(--tx3)]">/</span>
                      <span style={{ color: devColor(r.devB) }}>{r.devB}</span>
                      <span className="text-[var(--tx3)]">/</span>
                      <span style={{ color: devColor(r.devH) }}>{r.devH}</span>
                    </span>
                  </div>

                  {/* match bar */}
                  <div className="flex items-center gap-[8px]">
                    <span className="flex-1 h-[6px] rounded-[3px] bg-[var(--track)] overflow-hidden block">
                      {r.devPct !== 'QR unread' && (
                        <span
                          className="block h-full rounded-[3px]"
                          style={{
                            width: `${Math.max(matchP ?? 0, 3)}%`,
                            background: matchColor(matchP ?? 0),
                          }}
                        />
                      )}
                    </span>
                    <span
                      className="font-[var(--mono)] text-[9.5px] font-semibold whitespace-nowrap shrink-0"
                      style={{
                        color:
                          r.devPct === 'QR unread' ? 'var(--tx3)' : matchColor(matchP ?? 0),
                      }}
                    >
                      {matchLabel(r)}
                    </span>
                  </div>

                  {/* footer: station + time */}
                  <div className="mt-auto flex items-center justify-between font-[var(--mono)] text-[9.5px] text-[var(--tx3)] pt-[3px] border-t border-[var(--bd)]">
                    <span className="truncate" title={r.stationId || r.station}>{r.station}</span>
                    <span className="shrink-0">{r.date} · {r.time}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {!pageRows.length && (
            <div className="col-span-full p-8 text-center text-[12.5px] text-[var(--tx3)]">
              {loading ? 'Loading…' : 'No records match these filters.'}
            </div>
          )}
        </div>
      )}

      {/* ── pagination bar ── */}
      {totalRows > 0 && (
        <div className="flex items-center gap-3 flex-wrap p-[11px_16px] border-t border-[var(--bd)] bg-[var(--bg1solid)]">
          <span className="font-[var(--mono)] text-[11px] text-[var(--tx3)]">
            {pageStart + 1}–{Math.min(pageStart + pageSize, totalRows)} of {totalRows}
          </span>

          <span className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="w-[30px] h-[30px] flex items-center justify-center rounded-[8px] border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] cursor-pointer transition-colors hover:text-[var(--tx)] hover:border-[var(--blue)] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
            </button>

            {getPageList(safePage, pageCount).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-[6px] text-[11px] text-[var(--tx3)]">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={
                    p === safePage
                      ? { background: 'linear-gradient(135deg,var(--blue),var(--violet))' }
                      : undefined
                  }
                  className={`min-w-[30px] h-[30px] px-[7px] flex items-center justify-center rounded-[8px] text-[11.5px] font-semibold cursor-pointer transition-colors border ${
                    p === safePage
                      ? 'text-white border-transparent'
                      : 'bg-[var(--bg2)] text-[var(--tx2)] border-[var(--bd)] hover:text-[var(--tx)] hover:border-[var(--blue)]'
                  }`}
                >
                  {p}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={safePage >= pageCount}
              className="w-[30px] h-[30px] flex items-center justify-center rounded-[8px] border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] cursor-pointer transition-colors hover:text-[var(--tx)] hover:border-[var(--blue)] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight size={15} />
            </button>
          </span>

          <span className="flex items-center gap-[6px]">
            <span className="text-[11px] text-[var(--tx3)]">Go to</span>
            <input
              value={goto}
              onChange={(e) => setGoto(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && gotoPage()}
              placeholder="Page"
              className="w-[56px] h-[30px] px-[8px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[11.5px] text-[var(--tx)] outline-none focus:border-[var(--blue)] text-center"
            />
            <button
              type="button"
              onClick={gotoPage}
              style={{ background: 'linear-gradient(135deg,var(--blue),var(--violet))' }}
              className="h-[30px] px-[12px] rounded-[8px] text-[11.5px] font-semibold text-white cursor-pointer"
            >
              Go
            </button>
          </span>

          <span className="flex items-center gap-[6px]">
            <span className="text-[11px] text-[var(--tx3)]">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-[30px] pl-[9px] pr-[24px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[11.5px] text-[var(--tx2)] cursor-pointer outline-none focus:border-[var(--blue)]"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}

      {previewIdx >= 0 && pageRows[previewIdx] && (
        <ImagePreviewModal
          previewImage={pageRows[previewIdx].shot}
          hasPrevious={previewIdx > 0}
          hasNext={previewIdx < pageRows.length - 1}
          onPrevious={() => setPreviewIdx((i) => Math.max(0, i - 1))}
          onNext={() => setPreviewIdx((i) => Math.min(pageRows.length - 1, i + 1))}
          onClose={() => setPreviewIdx(-1)}
        />
      )}
    </div>
  );
};

// Compact page list with leading / trailing ellipses: 1 … 4 5 [6] 7 8 … 20
function getPageList(current, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set([1, count, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

export default MeasurementRecords;
