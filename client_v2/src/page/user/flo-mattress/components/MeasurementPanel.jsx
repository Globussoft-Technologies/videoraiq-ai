import { Ruler, ScanLine } from 'lucide-react';
import { dimensionsFromCustomSize, dimensionsFromSku, resolveBackendImageUrl } from '../stationIntegration';

const firstValue = (object, keys) => keys.map((key) => object?.[key]).find((value) => value != null);
const shown = (value, fallback = '—') => value == null || value === '' ? fallback : String(value);
const numeric = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

function measurementRows(data, qrMetadata) {
  const source = data && typeof data === 'object' ? data : {};
  const dimensions = source.dimensions && typeof source.dimensions === 'object' ? source.dimensions : source;
  const skuDimensions = dimensionsFromSku(qrMetadata?.sku_variant ?? qrMetadata?.skuVariant ?? qrMetadata?.sku);
  const customDimensions = dimensionsFromCustomSize(qrMetadata?.size_type ?? qrMetadata?.sizeType);
  return [
    ['Length', 'length', 1],
    ['Width', 'width', 1],
    ['Height', 'height', 0.5],
  ].map(([label, axis, tolerance]) => {
    const item = dimensions[axis] && typeof dimensions[axis] === 'object' ? dimensions[axis] : {};
    const printed = numeric(firstValue(item, ['printed', 'expected', 'declared', 'label']))
      ?? numeric(customDimensions[axis === 'width' ? 'breadth' : axis])
      ?? numeric(skuDimensions[axis === 'width' ? 'breadth' : axis])
      ?? numeric(qrMetadata?.[axis === 'width' ? 'breadth' : axis]);
    const measured = numeric(firstValue(item, ['measured', 'actual', 'value']))
      ?? numeric(typeof dimensions[axis] !== 'object' ? dimensions[axis] : null)
      ?? (axis === 'width' ? numeric(source.breadth) : numeric(source[axis]));
    const difference = numeric(firstValue(item, ['difference', 'diff', 'delta']))
      ?? (printed != null && measured != null ? measured - printed : null);
    const passed = measured != null && difference != null && Math.abs(difference) <= tolerance;
    return { label, printed, measured, difference, tolerance, passed };
  });
}

