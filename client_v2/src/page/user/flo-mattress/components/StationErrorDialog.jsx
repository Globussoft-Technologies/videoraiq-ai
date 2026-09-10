import { AlertTriangle, Clipboard, X } from 'lucide-react';
import { useEffect } from 'react';
import { matchesEscapeShortcut } from '../stationIntegration';
import FloButton from './FloButton';

export default function StationErrorDialog({ error, onDismiss }) {
  useEffect(() => {
    if (!error) return undefined;
    const onKeyDown = (event) => {
      if (!matchesEscapeShortcut(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onDismiss();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [error, onDismiss]);

  if (!error) return null;
  const diagnosticText = JSON.stringify(error, null, 2);
  const isConnectivityError = error.errorType === 'network-or-cors';
  const isUploadError = String(error.stage || '').includes('upload');
  const isMeasurementServiceError = String(error.stage || '').includes('measurement-start');
  const title = isUploadError
    ? 'Capture upload could not be completed'
    : (isMeasurementServiceError && isConnectivityError
      ? 'Measurement service connection failed'
      : (isMeasurementServiceError ? 'Measurement could not be started' : 'QR image could not be processed'));

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/70 px-5 backdrop-blur-md">
      <section role="alertdialog" aria-modal="true" aria-label="Measurement failed" className="w-full max-w-xl rounded-2xl border border-red-400/30 bg-slate-950 p-6 text-white shadow-2xl">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-500/15 text-red-400"><AlertTriangle className="h-6 w-6" /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{error.message}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4 font-mono text-xs">
          <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">Stage</dt><dd className="break-all text-slate-200">{error.stage}</dd></div>
          {error.endpoint && <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">Endpoint</dt><dd className="break-all text-cyan-300">{error.endpoint}</dd></div>}
          {error.status && <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">HTTP</dt><dd>{error.status}</dd></div>}
          {error.failureReason && <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">Reason</dt><dd className="break-all text-amber-200">{error.failureReason}</dd></div>}
          {error.serviceMessage && <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">DS message</dt><dd className="break-all text-slate-200">{error.serviceMessage}</dd></div>}
          <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">Time</dt><dd>{error.timestamp}</dd></div>
        </dl>

        <p className="mt-4 text-xs leading-5 text-amber-200">
          {isUploadError
            ? 'Check the backend capture endpoint and configured cloud provider. The measurement service is not called until the image and incident are saved.'
            : isMeasurementServiceError && isConnectivityError
            ? 'Postman does not enforce browser CORS. If Postman succeeds but this screen fails, allow this frontend origin in the measurement service and verify the endpoint uses the Pi LAN IP.'
            : isMeasurementServiceError
            ? 'The QR was decoded and saved, but the Pi measurement service did not accept the SKU. Check the endpoint response above.'
            : 'QR decoding happens locally in this browser. Keep the complete QR sharp and visible inside the green guide, then retry.'}
          {' '}Diagnostics are saved in localStorage under <code>videoraiq:station-errors</code>.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <FloButton icon={Clipboard} variant="soft" className="!min-h-10" onClick={() => navigator.clipboard?.writeText(diagnosticText)}>
            Copy details
          </FloButton>
          <FloButton icon={X} className="ml-auto !min-h-10" onClick={onDismiss}>
            Dismiss (Esc)
          </FloButton>
        </div>
      </section>
    </div>
  );
}
