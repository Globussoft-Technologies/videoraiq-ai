import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { cameraId, isCameraOnline, resolvePiUrl } from '../stationIntegration';

const MAX_RETRY_DELAY_MS = 8000;
const CONNECT_TIMEOUT_MS = 10000;

function retryUrl(url, retryKey) {
  if (!url || retryKey === 0) return url;
  try {
    const next = new URL(url);
    next.searchParams.set('vqRetry', `${Date.now()}-${retryKey}`);
    return next.toString();
  } catch {
    return url;
  }
}

function LiveCameraFeed({ camera, piApi }) {
  const id = cameraId(camera);
  const online = isCameraOnline(camera);
  const baseStreamUrl = useMemo(
    () => (id ? resolvePiUrl(piApi, camera?.stream_url, `/api/cameras/${encodeURIComponent(id)}/stream`) : ''),
    [camera?.stream_url, id, piApi],
  );
  const [retryKey, setRetryKey] = useState(0);
  const [streamState, setStreamState] = useState(baseStreamUrl ? 'connecting' : 'waiting');
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef();
  const streamUrl = useMemo(() => retryUrl(baseStreamUrl, retryKey), [baseStreamUrl, retryKey]);

  const retryNow = useCallback(() => {
    window.clearTimeout(retryTimerRef.current);
    setStreamState('connecting');
    setRetryKey((current) => current + 1);
  }, []);

  const scheduleRetry = useCallback(() => {
    window.clearTimeout(retryTimerRef.current);
    retryCountRef.current += 1;
    const delay = Math.min(1000 * (2 ** (retryCountRef.current - 1)), MAX_RETRY_DELAY_MS);
    setStreamState('retrying');
    retryTimerRef.current = window.setTimeout(retryNow, delay);
  }, [retryNow]);

  useEffect(() => {
    window.clearTimeout(retryTimerRef.current);
    retryCountRef.current = 0;
    setRetryKey(0);
    setStreamState(baseStreamUrl ? 'connecting' : 'waiting');
    return () => window.clearTimeout(retryTimerRef.current);
  }, [baseStreamUrl]);

  useEffect(() => {
    if (!streamUrl) return undefined;
    retryTimerRef.current = window.setTimeout(scheduleRetry, CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(retryTimerRef.current);
  }, [scheduleRetry, streamUrl]);

  const onStreamLoad = useCallback(() => {
    window.clearTimeout(retryTimerRef.current);
    retryCountRef.current = 0;
    setStreamState('live');
  }, []);

  return (
    <section className="flex h-full min-h-[500px] flex-col overflow-hidden rounded-2xl border border-[#dfe3ec] bg-[#4b4d50] dark:border-[var(--bd)]">
      <div className="flex min-h-[48px] items-center justify-between gap-3 border-b border-[var(--bd)] bg-[#fbfcff] px-4 py-2 dark:bg-[var(--bg1)]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-300 shadow-[0_0_8px_rgba(252,165,165,.75)]" />
          <h2 className="text-sm font-bold text-[var(--tx)]">QR Camera Stream</h2>
          <span className="rounded border border-[var(--bd2)] bg-[var(--bg2)] px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--tx3)]">
            {id || 'Waiting'}{camera?.kind ? ` - ${camera.kind}` : ''}
          </span>
        </div>
        <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${streamState === 'live' ? 'text-emerald-500' : 'text-amber-500'}`}>
          {streamState === 'live' ? 'Live' : streamState === 'retrying' ? 'Retrying' : 'Connecting'}
        </span>
      </div>

      <div className="relative flex-1 bg-[#4b4d50]">
        {streamUrl && (
          <img
            src={streamUrl}
            alt={`Live stream from camera ${id}`}
            onLoad={onStreamLoad}
            onError={scheduleRetry}
            decoding="async"
            className={`absolute inset-0 h-full w-full object-contain ${streamState === 'live' ? 'vq-qr-camera-focus' : ''}`}
          />
        )}
        {streamState !== 'live' && (
          <>
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:36px_36px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.35),rgba(2,6,23,0.86))]" />
          </>
        )}
        {streamState !== 'live' && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-sm font-semibold text-white/70">
              {streamState === 'connecting' && <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />}
              <span>{streamState === 'retrying' ? 'Stream unavailable - retrying automatically' : 'Waiting for Pi camera stream'}</span>
              {baseStreamUrl && streamState === 'retrying' && (
                <button type="button" onClick={retryNow} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/15">
                  <RotateCw className="h-3.5 w-3.5" /> Retry now
                </button>
              )}
            </div>
          </div>
        )}

        {streamState === 'live' && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 aspect-square w-[clamp(180px,24%,230px)] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
            <div className="vq-qr-focus-frame absolute inset-0">
              <span className="absolute inset-2 rounded-xl border border-emerald-300/20 shadow-[0_0_0_9999px_rgba(2,6,23,.13),0_0_28px_rgba(52,211,153,.22)]" />
              <span className="vq-qr-focus-ring absolute inset-3 rounded-lg border border-emerald-300/35" />
              <span className="vq-qr-scan-beam absolute left-4 right-4 top-4 h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_10px_2px_rgba(52,211,153,.9)]" />
              <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-md border-l-2 border-t-2 border-emerald-400" />
              <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-md border-r-2 border-t-2 border-emerald-400" />
              <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-md border-b-2 border-l-2 border-emerald-400" />
              <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-md border-b-2 border-r-2 border-emerald-400" />
            </div>
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded-md bg-emerald-400 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-slate-950 shadow-[0_5px_18px_rgba(16,185,129,.3)]">
              Align QR to scan
            </span>
          </div>
        )}

        <div className="absolute inset-x-3 bottom-3 flex min-h-8 flex-wrap items-center justify-between gap-3 rounded-md bg-[#17181b]/95 px-3 py-2 text-white">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
            {streamState === 'live' ? 'Automatic QR scan active' : streamState === 'retrying' ? 'Reconnecting to camera' : online ? 'Connecting to camera' : 'Waiting for camera'}
          </div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">
            {streamState === 'live' ? 'Place label here · S for manual capture' : id || 'No camera detected'}
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(LiveCameraFeed);
