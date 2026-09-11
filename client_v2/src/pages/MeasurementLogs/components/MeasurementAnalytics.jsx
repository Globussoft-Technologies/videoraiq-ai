/**
 * Analytics row: deviation by axis, hourly throughput/failures, mismatch rate
 * by SKU. All three cards are fed by GET /measurement-logs/analytics.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, LayoutList, Loader2, Info } from 'lucide-react';
import moment from 'moment';
import { searchMismatchBySku } from '../api';

// Shared plot/list height for the three analytics cards, so they read as one
// row. Mismatch Rate by SKU has an extra "View all" button under its list
// (~46px incl. margin) that Deviation/Throughput don't — CARD_CONTENT_H is
// bumped by that amount so the three cards still total the same height.
const SKU_BUTTON_H = 46; // 14px margin-top + 32px button
const CARD_CONTENT_H = 190;
// Small "ⓘ" affordance in a card header. On hover / focus it shows a short
// explanation of what the chart means and how to read it.
const InfoHint = ({ title, lines = [] }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,
      left: Math.min(r.left, window.innerWidth - 288),
    });
  }, [open]);

  return (
    <span
      ref={ref}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full text-[var(--tx3)] hover:text-[var(--tx2)] cursor-help shrink-0 outline-none"
      aria-label={`About ${title}`}
    >
      <Info size={13} strokeWidth={2} />
      {open &&
        pos &&
        createPortal(
          <div
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[90] w-[272px] p-[11px_13px] rounded-[10px] bg-[var(--bg1solid)] border border-[var(--bd2)] shadow-2xl pointer-events-none"
          >
            <div className="text-[10.5px] font-semibold text-[var(--tx)]">{title}</div>
            <div className="mt-[5px] flex flex-col gap-[4px]">
              {lines.map((l, i) => (
                <div key={i} className="text-[10px] text-[var(--tx3)] leading-[1.45]">
                  {l}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
};


// How many SKU rows to show inline before the "View all" affordance.
const SKU_INLINE_LIMIT = 8;

const rateColor = (rate) =>
  rate === 0 ? 'var(--ok)' : rate >= 30 ? 'var(--crit)' : 'var(--warn)';

const SkuRow = ({ s }) => (
  <div>
    <div className="flex items-center gap-2 mb-[4px]">
      <span
        className="text-[11.5px] font-semibold min-w-0 whitespace-nowrap overflow-hidden text-ellipsis"
        title={s.model ? `${s.name} · ${s.model}` : s.name}
      >
        {s.name}
      </span>
      <span
        className="ml-auto font-[var(--mono)] text-[10px] text-[var(--tx3)] shrink-0 cursor-help"
        title={`${s.fails} of ${s.count} measured ${s.name} unit(s) did not match the printed label (mismatches / total measured).`}
      >
        {s.fails}/{s.count}
      </span>
      <span
        className="font-[var(--mono)] text-[11.5px] font-bold shrink-0 cursor-help"
        title={`Mismatch rate for ${s.name}: ${s.fails} ÷ ${s.count} = ${s.rate}% of measured units are out of tolerance.`}
      >
        {s.rate}%
      </span>
    </div>
    <div className="flex items-center gap-2 mb-[5px] font-[var(--mono)] text-[10px]">
      <span
        className="text-[var(--tx3)] cursor-help"
        title={`Printed label size for ${s.name} (L × W × H, inches).`}
      >
        label <span className="text-[var(--tx2)]">{s.declared || '—'}</span>
      </span>
      <span className="text-[var(--tx3)]">→</span>
      <span
        className="text-[var(--tx3)] cursor-help"
        title={`Average size the camera measured for ${s.name} (L × W × H, inches). Compare against the label to see which axis drifts.`}
      >
        measured <span className="text-[var(--tx2)]">{s.measured || '—'}</span>
      </span>
    </div>
    <div
      className="h-[6px] rounded-[3px] bg-[var(--track)] overflow-hidden cursor-help"
      title={`${s.rate}% mismatch — ${
        s.rate === 0 ? 'all units match the label' : s.rate >= 30 ? 'high, needs attention' : 'some drift'
      }.`}
    >
      <div
        className="h-full rounded-[3px]"
        style={{ width: `${Math.max(s.rate, 2)}%`, background: rateColor(s.rate) }}
      />
    </div>
  </div>
);

// { from, to } YYYY-MM-DD → inclusive ISO bounds for the API.
const toIsoWindow = ({ from, to } = {}) => {
  const p = {};
  if (from) p.fromDate = moment(from, 'YYYY-MM-DD').startOf('day').toISOString();
  if (to) p.toDate = moment(to, 'YYYY-MM-DD').endOf('day').toISOString();
  return p;
};

const MismatchBySkuModal = ({ rows: seed, dateRange, onClose }) => {
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  // Seeded from the card's rows for an instant first paint; the API result
  // replaces it (and drives every search after that).
  const [rows, setRows] = useState(seed);
  const [total, setTotal] = useState(seed.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    searchMismatchBySku({ q: qDebounced, ...toIsoWindow(dateRange), limit: 500 })
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((e) => !cancelled && setError(e?.message || 'Search failed'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [qDebounced, dateRange]);

  const filtered = rows;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-full max-h-[86vh] flex flex-col bg-[var(--bg1solid)] border border-[var(--bd2)] rounded-[16px] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 p-[16px_18px] border-b border-[var(--bd2)] shrink-0">
          <div className="flex-1 min-w-0">
            <div className="font-[var(--disp)] font-semibold text-[15px]">Mismatch Rate by SKU</div>
            <div className="text-[11px] text-[var(--tx3)] mt-px">
              {qDebounced
                ? `${total} SKU${total === 1 ? '' : 's'} matching “${qDebounced}”`
                : `${total} SKU${total === 1 ? '' : 's'} · label vs measured size`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center cursor-pointer text-[var(--tx3)] border border-[var(--bd)] shrink-0 hover:text-[var(--tx)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-[12px_18px] border-b border-[var(--bd)] shrink-0">
          <span className="flex items-center gap-[7px] h-[36px] px-[11px] rounded-[9px] bg-[var(--bg2)] border border-[var(--bd)] text-[var(--tx3)] focus-within:border-[var(--blue)] focus-within:text-[var(--tx2)] transition-colors">
            <Search size={14} strokeWidth={1.8} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by SKU number…"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12.5px] font-[var(--mono)] text-[var(--tx)] placeholder:text-[var(--tx3)]"
            />
            {loading ? (
              <Loader2 size={13} className="shrink-0 animate-spin text-[var(--tx3)]" />
            ) : (
              q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="shrink-0 text-[var(--tx3)] hover:text-[var(--crit)] transition-colors"
                  aria-label="Clear filter"
                >
                  <X size={13} strokeWidth={2.2} />
                </button>
              )
            )}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-[16px_18px] flex flex-col gap-[14px]">
          {error ? (
            <div className="text-[11.5px] text-[var(--crit)] py-8 text-center">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-[11.5px] text-[var(--tx3)] py-8 text-center">
              {loading ? 'Searching…' : qDebounced ? `No SKU matches “${qDebounced}”.` : 'No SKUs in this window.'}
            </div>
          ) : (
            filtered.map((s) => <SkuRow key={s.sku} s={s} />)
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const Card = ({ title, sub, info, children }) => (
  <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[14px] p-4">
    <div className="flex items-center gap-[6px]">
      <span className="font-[var(--disp)] font-semibold text-[13.5px]">{title}</span>
      {info && <InfoHint title={title} lines={info} />}
    </div>
    <div className="text-[11px] text-[var(--tx3)] mt-[3px]">{sub}</div>
    <div className="mt-4">{children}</div>
  </div>
);

// Same target height as the populated cards (CARD_CONTENT_H + SKU_BUTTON_H)
// so an empty-data card doesn't collapse and throw the row out of alignment.
// No margin of its own — callers already sit inside a spacing context (Card's
// own mt-4 wrapper, or ThroughputChart's matching mt-4 around this).
const Empty = ({ children }) => (
  <div
    className="flex items-center justify-center text-[11px] text-[var(--tx3)] text-center"
    style={{ minHeight: CARD_CONTENT_H + SKU_BUTTON_H }}
  >
    {children}
  </div>
);

const AXIS_COLOR = { Length: 'var(--violet)', Width: 'var(--violet)', Height: 'var(--cyan)' };

const DeviationByAxis = ({ rows, loading }) => (
  <Card
    title="Deviation by Axis"
    sub="Mean absolute difference · printed vs measured (inches)"
    info={[
      'For each axis (Length / Width / Height), the average gap between the printed label size and the size the camera measured.',
      'The bar fills toward 100% of the allowed tolerance (tol ±). A full bar means the average unit is already at the limit.',
      'max = the single worst unit in this window. "N out of tol." = how many measured units exceeded the tolerance on that axis.',
    ]}
  >
    {loading && !rows?.length ? (
      <Empty>Loading…</Empty>
    ) : !rows?.length ? (
      <Empty>No measurements in this window</Empty>
    ) : (
      // Same target height as Throughput (which also has no bottom button),
      // with the three rows spread evenly across it — a modest, deliberate
      // bump rather than a grid-wide stretch, so real content is never
      // pulled apart by empty space the way it was before.
      <div
        className="flex flex-col justify-around"
        style={{ minHeight: CARD_CONTENT_H + SKU_BUTTON_H }}
      >
        {rows.map((a) => {
          const color = AXIS_COLOR[a.axis] || 'var(--violet)';
          const pct = a.pct ?? Math.min(100, Math.round((a.avgIn / a.tolIn) * 100));
          return (
            <div key={a.axis}>
              <div className="flex items-baseline gap-2 mb-[6px]">
                <span className="text-[12.5px] font-semibold">{a.axis}</span>
                <span
                  className="font-[var(--mono)] text-[10px] text-[var(--tx3)] cursor-help"
                  title={`Allowed deviation for the ${a.axis} axis: ±${a.tolIn} in. A unit passes this axis when measured − printed is within ±${a.tolIn} in.`}
                >
                  tol ±{a.tolIn} in
                </span>
                <span
                  className="ml-auto font-[var(--mono)] text-[13px] font-bold cursor-help"
                  style={{ color }}
                  title={`Average deviation on ${a.axis}: ${a.avgIn} in across ${a.measured ?? '—'} measured unit(s).`}
                >
                  {a.avgIn} in
                </span>
              </div>
              <div
                className="h-[6px] rounded-[3px] bg-[var(--track)] overflow-hidden cursor-help"
                title={`Average deviation uses ${pct}% of the ±${a.tolIn} in tolerance${
                  pct >= 100 ? ' (bar capped at 100%)' : ''
                }.`}
              >
                <div
                  className="h-full rounded-[3px]"
                  style={{ width: `${Math.max(pct, 2)}%`, background: color }}
                />
              </div>
              <div className="flex gap-3 mt-[5px] font-[var(--mono)] text-[10px] text-[var(--tx3)]">
                <span
                  className="cursor-help"
                  title={`Largest single-unit deviation on ${a.axis} in this window: ${a.maxIn} in.`}
                >
                  max {a.maxIn} in
                </span>
                <span
                  className="cursor-help"
                  title={`${a.outOfTol} of ${a.measured ?? '—'} measured units exceeded the ±${a.tolIn} in tolerance on ${a.axis}.`}
                >
                  {a.outOfTol}
                  {a.measured != null ? ` / ${a.measured}` : ''} out of tol.
                </span>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </Card>
);

const barLabel = (b) => b.label || b.key || '';

const UNIT_WORD = { hour: 'by hour', day: 'by day', month: 'by month' };

// A "nice" axis ceiling (1 / 2 / 2.5 / 5 × 10ⁿ) at or above the tallest bar.
const niceMax = (v) => {
  if (v <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (pow * m >= v) return pow * m;
  return pow * 10;
};

const ThroughputChart = ({ rows = [], unit = 'hour', loading }) => {
  const peak = Math.max(1, ...rows.map((h) => h.pass + h.fail));
  const axisMax = niceMax(peak);
  const totalUnits = rows.reduce((n, h) => n + h.pass + h.fail, 0);
  const totalFails = rows.reduce((n, h) => n + h.fail, 0);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(axisMax * f));
  const step = rows.length > 24 ? Math.ceil(rows.length / 12) : rows.length > 12 ? 2 : 1;

  const rangeNote =
    rows.length && unit === 'hour'
      ? ` (${barLabel(rows[0])} to ${barLabel(rows[rows.length - 1])})`
      : '';

  return (
    <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[14px] p-4 flex flex-col">
      <div className="flex items-center gap-[10px]">
        <span>
          <span className="flex items-center gap-[6px]">
            <span className="font-[var(--disp)] font-semibold text-[13.5px]">
              Throughput &amp; Failures
            </span>
            <InfoHint
              title="Throughput & Failures"
              lines={[
                'Units measured over the selected date range, split into PASS (blue) and FAIL / Mismatch (red).',
                'The bar size adapts to the range: one day → per hour, several days or a month → per day, a year → per month.',
                'The number above each bar is the total units for that period. Only periods with activity are shown.',
              ]}
            />
          </span>
          <span className="block text-[11px] text-[var(--tx3)] mt-[3px]">
            {rows.length
              ? `${totalUnits.toLocaleString()} unit${totalUnits === 1 ? '' : 's'} · ${totalFails.toLocaleString()} failed · ${
                  UNIT_WORD[unit] || 'by hour'
                }${rangeNote}`
              : 'Units measured per hour'}
          </span>
        </span>
        <span className="ml-auto flex gap-3 font-[var(--mono)] text-[9.5px] text-[var(--tx3)]">
          <span className="flex items-center gap-[5px]">
            <span className="w-2 h-2 rounded-[2px] bg-[#3b82f6]" />PASS
          </span>
          <span className="flex items-center gap-[5px]">
            <span className="w-2 h-2 rounded-[2px] bg-[#ff6b6b]" />FAIL
          </span>
        </span>
      </div>

      {loading && !rows.length ? (
        // ThroughputChart doesn't use the shared Card wrapper, so (unlike
        // DeviationByAxis / MismatchBySku) it needs its own mt-4 here to match
        // the gap Card gives every other card under its header for free.
        <div className="mt-4"><Empty>Loading...</Empty></div>
      ) : !rows.length ? (
        <div className="mt-4"><Empty>No measurements in this window</Empty></div>
      ) : (
        // Fixed plot height regardless of data volume — a bar for 5 units and a
        // bar for 5,000 units both fit this same box; only the fill % changes.
        // The card's own height therefore never grows with the numbers.
        // (+SKU_BUTTON_H so this card lines up with Mismatch Rate by SKU,
        // whose list sits above a "View all" button this card doesn't have.)
        <div className="flex mt-[16px] shrink-0" style={{ height: CARD_CONTENT_H + SKU_BUTTON_H }}>
          <div className="flex flex-col justify-between pr-[8px] pb-[22px] font-[var(--mono)] text-[9px] text-[var(--tx3)] text-right shrink-0">
            {ticks.map((t, i) => (
              <span key={`${t}-${i}`} className="leading-none">{t.toLocaleString()}</span>
            ))}
          </div>

          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-x-0 top-0 bottom-[22px] flex flex-col justify-between pointer-events-none">
              {ticks.map((t, i) => (
                <span
                  key={`g-${t}-${i}`}
                  className={`w-full border-t ${
                    i === ticks.length - 1 ? 'border-[var(--bd2)]' : 'border-[var(--bd)]'
                  }`}
                />
              ))}
            </div>

            <div
              className={`absolute inset-x-0 top-0 bottom-[22px] flex items-end gap-[10px] ${
                rows.length > 14
                  ? 'overflow-x-auto'
                  : rows.length <= 3
                    ? 'justify-start'
                    : 'justify-between'
              }`}
            >
              {rows.map((h, i) => {
                const total = h.pass + h.fail;
                const okPct = (h.pass / axisMax) * 100;
                const failPct = (h.fail / axisMax) * 100;
                const showLabel = i % step === 0 || i === rows.length - 1;
                return (
                  <div
                    key={h.key ?? barLabel(h)}
                    className="relative h-full flex flex-col justify-end items-center shrink-0"
                    style={{ width: rows.length > 14 ? 24 : 46 }}
                    title={`${barLabel(h)}: ${h.pass} pass, ${h.fail} fail`}
                  >
                    <span
                      className="absolute font-[var(--mono)] text-[9.5px] font-semibold text-[var(--tx2)] whitespace-nowrap"
                      style={{ bottom: `calc(${Math.min(okPct + failPct, 100)}% + 3px)` }}
                    >
                      {total ? total.toLocaleString() : ''}
                    </span>
                    {failPct > 0 && (
                      <span
                        className="w-full"
                        style={{
                          height: `${failPct}%`,
                          background: 'linear-gradient(180deg,#ff6b6b,#e11d48)',
                          borderRadius: '4px 4px 0 0',
                        }}
                      />
                    )}
                    {okPct > 0 && (
                      <span
                        className="w-full"
                        style={{
                          height: `${okPct}%`,
                          background: 'linear-gradient(180deg,#3b82f6,#1d4ed8)',
                          borderRadius: failPct > 0 ? '0' : '4px 4px 0 0',
                        }}
                      />
                    )}
                    {!total && <span className="w-full h-[2px] bg-[var(--bd2)]" />}
                    <span className="absolute -bottom-[19px] font-[var(--mono)] text-[9px] text-[var(--tx3)] whitespace-nowrap">
                      {showLabel ? barLabel(h) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MismatchBySku = ({ rows = [], loading, dateRange }) => {
  const [open, setOpen] = useState(false);
  const inline = rows.slice(0, SKU_INLINE_LIMIT);
  const hidden = rows.length - inline.length;

  return (
    <>
      <Card
        title="Mismatch Rate by SKU"
        sub="Label (original) vs measured (captured) size · share of units that differ"
        info={[
          'Per mattress SKU: how many measured units did not match their printed label size.',
          '"fails / count" = mismatched units out of total measured for that SKU; the % and bar are fails ÷ count.',
          'label → measured shows that SKU\'s printed size and the average captured size, so you can see which axis is drifting.',
          'Green = 0% (all match), amber = under 30%, red = 30% or more. Sorted worst first.',
        ]}
      >
        {loading && !rows.length ? (
          <Empty>Loading…</Empty>
        ) : !rows.length ? (
          <Empty>No measurements in this window</Empty>
        ) : (
          <>
            {/* Fixed height, scrolls internally — plus the button below it
                lines this card up with Deviation/Throughput, and it never
                grows past this no matter how many SKUs are inline. */}
            <div
              className="overflow-y-auto pr-[4px] flex flex-col gap-[13px]"
              style={{ height: CARD_CONTENT_H }}
            >
              {inline.map((s) => (
                <SkuRow key={s.sku} s={s} />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-[14px] w-full flex items-center justify-center gap-[6px] h-[32px] rounded-[8px] border border-[var(--bd)] bg-[var(--bg2)] text-[11.5px] font-semibold text-[var(--tx2)] cursor-pointer transition-colors hover:text-[var(--tx)] hover:border-[var(--blue)] shrink-0"
            >
              <LayoutList size={13} />
              {hidden > 0 ? `View all ${rows.length} SKUs` : 'View all'}
            </button>
          </>
        )}
      </Card>
      {open && (
        <MismatchBySkuModal rows={rows} dateRange={dateRange} onClose={() => setOpen(false)} />
      )}
    </>
  );
};

const MeasurementAnalytics = ({
  deviationByAxis = [],
  throughput = [],
  throughputUnit = 'hour',
  mismatchBySku = [],
  dateRange,
  loading = false,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] gap-4 items-start">
    <DeviationByAxis rows={deviationByAxis} loading={loading} />
    <ThroughputChart rows={throughput} unit={throughputUnit} loading={loading} />
    <MismatchBySku rows={mismatchBySku} loading={loading} dateRange={dateRange} />
  </div>
);

export default MeasurementAnalytics;
