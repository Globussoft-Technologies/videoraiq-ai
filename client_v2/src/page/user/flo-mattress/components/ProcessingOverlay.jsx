import { CheckCircle2, Loader2, QrCode, Ruler, UploadCloud } from 'lucide-react';

export default function ProcessingOverlay({ phase = 'qr', secondsRemaining, qrMetadata }) {
  const depthPhase = phase === 'depth';
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/65 px-5 backdrop-blur-md">
      <section role="status" aria-live="polite" className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-950/90 p-7 text-center text-white shadow-2xl">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-cyan-400" />
        <h2 className="mt-5 text-2xl font-bold">{depthPhase ? 'QR captured — depth sensing' : 'Processing QR label'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {depthPhase
            ? `QR data${qrMetadata?.sku ? ` for ${qrMetadata.sku}` : ''} is saved. Keep the mattress still while depth measurements are calculated.`
            : 'The JPG is being uploaded and checked. Please keep the mattress in position.'}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 text-left text-xs">
          {depthPhase ? (
            <>
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3"><CheckCircle2 className="mb-2 h-5 w-5 text-emerald-400" />QR captured and incident created</div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3"><Ruler className="mb-2 h-5 w-5 text-cyan-400" />Waiting for measured values</div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3"><UploadCloud className="mb-2 h-5 w-5 text-emerald-400" />Saving capture</div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3"><QrCode className="mb-2 h-5 w-5 text-cyan-400" />Extracting dimensions</div>
            </>
          )}
        </div>
        <div className="mt-6 font-mono text-sm font-bold uppercase tracking-[0.14em] text-cyan-300">
          {depthPhase
            ? (secondsRemaining > 0 ? `Estimated measurement time ${secondsRemaining}s` : 'Waiting for the depth measurement update…')
            : `QR request timeout in ${secondsRemaining}s`}
        </div>
      </section>
    </div>
  );
}