export default function MeasurementPanel({ data, image, backendIp, qrMetadata, status = 'pending', secondsRemaining = 0 }) {
  const rows = measurementRows(data, qrMetadata);
  const complete = rows.every((row) => row.measured != null);
  const allPassed = complete && rows.every((row) => row.passed);
  const resolvedImage = resolveBackendImageUrl(image, backendIp);
  const measuredTriple = rows.map((row) => row.measured == null ? '—' : row.measured.toFixed(2)).join(' × ');

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--glass)] shadow-[0_18px_50px_rgba(15,23,42,.08)] backdrop-blur">
      <header className="flex min-h-11 shrink-0 items-center gap-3 border-b border-[var(--bd)] px-4 py-2">
        <Ruler className="h-4 w-4 text-cyan-500" />
        <div>
          <h2 className="text-[16px] font-bold leading-tight text-[var(--tx)]">Printed vs Measured</h2>
          <div className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-[.08em] text-[var(--tx)]">TOL ±1 in / ±0.5 in</div>
        </div>
        <div className={`ml-auto flex items-center gap-2.5 rounded-xl border px-3 py-1.5 ${complete ? `vq-measure-status-reveal ${allPassed ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-red-400/50 bg-red-500/10'}` : 'border-[var(--bd)] bg-[var(--bg2)]'}`}>
          <span className={`h-8 w-8 rounded-lg ${complete ? (allPassed ? 'bg-emerald-500' : 'bg-red-500') : 'animate-pulse bg-[var(--bg3)]'}`} />
          <span>
            <strong className="block text-[15px] leading-tight text-[var(--tx)]">{complete ? (allPassed ? 'Sizes match' : 'Size mismatch') : 'Measuring...'}</strong>
            <span className="block text-[9px] text-[var(--tx3)]">{complete ? (allPassed ? 'All three axes in tolerance' : 'One or more axes are outside tolerance') : (secondsRemaining > 0 ? `Estimated ${secondsRemaining}s remaining` : 'Waiting for values')}</span>
          </span>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-[130px_104px_minmax(0,1fr)_58px] gap-2 border-b border-[var(--bd)] bg-[var(--bg2)] px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-[var(--tx)]">
        <span className="whitespace-nowrap">Axis · on label</span><span>Measured</span><span>Diff vs tolerance</span><span className="text-right">Result</span>
      </div>
      <div className="shrink-0 divide-y divide-[var(--bd)]">
        {rows.map((row, index) => {
          const fraction = row.difference == null ? 0 : Math.max(-1, Math.min(1, row.difference / (row.tolerance * 2)));
          const width = Math.max(3, Math.abs(fraction) * 50);
          const color = row.measured == null ? 'bg-[var(--tx3)]' : row.passed ? 'bg-emerald-500' : 'bg-red-500';
          return (
            <div key={row.label} className={`grid h-[46px] grid-cols-[130px_104px_minmax(0,1fr)_58px] items-center gap-2 px-3.5 ${row.measured != null && !row.passed ? 'bg-red-500/5' : ''}`}>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-none text-[var(--tx)]">{row.label}</span>
                <span className="mt-1 flex items-baseline gap-1 font-mono text-[16px] font-bold text-[var(--tx)]">{row.printed == null ? '—' : row.printed.toFixed(2)} <small className="text-[10px] font-bold text-[var(--tx)]">in</small></span>
              </span>
              <span
                className={`flex items-center gap-1 font-mono text-[21px] font-bold text-[var(--tx)] ${row.measured != null ? 'vq-measure-value-reveal' : ''}`}
                style={row.measured != null ? { animationDelay: `${120 + index * 90}ms` } : undefined}
              >
                {row.measured == null
                  ? <span className="vq-measure-shimmer h-4 w-[72px] rounded-md" />
                  : <>{row.measured.toFixed(2)} <small className="text-[10px] font-bold text-[var(--tx)]">in</small></>}
              </span>
              <span
                className={`min-w-0 ${row.measured != null ? 'vq-measure-value-reveal' : ''}`}
                style={row.measured != null ? { animationDelay: `${120 + index * 90}ms` } : undefined}
              >
                {row.measured == null ? (
                  <>
                    <span className="flex items-center gap-2"><span className="vq-measure-shimmer h-2.5 w-8 rounded" /><span className="font-mono text-[10px] font-bold text-[var(--tx)]">tol ±{row.tolerance.toFixed(1)}</span></span>
                    <span className="vq-measure-shimmer mt-1 block h-1 w-full rounded" />
                  </>
                ) : (
                  <>
                    <span className={`font-mono text-[11px] font-bold ${row.passed ? 'text-emerald-500' : 'text-red-500'}`}>{row.difference == null ? '—' : `${row.difference >= 0 ? '+' : ''}${row.difference.toFixed(2)}`}</span>
                    <span className="ml-2 font-mono text-[10px] font-bold text-[var(--tx)]">tol ±{row.tolerance.toFixed(1)}</span>
                    <span className="relative mt-1 block h-1 overflow-hidden rounded bg-[var(--bg3)]">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--bd2)]" />
                      {row.difference != null && <span className={`absolute inset-y-0 rounded ${color}`} style={{ left: fraction >= 0 ? '50%' : `${50 - width}%`, width: `${width}%` }} />}
                    </span>
                  </>
                )}
              </span>
              <span
                className={`justify-self-end rounded-md border px-2.5 py-1 font-mono text-[9px] font-bold ${row.measured == null ? 'border-[var(--bd2)] text-[var(--tx3)]' : `vq-measure-result-reveal ${row.passed ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-red-500 bg-red-500/10 text-red-500'}`}`}
                style={row.measured != null ? { animationDelay: `${210 + index * 90}ms` } : undefined}
              >{row.measured == null ? 'WAIT' : row.passed ? 'PASS' : 'FAIL'}</span>
            </div>
          );
        })}
      </div>

      <div className="relative min-h-[120px] flex-1 overflow-hidden border-t border-[var(--bd)] bg-[var(--bg2)]">
        {resolvedImage ? <img src={resolvedImage} alt="Depth measurement result" className="vq-measure-image-reveal h-full w-full object-contain" /> : complete ? (
          <div className="grid h-full place-items-center text-sm font-semibold text-[var(--tx3)]">Measurement image unavailable</div>
        ) : (
          <div className="absolute inset-0 overflow-hidden" aria-label="Waiting for depth measurement data">
            <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,.13),transparent_38%)]" />
            <div className="vq-depth-frame absolute left-1/2 top-1/2 h-[42%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-cyan-400/45 shadow-[0_0_30px_rgba(34,211,238,.12)]">
              <span className="absolute left-0 top-0 h-5 w-5 rounded-tl border-l-2 border-t-2 border-cyan-400" />
              <span className="absolute right-0 top-0 h-5 w-5 rounded-tr border-r-2 border-t-2 border-cyan-400" />
              <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl border-b-2 border-l-2 border-cyan-400" />
              <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br border-b-2 border-r-2 border-cyan-400" />
              <span className="vq-depth-sweep absolute inset-x-3 top-3 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_9px_2px_rgba(34,211,238,.75)]" />
            </div>
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-500 shadow-[0_0_24px_rgba(34,211,238,.16)]"><ScanLine className="h-5 w-5" /></span>
              <strong className="text-sm text-[var(--tx)]">Analyzing depth measurement</strong>
              <span className="font-mono text-[9px] uppercase tracking-[.12em] text-[var(--tx3)]">Values and image will appear here</span>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-400/5" />
        {resolvedImage && <div className="pointer-events-none absolute inset-x-[13%] inset-y-[20%] rounded border border-cyan-400/80 shadow-[0_0_22px_rgba(34,211,238,.2)]" />}
        <div className="absolute inset-x-3 bottom-2 flex items-center rounded-lg border border-white/15 bg-slate-950/80 px-3 py-1.5 backdrop-blur">
          <strong className="font-mono text-[12px] text-white">{complete ? `${measuredTriple} IN` : 'measuring...'}</strong>
          <span className="ml-auto font-mono text-[8px] uppercase text-slate-400">STATUS <b className="text-slate-100">{shown(status)}</b></span>
        </div>
      </div>
    </section>
  );
}
