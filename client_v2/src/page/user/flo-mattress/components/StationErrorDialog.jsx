import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';
import { matchesEscapeShortcut, matchesSpaceShortcut } from '../stationIntegration';
import FloButton from './FloButton';

export default function StationErrorDialog({ error, onDismiss }) {
  useEffect(() => {
    if (!error) return undefined;
    const onKeyDown = (event) => {
      const escapePressed = matchesEscapeShortcut(event);
      const spacePressed = matchesSpaceShortcut(event);
      if (!escapePressed && !spacePressed) return;
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (spacePressed && event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onDismiss();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [error, onDismiss]);

  if (!error) return null;
  const isConnectivityError = error.errorType === 'network-or-cors';
  const isUploadError = String(error.stage || '').includes('upload');
  const isMeasurementServiceError = String(error.stage || '').includes('measurement-start');
  const isMeasurementTimeout = error.stage === 'ds-measurement-timeout';
  const title = isMeasurementTimeout
    ? 'Something went wrong while waiting for the measurement'
    : isUploadError
    ? 'Capture upload could not be completed'
    : (isMeasurementServiceError && isConnectivityError
      ? 'Measurement service connection failed'
      : (isMeasurementServiceError ? 'Measurement could not be started' : 'QR image could not be processed'));
  const message = isMeasurementTimeout
    ? ''
    : isUploadError
    ? 'The camera image could not be saved. Please try again.'
    : isMeasurementServiceError
    ? 'The measurement could not be started. Please make sure the camera area is clear and try again.'
    : 'The QR code could not be read. Keep the complete QR clear inside the guide and try again.';

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/70 px-5 backdrop-blur-md">
      <section role="alertdialog" aria-modal="true" aria-label="Measurement failed" className="w-full max-w-xl rounded-2xl border border-red-400/30 bg-slate-950 p-6 text-white shadow-2xl">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-500/15 text-red-400"><AlertTriangle className="h-6 w-6" /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{title}</h2>
            {message && <p className="mt-2 text-sm leading-6 text-slate-300">{message}</p>}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <FloButton icon={X} shortcut="Space" className="ml-auto !min-h-10" onClick={onDismiss}>
            Dismiss (Space / Esc)
          </FloButton>
        </div>
      </section>
    </div>
  );
}
