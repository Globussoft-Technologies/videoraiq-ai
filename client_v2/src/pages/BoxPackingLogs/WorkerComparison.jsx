import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import moment from 'moment-timezone';
import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, CheckCircle2, Clock3, Gauge, PackageCheck, Trophy } from 'lucide-react';
import { formatPackingTotalTime, packingDurationSeconds, packingTotalSeconds, packingStartTimestamp, packingWorkerActivity, packingWorkerId } from './boxPackingData';
import { useTheme } from '@/theme/ThemeContext';

const TZ = 'Asia/Kolkata';
const COLORS = ['#348cff', '#b128f2', '#00d797', '#ff9a45', '#35c5e9', '#ef5b8f'];
const dayOf = (value) => value && moment(value).isValid() ? moment(value).tz(TZ).format('YYYY-MM-DD') : null;
const workerOrder = (a, b) => a.localeCompare(b, undefined, { numeric: true });

function Stat({ icon: Icon, title, value, detail, color, lightBackground }) {
  const { isDark } = useTheme();
  return <div className="flex min-h-20 min-w-0 items-center gap-3 rounded-[13px] border p-3 transition-transform hover:-translate-y-0.5" style={{ background: isDark ? `color-mix(in srgb, ${color} 7%, var(--bg1solid))` : lightBackground, borderColor: isDark ? 'var(--bd2)' : `color-mix(in srgb, ${color} 22%, #fff)` }}>
    <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ color, background: `color-mix(in srgb, ${color} 15%, var(--bg1solid))` }}><Icon size={19} strokeWidth={2} /></span>
    <span className="block min-w-0"><span className="block truncate text-[9px] font-bold uppercase tracking-[.06em] text-[var(--tx3)]">{title}</span><strong className="my-0.5 block truncate text-[21px] leading-tight text-[var(--tx)]">{value}</strong><span className="block max-h-[2.7em] overflow-hidden text-[9px] leading-[1.35] text-[var(--tx2)]">{detail}</span></span>
  </div>;
}

function WorkerTooltip({ worker, total, x, y }) {
  const { isDark } = useTheme();
  if (!worker || typeof document === 'undefined') return null;
  return createPortal(<div role="tooltip" style={{ position: 'fixed', left: x, top: y, zIndex: 9999, width: 220, padding: '9px 11px', borderRadius: 10, border: `1px solid ${isDark ? '#374365' : '#d7dfec'}`, borderLeft: `3px solid ${worker.color}`, background: isDark ? '#141d38' : '#ffffff', color: isDark ? '#f5f7ff' : '#16213b', boxShadow: isDark ? '0 12px 30px rgba(0,0,0,.42)' : '0 12px 30px rgba(36,52,87,.18)', pointerEvents: 'none', fontSize: 11, lineHeight: 1.5 }}>
    <strong style={{ display: 'flex', alignItems: 'center', gap: 7, color: isDark ? worker.color : `color-mix(in srgb, ${worker.color} 55%, #16213b)` }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: worker.color }} />{worker.id}</strong>
    <div>{worker.boxes} box{worker.boxes === 1 ? '' : 'es'} · {Math.round(worker.boxes / total * 100)}% of total</div>
    <div style={{ color: isDark ? '#aab7d6' : '#52617c' }}>{worker.totalSeconds > 0 ? `${formatPackingTotalTime(worker.rows)} total · ${worker.timedCount} timed` : 'No packing time recorded'}</div>
  </div>, document.body);
}

function ProductivityTooltip({ worker, rangeLabel, productivityPeriod, x, y }) {
  const { isDark } = useTheme();
  if (!worker || typeof document === 'undefined') return null;
  return createPortal(<div role="tooltip" style={{ position: 'fixed', left: x, top: y, zIndex: 9999, width: 260, padding: '11px 13px', borderRadius: 10, border: `1px solid ${isDark ? '#435276' : '#d9e1ee'}`, borderLeft: `3px solid ${worker.color}`, background: isDark ? '#182340' : '#fff', color: isDark ? '#e9efff' : '#20304b', boxShadow: isDark ? '0 12px 28px rgba(0,0,0,.3)' : '0 12px 28px rgba(36,52,87,.16)', pointerEvents: 'none', fontSize: 11, lineHeight: 1.5 }}>
    <strong>{worker.id} · Estimated pace</strong>
    <div>{worker.productivity == null ? 'No valid boxes in this period.' : `${worker.productivity.toFixed(1)} ${productivityPeriod.unit} for the selected range.`}</div>
    <div style={{ marginTop: 5, color: isDark ? '#aab7d6' : '#52617c' }}>Based on {worker.timedCount} timed box{worker.timedCount === 1 ? '' : 'es'} in {rangeLabel}. Not measured shift output.</div>
  </div>, document.body);
}

