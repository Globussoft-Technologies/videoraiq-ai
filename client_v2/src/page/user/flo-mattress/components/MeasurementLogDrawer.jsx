import { ClipboardList, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  clearQrScanDiagnostics,
  dimensionsFromCustomSize,
  dimensionsFromSku,
  fetchMeasurementIncidentLog,
  readMeasurementLog,
  readQrScanDiagnostics,
} from '../stationIntegration';
import FloButton from './FloButton';

function firstValue(source, keys, fallback = '') {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function metadataFor(entry) {
  const source = entry?.qrMetadata && typeof entry.qrMetadata === 'object' ? entry.qrMetadata : {};
  const raw = String(firstValue(source, ['raw', 'rawPayload', 'raw_payload', 'qrText'], ''));
  const parts = raw.split('*').map((part) => part.trim());
  const decoded = parts.length === 5 ? {
    ref_no: parts[0], sales_order: parts[1], order_item: parts[2], sku: parts[3], size_type: parts[4],
  } : {};
  return { ...decoded, ...source, raw };
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function measuredValue(data, axis) {
  const source = data && typeof data === 'object' ? data : {};
  const dimensions = source.dimensions && typeof source.dimensions === 'object' ? source.dimensions : source;
  const alternate = axis === 'width' ? 'breadth' : axis;
  const candidate = dimensions[axis] ?? dimensions[alternate] ?? source[axis] ?? source[alternate];
  return candidate && typeof candidate === 'object'
    ? numeric(firstValue(candidate, ['measured', 'actual', 'value']))
    : numeric(candidate);
}

function printedValue(metadata, axis) {
  return numeric(metadata[axis] ?? metadata[axis === 'width' ? 'breadth' : axis]);
}

function formatValue(value) {
  return value == null ? '—' : Number(value).toFixed(2);
}

function formatTriple(values) {
  return `${formatValue(values.length)} × ${formatValue(values.width)} × ${formatValue(values.height)}″`;
}

function signed(value) {
  if (value == null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function rowDetails(entry) {
  const metadata = metadataFor(entry);
  const skuDimensions = dimensionsFromSku(firstValue(metadata, ['sku_variant', 'skuVariant', 'sku']));
  const customDimensions = dimensionsFromCustomSize(firstValue(metadata, ['size_type', 'sizeType']));
  const printed = {
    length: numeric(customDimensions.length) ?? numeric(skuDimensions.length) ?? printedValue(metadata, 'length'),
    width: numeric(customDimensions.breadth) ?? numeric(skuDimensions.breadth) ?? printedValue(metadata, 'width'),
    height: numeric(customDimensions.height) ?? numeric(skuDimensions.height) ?? printedValue(metadata, 'height'),
  };
  const measured = {
    length: measuredValue(entry.measuredData, 'length'),
    width: measuredValue(entry.measuredData, 'width'),
    height: measuredValue(entry.measuredData, 'height'),
  };
  const deltas = {
    length: printed.length != null && measured.length != null ? measured.length - printed.length : null,
    width: printed.width != null && measured.width != null ? measured.width - printed.width : null,
    height: printed.height != null && measured.height != null ? measured.height - printed.height : null,
  };
  const complete = Object.values(printed).every((value) => value != null)
    && Object.values(measured).every((value) => value != null);
  const matches = complete && Math.abs(deltas.length) <= 1
    && Math.abs(deltas.width) <= 1 && Math.abs(deltas.height) <= 0.5;
  return { metadata, printed, measured, deltas, complete, matches };
}

function localEntryToIncident(entry) {
  return {
    _id: entry.id,
    status: entry.status,
    statusUpdatedAt: entry.decidedAt,
    updatedAt: entry.decidedAt,
    qrMetadata: entry.qrMetadata || {},
    measuredData: entry.measuredData || {},
  };
}

export default function MeasurementLogDrawer({ open, onClose, station, escapeBehavior = 'close' }) {
  const [entries, setEntries] = useState([]);
  const [scanDiagnostics, setScanDiagnostics] = useState(readQrScanDiagnostics);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('api');
  const [loadError, setLoadError] = useState('');

  const loadEntries = useCallback(async (signal) => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await fetchMeasurementIncidentLog(station, signal);
      setEntries(result.items);
      setSource('api');
    } catch (error) {
      if (error.name === 'AbortError') return;
      setEntries(readMeasurementLog().map(localEntryToIncident));
      setSource('terminal fallback');
      setLoadError(error.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [station]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setScanDiagnostics(readQrScanDiagnostics());
    loadEntries(controller.signal);
    const syncScans = (event) => setScanDiagnostics(event.detail || readQrScanDiagnostics());
    window.addEventListener('videoraiq:qr-scan-diagnostic', syncScans);
    return () => {
      controller.abort();
      window.removeEventListener('videoraiq:qr-scan-diagnostic', syncScans);
    };
  }, [loadEntries, open]);

  if (!open) return null;
  const grid = 'grid-cols-[76px_120px_minmax(230px,1.35fr)_minmax(190px,1fr)_125px_125px_120px_80px_100px]';

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/65 backdrop-blur-sm" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Measurement log" className="flex max-h-[72vh] min-h-[300px] w-full flex-col overflow-hidden rounded-t-xl border border-[var(--bd2)] bg-[var(--bg1solid)] text-[var(--tx)] shadow-[0_-24px_70px_rgba(0,0,0,.4)]" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-[var(--bd)] px-5">
          <ClipboardList className="h-4 w-4 text-violet-500" />
          <h2 className="text-[17px] font-bold">Measurement Log</h2>
          <span className="rounded-md border border-[var(--bd2)] bg-[var(--bg2)] px-2 py-1 font-mono text-[9px] text-[var(--tx3)]">{entries.length} records</span>
          <span className="text-xs text-[var(--tx3)]">from Measurement Incidents · {source}</span>
          {loadError && <span title={loadError} className="truncate text-[10px] text-amber-500">API unavailable — showing terminal cache</span>}
          <button type="button" className="ml-auto rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--tx3)] hover:bg-[var(--bg2)] hover:text-[var(--tx)]" onClick={() => setShowDiagnostics((current) => !current)}>Scanner diagnostics ({scanDiagnostics.length})</button>
          <button type="button" disabled={loading} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-500 disabled:opacity-50" onClick={() => loadEntries()}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </header>

        {showDiagnostics && (
          <div className="shrink-0 border-b border-[var(--bd)] bg-[var(--bg2)] px-5 py-2">
            <div className="mb-1 flex items-center"><strong className="text-[10px] uppercase">QR scanner diagnostics</strong><button type="button" className="ml-auto text-[10px] text-blue-500" onClick={clearQrScanDiagnostics}>Clear diagnostics</button></div>
            {scanDiagnostics.length === 0 ? <p className="text-[10px] text-[var(--tx3)]">No unreadable scanner frames recorded.</p> : (
              <div className="flex gap-2 overflow-x-auto">{scanDiagnostics.slice(0, 8).map((entry) => <div key={entry.timestamp} className="flex shrink-0 items-center gap-2 rounded border border-[var(--bd)] bg-[var(--bg1solid)] px-2.5 py-1.5 font-mono text-[9px]"><span>{new Date(entry.timestamp).toLocaleTimeString()}</span><span className={`font-bold ${entry.result === 'QR_DECODE_ERROR' ? 'text-red-500' : 'text-amber-500'}`}>{entry.result || 'NO_QR_DETECTED'}</span><span className="text-[var(--tx3)]">{entry.attempts?.length || 0} passes</span></div>)}</div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[1300px]">
            <div className={`sticky top-0 z-10 grid ${grid} gap-3 border-b border-[var(--bd)] bg-[var(--bg2)] px-5 py-2 font-mono text-[8px] font-bold uppercase tracking-[.12em] text-[var(--tx3)]`}><span>Time</span><span>Order</span><span>QR code · Ref</span><span>SKU · Model</span><span>Printed</span><span>Measured</span><span>Δ L / W / H</span><span>System</span><span>Your call</span></div>
            {loading && entries.length === 0 ? <div className="px-5 py-12 text-center text-sm text-[var(--tx3)]">Loading Measurement Incidents…</div> : entries.length === 0 ? <div className="px-5 py-12 text-center text-sm text-[var(--tx3)]">No Measurement Incidents found for this station.</div> : entries.map((entry) => {
              const { metadata, printed, measured, deltas, complete, matches } = rowDetails(entry);
              const order = firstValue(metadata, ['sales_order', 'salesOrder', 'order_id', 'orderId'], '—');
              const orderItem = firstValue(metadata, ['order_item', 'orderItem'], '');
              const ref = firstValue(metadata, ['ref_no', 'refNo'], '—');
              const sku = firstValue(metadata, ['sku', 'skuCode'], entry.qrSku || '—');
              const model = firstValue(metadata, ['model', 'product_model', 'productModel'], '');
              const timestamp = entry.statusUpdatedAt || entry.dsProcessedAt || entry.updatedAt || entry.createdAt;
              const statusTone = entry.status === 'accepted' ? 'bg-emerald-500' : entry.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500';
              return <div key={entry._id || entry.id} className={`grid ${grid} min-h-[54px] items-center gap-3 border-b border-[var(--bd)] px-5 py-2 text-[10px]`}>
                <span className="font-mono text-[var(--tx3)]">{timestamp ? new Date(timestamp).toLocaleTimeString([], { hour12: false }) : '—'}</span>
                <strong className="truncate font-mono text-[11px] text-[var(--tx2)]">{String(order)}</strong>
                <span className="min-w-0 font-mono"><strong className="block truncate text-[11px]">{orderItem ? `${sku}-${orderItem}` : sku}</strong><small className="block truncate text-[8px] text-[var(--tx3)]">REF {String(ref)}</small></span>
                <span className="min-w-0"><strong className="block truncate font-mono text-[11px]">{String(sku)}</strong>{model && <small className="block truncate text-[9px] uppercase text-[var(--tx3)]">{String(model)}</small>}</span>
                <span className="font-mono text-[10px] text-[var(--tx2)]">{formatTriple(printed)}</span>
                <strong className="font-mono text-[10px]">{formatTriple(measured)}</strong>
                <strong className={`font-mono text-[9px] ${complete ? (matches ? 'text-emerald-500' : 'text-red-500') : 'text-[var(--tx3)]'}`}>{signed(deltas.length)} / {signed(deltas.width)} / {signed(deltas.height)}</strong>
                <strong className={`font-mono text-[9px] ${complete ? (matches ? 'text-emerald-500' : 'text-red-500') : 'text-[var(--tx3)]'}`}>{complete ? (matches ? 'MATCH' : 'MISMATCH') : 'WAIT'}</strong>
                <span className={`rounded-md px-2 py-1.5 text-center font-mono text-[9px] font-bold uppercase text-white ${statusTone}`}>{entry.status || 'pending'}</span>
              </div>;
            })}
          </div>
        </div>
        <footer className="flex min-h-14 shrink-0 items-center border-t border-[var(--bd)] bg-[var(--bg2)] px-5"><span className="font-mono text-[9px] uppercase text-[var(--tx3)]">{escapeBehavior === 'reset' ? 'Press L to close · Esc resets the unit' : 'Press L or Esc to close'}</span><FloButton icon={X} variant="soft" onClick={onClose} className="ml-auto !min-h-9">Close log</FloButton></footer>
      </section>
    </div>
  );
}
