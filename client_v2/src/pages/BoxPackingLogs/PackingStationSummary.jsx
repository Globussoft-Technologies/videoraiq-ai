import { useEffect, useRef } from 'react';
import { Camera, Check, Users } from 'lucide-react';
import { label, OpBadge } from '@/pages/SolderLine/ui';

export default function PackingStationSummary({ stations, selected, onSelect }) {
  const gridRef = useRef(null);
  const selectedRef = useRef(null);
  const index = Math.max(0, Math.min(selected, stations.length - 1));
  const station = stations[index];
  const workers = station?.workers || [];

  useEffect(() => {
    const grid = gridRef.current;
    const active = selectedRef.current;
    if (!grid || !active) return;
    const gridRect = grid.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.top < gridRect.top) grid.scrollTop -= gridRect.top - activeRect.top;
    else if (activeRect.bottom > gridRect.bottom) grid.scrollTop += activeRect.bottom - gridRect.bottom;
  }, [index, stations.length]);

  if (!stations.length) return null;

  return <div
    className="grid h-[320px] w-full grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-2xl border border-[rgba(99,102,241,.24)] p-3.5 shadow-[0_10px_24px_rgba(79,70,229,.09)] min-[600px]:h-[260px] min-[600px]:grid-cols-2 min-[600px]:grid-rows-[auto_minmax(0,1fr)] min-[1100px]:h-[136px] min-[1100px]:grid-cols-[minmax(190px,.8fr)_minmax(140px,.55fr)_minmax(0,2fr)] min-[1100px]:grid-rows-1"
    style={{ background: 'radial-gradient(circle at 12% 18%, rgba(59,130,246,.14), transparent 34%), radial-gradient(circle at 78% 12%, rgba(168,85,247,.11), transparent 36%), linear-gradient(110deg, rgba(59,130,246,.08), rgba(168,85,247,.07) 58%, rgba(34,211,238,.06))' }}
  >
    <div className="min-w-0 px-1 py-1">
      <div style={{ ...label, fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em' }}>VIEWING STATION</div>
      <div className="mt-2 flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-[rgba(59,130,246,.2)] bg-[rgba(59,130,246,.12)] text-[var(--blue)]"><Camera size={17} /></span>
        <strong className="min-w-0 truncate font-[var(--disp)] text-[17px]" title={station.name}>{station.name}</strong>
      </div>
      {station.nvrName && <div className="mt-1 truncate pl-[42px] text-[11px] text-[var(--tx2)]" title={station.nvrName}>{station.id === 'all' ? station.nvrName : `NVR: ${station.nvrName}`}</div>}
    </div>

    <div className="min-h-0 min-w-0 overflow-y-auto border-t border-[rgba(99,102,241,.18)] px-2 py-1 min-[600px]:border-t-0 min-[600px]:border-l min-[1100px]:border-r [scrollbar-width:thin]">
      <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5 }}><Users size={13} />WORKERS · {workers.length}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{workers.length ? workers.map((worker, i) => <OpBadge key={worker} op={i} code={worker} />) : <span className="text-[11px] text-[var(--tx3)]">No worker activity recorded</span>}</div>
    </div>

    <div className="flex min-h-0 min-w-0 flex-col px-1 py-1 min-[600px]:col-span-2 min-[1100px]:col-span-1">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div><div style={{ ...label, fontSize: 9.5, letterSpacing: '.12em' }}>CAMERAS</div><div className="mt-0.5 text-[11px] text-[var(--tx3)]">Select a camera station</div></div>
        <span className="shrink-0 rounded-full bg-[rgba(59,130,246,.1)] px-2 py-1 text-[10px] text-[var(--blue)]">{index + 1} / {stations.length}</span>
      </div>
      <div ref={gridRef} role="group" aria-label="Available cameras" tabIndex={0} className="grid min-h-0 min-w-0 flex-1 auto-rows-min grid-cols-1 content-start gap-2 overflow-x-hidden overflow-y-auto pr-1 min-[600px]:grid-cols-2 min-[1400px]:grid-cols-3 [scrollbar-width:thin]">
        {stations.map((item, i) => {
          const active = i === index;
          return <button
            key={item.id}
            ref={active ? selectedRef : null}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(i)}
            className="flex min-h-[42px] min-w-0 items-center gap-2 rounded-[9px] border px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
            style={{ cursor: 'pointer', borderColor: active ? '#1d4ed8' : 'var(--bd2)', color: active ? '#fff' : 'var(--tx2)', background: active ? 'linear-gradient(135deg, #1d4ed8, #9333ea)' : 'rgba(255,255,255,.9)', boxShadow: active ? '0 7px 16px rgba(29,78,216,.28)' : '0 1px 2px rgba(15,23,42,.04)' }}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--bg1)] text-[10px] font-bold text-[var(--tx3)]" style={active ? { color: '#4f46e5', background: '#fff' } : undefined}>
              {active ? <Check size={14} strokeWidth={3} /> : String(i + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0"><strong className="block truncate text-[11px]" title={item.name}>{item.name}</strong>{item.nvrName && <span className="mt-0.5 block truncate text-[9px] opacity-75" title={item.nvrName}>{item.nvrName}</span>}</span>
          </button>;
        })}
      </div>
    </div>
  </div>;
}
