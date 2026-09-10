import { QrCode } from 'lucide-react';
import { resolveBackendImageUrl } from '../stationIntegration';

const shown = (value, fallback = '—') => value == null || value === '' ? fallback : String(value);
const dimension = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : shown(value);

function readTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour12: false });
}

export default function QrExtractedPanel({ metadata, response, readAt, image, backendIp }) {
  const source = metadata && typeof metadata === 'object' ? metadata : {};
  const resolvedImage = resolveBackendImageUrl(image, backendIp);
  const raw = source.raw || source.rawPayload || source.rawScanString || source.qrText || response?.raw || [
    source.ref_no,
    source.sales_order ?? source.salesOrder,
    source.order_item ?? source.orderItem,
    source.sku,
    source.size_type ?? source.sizeType,
  ].filter((value) => value != null && value !== '').join(' * ');
  const rows = [
    ['Production code', source.ref_no ?? source.refNo, 'Internal production code', 'bg-blue-400'],
    ['Sales order', source.sales_order ?? source.salesOrder, 'Sales order code', 'bg-violet-500'],
    ['Order item', source.order_item ?? source.orderItem, 'Sales order item code', 'bg-cyan-400'],
    ['SKU code', source.sku, 'Encodes the declared size', 'bg-amber-400'],
    ['Size type', source.size_type ?? source.sizeType, 'Order size classification', 'bg-emerald-500'],
  ];
  const presentCount = rows.filter(([, value]) => value !== '—').length;
  const declared = `${dimension(source.length)} × ${dimension(source.breadth ?? source.width)} × ${dimension(source.height)} in`;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--glass)] shadow-[0_18px_50px_rgba(15,23,42,.08)] backdrop-blur">
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-[var(--bd)] px-4">
        <QrCode className="h-4 w-4 text-blue-500" />
        <h2 className="text-[15px] font-semibold text-[var(--tx)]">QR Code Extracted</h2>
        <span className="rounded-md border border-emerald-500 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[.08em] text-emerald-500">{presentCount} / 5 PARTS</span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[.08em] text-[var(--tx3)]">READ {readTime(readAt)}</span>
      </header>

      <div className="flex shrink-0 gap-3 px-4 pt-3">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-[var(--bd2)] bg-white shadow-sm">
          {resolvedImage ? <img src={resolvedImage} alt="Captured QR label" className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center font-mono text-xs text-slate-400">QR</div>}
          <div className="absolute inset-x-0 bottom-0 bg-emerald-500/95 py-1 text-center font-mono text-[8px] font-bold tracking-[.08em] text-slate-950">SCANNED QR</div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 py-2">
            <div className="font-mono text-[8px] uppercase tracking-[.14em] text-[var(--tx3)]">Raw scan string</div>
            <div className="mt-1 truncate font-mono text-[10px] font-semibold text-blue-500">{raw || 'Waiting for QR payload...'}</div>
          </div>
          <div className="flex-1 rounded-lg border border-blue-400/35 bg-blue-500/10 px-3 py-2">
            <div className="font-mono text-[8px] uppercase tracking-[.14em] text-[var(--tx3)]">Declared size from QR</div>
            <div className="mt-1 font-mono text-[15px] font-bold text-[var(--tx)]">{declared}</div>
            <div className="mt-1 text-[10px] text-[var(--tx3)]">Measurements printed on the product label</div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col px-4 pb-3">
        <div className="grid shrink-0 grid-cols-[13px_112px_minmax(0,1fr)] gap-3 border-b border-[var(--bd)] px-0.5 py-2 font-mono text-[8px] uppercase tracking-[.12em] text-[var(--tx3)]">
          <span />
          <span>Part</span>
          <span>Value &amp; meaning</span>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-[var(--bd)]">
          {rows.map(([label, value, note, color]) => (
            <div key={label} className="grid h-[20%] min-h-11 grid-cols-[13px_112px_minmax(0,1fr)] items-center gap-3 px-0.5">
              <span className={`h-2 w-2 rounded-full ${color} shadow-[0_0_8px_currentColor]`} />
              <span className="font-mono text-[8px] uppercase tracking-[.08em] text-[var(--tx3)]">{label}</span>
              <span className="flex min-w-0 items-center gap-3">
                <strong className="truncate font-mono text-[13px] text-[var(--tx)]">{shown(value)}</strong>
                <span className="ml-auto truncate text-[10px] text-[var(--tx3)]">{note}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