function WorkerBarChart({ workers, total, maximum, onHover, onLeave }) {
  return <div className="mt-4 min-w-0 overflow-x-auto overflow-y-hidden"><div className="grid h-[260px] items-stretch gap-3 rounded-xl px-2 py-2.5" style={{ gridTemplateColumns: `repeat(${workers.length}, minmax(76px, 1fr))`, minWidth: workers.length * 88, background: 'repeating-linear-gradient(to top, transparent 0, transparent 47px, var(--bd) 48px)' }}>
    {workers.map((worker) => {
      const share = worker.boxes / total * 100;
      return <div key={worker.id} className="grid h-full min-w-0 grid-rows-[22px_minmax(0,1fr)_24px] justify-items-center gap-[7px] text-center">
        <span className="self-start whitespace-nowrap text-[11px] font-extrabold text-[var(--tx)]">{worker.boxes}</span>
        <div className="flex h-full w-full items-end justify-center"><div tabIndex={0} role="img" aria-label={`${worker.id}: ${worker.boxes} boxes, ${Math.round(share)}% of total`} onMouseEnter={(event) => onHover(worker, event)} onMouseMove={(event) => onHover(worker, event)} onMouseLeave={onLeave} onFocus={(event) => onHover(worker, event)} onBlur={onLeave} className="w-[70%] max-w-[68px] cursor-pointer rounded-t-lg rounded-b-[3px] shadow-md transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ height: `${Math.max(2, worker.boxes / maximum * 100)}%`, background: `linear-gradient(180deg, ${worker.color}, ${worker.color}aa)`, outlineColor: worker.color }} /></div>
        <span className="whitespace-nowrap text-[10px] font-extrabold text-[var(--tx2)]">{worker.id}</span>
      </div>;
    })}
  </div></div>;
}

export default function WorkerComparison({ rows = [], cameraName, dateRange }) {
  const [sort, setSort] = useState({ key: 'boxes', direction: 'desc' });
  const [hovered, setHovered] = useState(null);
  const showWorkerTooltip = (worker, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : rect.left + rect.width / 2;
    const pointerY = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : rect.top + rect.height / 2;
    const x = rect.right + 12 + 220 <= window.innerWidth - 8 ? rect.right + 12 : rect.left - 232 >= 8 ? rect.left - 232 : Math.max(8, Math.min(pointerX - 110, window.innerWidth - 228));
    setHovered({ worker, x, y: Math.max(8, Math.min(pointerY - 36, window.innerHeight - 88)) });
  };
  const scopedRows = useMemo(() => rows.filter((row) => {
    // The incident date defines the report period; a box can start before midnight.
    const day = dayOf(row.time || row.recordedAt || row.timeOfIncident || packingStartTimestamp(row));
    return day && (!dateRange?.startDate || day >= dateRange.startDate) && (!dateRange?.endDate || day <= dateRange.endDate);
  }), [rows, dateRange?.startDate, dateRange?.endDate]);
  const workers = useMemo(() => {
    const groups = new Map();
    const activity = new Map(packingWorkerActivity(scopedRows).map((worker) => [worker.id, worker]));
    scopedRows.forEach((row) => {
      const id = packingWorkerId(row);
      if (!id) return;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(row);
    });
    return [...groups.entries()].sort(([a], [b]) => workerOrder(a, b)).map(([id, entries], index) => {
      const timedCount = entries.filter((row) => packingDurationSeconds(row) > 0).length;
      return { id, rows: entries, boxes: entries.length, completed: activity.get(id)?.completed === true, timedCount, totalSeconds: packingTotalSeconds(entries), color: COLORS[index % COLORS.length] };
    });
  }, [scopedRows]);
  const total = workers.reduce((sum, worker) => sum + worker.boxes, 0);
  const timedRows = scopedRows.filter((row) => packingWorkerId(row) && packingDurationSeconds(row) > 0);
  const mostBoxes = [...workers].sort((a, b) => b.boxes - a.boxes || workerOrder(a.id, b.id))[0];
  const mostTime = [...workers].filter((worker) => worker.totalSeconds > 0).sort((a, b) => b.totalSeconds - a.totalSeconds || workerOrder(a.id, b.id))[0];
  const maxBoxes = Math.max(1, ...workers.map((worker) => worker.boxes));
  const chartCeiling = Math.max(5, Math.ceil(maxBoxes / 5) * 5);
  const chartWorkers = [...workers].sort((a, b) => b.boxes - a.boxes || workerOrder(a.id, b.id));
  const sorted = [...workers].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    const result = typeof left === 'string' ? workerOrder(left, right) : left - right;
    return sort.direction === 'asc' ? result : -result;
  });
  let shareOffset = 0;
  const donutSegments = workers.map((worker) => {
    const start = shareOffset;
    shareOffset += worker.boxes / total * 100;
    return `${worker.color} ${start}% ${shareOffset}%`;
  });
  const rangeLabel = dateRange?.startDate && dateRange?.endDate
    ? dateRange.startDate === dateRange.endDate ? moment(dateRange.startDate).format('DD MMM YYYY') : `${moment(dateRange.startDate).format('DD MMM')} – ${moment(dateRange.endDate).format('DD MMM YYYY')}`
    : 'Selected period';
  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const columns = [['id', 'Worker'], ['boxes', 'Boxes packed'], ['totalSeconds', 'Total time']];

  return <section className="min-w-0 rounded-2xl border border-[var(--bd2)] bg-[var(--bg2)] p-4 text-[var(--tx)]">
    <div className="mb-4 flex flex-wrap items-baseline gap-3"><div className="flex min-w-0 flex-wrap items-baseline gap-3"><h2 className="m-0 font-[var(--disp)] text-[19px] leading-tight font-bold">Worker comparison</h2><p className="m-0 text-xs leading-[1.4] text-[var(--tx3)]">{cameraName || 'Selected camera'} · {rangeLabel}</p></div><span className="ml-auto shrink-0 rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold text-[var(--violet)]">{workers.length} workers</span></div>
    {!workers.length ? <p className="rounded-xl border border-dashed border-[var(--bd2)] p-5 text-xs text-[var(--tx3)]">No worker packing activity for this camera and date range.</p> : <>
      <div className="grid grid-cols-1 gap-2.5 min-[501px]:grid-cols-2 min-[851px]:grid-cols-3 min-[1101px]:grid-cols-5">
        <Stat icon={CheckCircle2} title="Total workers" value={workers.length} detail={`${workers.filter((worker) => worker.completed).length} completed · ${total} boxes`} color="#10b981" lightBackground="linear-gradient(125deg,#d9fbe9,#f7fffb)" />
        <Stat icon={Boxes} title="Boxes packed" value={total} detail="Boxes packed in selected period" color="#3975e5" lightBackground="linear-gradient(125deg,#e2edff,#f9fbff)" />
        <Stat icon={Clock3} title="Team total time" value={formatPackingTotalTime(timedRows)} detail={`${timedRows.length} timed boxes`} color="#079c99" lightBackground="linear-gradient(125deg,#d7f5f2,#f8fdfd)" />
        <Stat icon={PackageCheck} title="Most boxes" value={mostBoxes.id} detail={`${mostBoxes.boxes} completed`} color="#c8661e" lightBackground="linear-gradient(125deg,#ffebd8,#fffaf5)" />
        <Stat icon={Trophy} title="Most time recorded" value={mostTime?.id || '—'} detail={mostTime ? formatPackingTotalTime(mostTime.rows) : 'No timing recorded'} color="#9634d4" lightBackground="linear-gradient(125deg,#f2e3ff,#fdfaff)" />
      </div>

  
      <div className="mt-3.5 grid min-w-0 grid-cols-1 gap-3.5 min-[851px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 overflow-hidden rounded-[13px] border border-[var(--bd)] bg-[var(--bg1solid)] p-[18px]">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[15px] leading-[1.3] font-extrabold">Boxes counted per worker</div><p className="mt-1.5 mb-0 text-[11px] leading-[1.4] text-[var(--tx3)]">Completed boxes for each worker in the selected period</p></div><span className="ml-auto shrink-0 whitespace-nowrap text-[11px] font-bold text-[var(--violet)]">{total} boxes</span></div>
          <WorkerBarChart workers={chartWorkers} total={total} maximum={chartCeiling} onHover={showWorkerTooltip} onLeave={() => setHovered(null)} />
        </div>
        <div className="min-w-0 overflow-hidden rounded-[13px] border border-[var(--bd)] bg-[var(--bg1solid)] p-[18px]">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[15px] leading-[1.3] font-extrabold">Share of boxes packed</div><p className="mt-1.5 mb-0 text-[11px] leading-[1.4] text-[var(--tx3)]">Share of completed boxes in the selected period</p></div><span className="ml-auto shrink-0 whitespace-nowrap text-[11px] font-bold text-[var(--violet)]">{total} boxes</span></div>
          <div className="flex min-h-[260px] flex-wrap items-center justify-center gap-7 pt-4 max-[500px]:gap-3">
            <div role="img" aria-label={`Share of ${total} boxes by worker`} className="relative size-[150px] shrink-0 rounded-full shadow-[0_8px_22px_rgba(0,0,0,.18)]" style={{ background: `conic-gradient(${donutSegments.join(', ')})` }}>
              <div className="absolute top-1/2 left-1/2 flex size-[88px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-[var(--bg1solid)] text-[var(--tx)]"><strong className="text-[22px] leading-tight">{total}</strong><span className="text-[9px] text-[var(--tx3)]">Total boxes</span></div>
              <svg viewBox="0 0 150 150" className="absolute inset-0 size-full" aria-label="Worker shares">{workers.reduce(({ offset, circles }, worker) => {
                const length = worker.boxes / total * 2 * Math.PI * 60;
                circles.push(<circle key={worker.id} cx="75" cy="75" r="60" fill="none" stroke="transparent" strokeWidth="30" strokeDasharray={`${length} ${2 * Math.PI * 60}`} strokeDashoffset={-offset} transform="rotate(-90 75 75)" style={{ cursor: 'pointer' }} role="img" aria-label={`${worker.id}: ${worker.boxes} boxes, ${Math.round(worker.boxes / total * 100)}% of total`} tabIndex={0} onMouseEnter={(event) => showWorkerTooltip(worker, event)} onMouseMove={(event) => showWorkerTooltip(worker, event)} onMouseLeave={() => setHovered(null)} onFocus={(event) => showWorkerTooltip(worker, event)} onBlur={() => setHovered(null)} />);
                return { offset: offset + length, circles };
              }, { offset: 0, circles: [] }).circles}</svg>
            </div>
            <div className="grid max-h-[190px] w-[190px] min-w-0 max-w-full content-start gap-1 overflow-x-hidden overflow-y-auto pr-1 [overscroll-behavior:contain] [scrollbar-color:var(--bd2)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]" role="region" aria-label="Worker box shares" tabIndex={0}>{workers.map((worker) => <div key={worker.id} tabIndex={0} aria-label={`${worker.id}: ${worker.boxes} boxes, ${Math.round(worker.boxes / total * 100)} percent of total`} onMouseEnter={(event) => showWorkerTooltip(worker, event)} onMouseMove={(event) => showWorkerTooltip(worker, event)} onMouseLeave={() => setHovered(null)} onFocus={(event) => showWorkerTooltip(worker, event)} onBlur={() => setHovered(null)} className="flex min-h-[29px] min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-[11px] text-[var(--tx)] hover:bg-[var(--bg2)] focus-visible:outline-2 focus-visible:outline-[var(--violet)]"><span className="size-[9px] shrink-0 rounded-full" style={{ background: worker.color }} /><span className="flex-1 truncate">{worker.id}</span><strong className="ml-auto">{worker.boxes}</strong><em className="not-italic text-[var(--tx3)]">({Math.round(worker.boxes / total * 100)}%)</em></div>)}</div>
          </div>
        </div>
      </div>
      <div className="mt-3.5 overflow-hidden rounded-[13px] border border-[var(--bd)] bg-[var(--bg1solid)]">
        <div className="flex min-h-[68px] items-center gap-3 border-b border-[var(--bd)] bg-[var(--bg2)] px-[18px] py-3.5"><span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-violet-500/10 text-[var(--violet)]"><Gauge size={16} /></span><div className="flex min-w-0 flex-col gap-1"><h3 className="m-0 font-[var(--disp)] text-sm leading-tight font-bold text-[var(--tx)]">Worker performance</h3><span className="text-[11px] leading-[1.35] text-[var(--tx2)]">Compare boxes packed and total packing time</span></div></div>
        <div className="max-h-[360px] overflow-auto"><table className="w-full min-w-[650px] border-separate border-spacing-y-1.5 px-2 text-[11px]">
          <thead><tr>{columns.map(([key, title]) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} className="sticky top-0 z-[2] bg-[var(--bg2)] px-2.5 py-2 text-left"><button type="button" onClick={() => toggleSort(key)} className={`inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[9px] font-extrabold uppercase tracking-[.04em] hover:text-[var(--violet)] ${sort.key === key ? 'text-[var(--violet)]' : 'text-[var(--tx3)]'}`} title={`Sort by ${title}`} aria-label={`Sort by ${title}, ${sort.key === key ? sort.direction : 'not sorted'}`}><span>{title}</span>{sort.key === key ? sort.direction === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} aria-hidden="true" /> : <ArrowDown size={13} strokeWidth={2.5} aria-hidden="true" /> : <ArrowUpDown size={13} aria-hidden="true" />}</button></th>)}</tr></thead>
          <tbody>{sorted.map((worker) => <tr key={worker.id} className="group">
            <td className="h-14 rounded-l-[10px] border-y border-l-[3px] border-y-[var(--bd)] bg-[var(--bg1solid)] px-2.5 py-2 transition-colors group-hover:bg-[var(--bg2)]" style={{ borderLeftColor: worker.color }}><div className="flex items-center gap-2.5 whitespace-nowrap font-extrabold"><span className="grid size-[27px] shrink-0 place-items-center rounded-lg text-[10px] text-white" style={{ background: worker.color }}>{worker.id.slice(0, 2)}</span><span>{worker.id}</span></div></td>
            <td className="h-14 border-y border-[var(--bd)] bg-[var(--bg1solid)] px-2.5 py-2 transition-colors group-hover:bg-[var(--bg2)]"><span className="text-sm font-extrabold">{worker.boxes}</span></td>
            <td className="h-14 rounded-r-[10px] border-y border-r border-[var(--bd)] bg-[var(--bg1solid)] px-2.5 py-2 transition-colors group-hover:bg-[var(--bg2)]"><div className="inline-flex min-w-[132px] items-center gap-2.5 rounded-lg border px-2.5 py-1.5" style={{ borderColor: `color-mix(in srgb, ${worker.color} 30%, var(--bd))`, background: `color-mix(in srgb, ${worker.color} 8%, var(--bg1solid))` }}><span className="grid place-items-center" style={{ color: worker.color }}><Clock3 size={18} aria-hidden="true" /></span><span><strong className="block text-[15px] leading-tight">{formatPackingTotalTime(worker.rows)}</strong><small className="mt-0.5 block text-[9px] text-[var(--tx3)]">{worker.timedCount ? `${worker.timedCount} timed box${worker.timedCount === 1 ? '' : 'es'}` : 'No timing recorded'}</small></span></div></td>
          </tr>)}</tbody>
        </table></div>
       
      </div>

    </>}
    <WorkerTooltip worker={hovered?.worker} total={total} x={hovered?.x} y={hovered?.y} />
  </section>;
}
