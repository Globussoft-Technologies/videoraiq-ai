import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, VideoOff, Maximize2, Minimize2 } from 'lucide-react';
import { getPlaybackUrl, getPlaybackSessionId } from '../../../helpers/playback';
import { getIncidentPreviewSettings, INCIDENT_PREVIEW_DEFAULTS } from '../../../helpers/administer';
import FullscreenZoomSurface from '../../../components/FullscreenZoomSurface';

/*
 * A short clip of the recording around one incident, played in place instead of
 * sending the user off to the Playback page.
 *
 * The window is the admin's own — Settings > Incident Preview — so an operator
 * who wants ten seconds of lead-in and ten after gets exactly that. Loading it
 * on click rather than with the card is deliberate: a grid shows a dozen
 * incidents at once, and each preview opens a real playback session on the
 * media server.
 *
 * The media server builds the HLS manifest asynchronously after playback-url
 * returns, so the first fetch commonly 404s. Same fixed-delay retry the
 * playback timeline uses, capped so a genuinely missing recording gives up
 * rather than spinning.
 */
const MANIFEST_RETRY_MS = 1000;
const MANIFEST_RETRY_LIMIT = 15;

/* Roughly the height a browser gives its own video control bar. */
const CONTROLS_BAND_PX = 46;

export default function IncidentPreviewModal({ item, channel, channelId, at, onClose }) {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const [url, setUrl] = useState('');
  const [state, setState] = useState('loading'); // loading | ready | none
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [window_, setWindow] = useState(INCIDENT_PREVIEW_DEFAULTS);

  const incidentAt = useMemo(() => {
    const parsed = new Date(at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [at]);

  /* Resolve a playable URL for [incident - before, incident + after]. */
  useEffect(() => {
    if (!channelId || !incidentAt) {
      setState('none');
      return undefined;
    }

    let cancelled = false;
    setState('loading');

    (async () => {
      try {
        const settings = await getIncidentPreviewSettings();
        if (cancelled) return;
        setWindow(settings);

        const startTime = new Date(incidentAt.getTime() - settings.beforeSeconds * 1000);
        const endTime = new Date(incidentAt.getTime() + settings.afterSeconds * 1000);

        // streamId is the NVR-native channel number, the same one the playback
        // timeline sends: the device needs it alongside our own Mongo id.
        const streamId = channel?.rtspChannels?.[0]?.id || channel?.channelId || '102';

        const resolved = await getPlaybackUrl({
          channelId,
          streamId,
          startTime,
          endTime,
          sessionId: getPlaybackSessionId(),
        });
        if (cancelled) return;

        if (!resolved) {
          setState('none');
          return;
        }
        setUrl(resolved);
      } catch {
        if (!cancelled) setState('none');
      }
    })();

    return () => { cancelled = true; };
  }, [channelId, incidentAt, channel]);

  /* Attach hls.js to whatever URL came back. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return undefined;

    // Raw RTSP (Tiandy and local-Tiandy branches) is not playable in a browser.
    if (/^rtsp:\/\//i.test(url)) {
      setState('none');
      return undefined;
    }

    let hls;
    let cancelled = false;
    let retryTimer = null;
    let attempts = 0;

    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;

      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          setState('ready');
        } else {
          setState('none');
        }
        return;
      }

      const attach = () => {
        if (cancelled) return;
        if (hls) { try { hls.destroy(); } catch { /* noop */ } }
        hls = new Hls({ maxBufferLength: 30 });
        hls.attachMedia(video);
        hls.loadSource(url);

        let firstFrag = false;
        hls.on(Hls.Events.FRAG_LOADED, () => {
          if (cancelled || firstFrag) return;
          firstFrag = true;
          setState('ready');
          video.play().catch(() => { /* autoplay blocked; controls are there */ });
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data?.fatal || cancelled) return;
          const status = data?.response?.status || data?.networkDetails?.status;
          if (status === 404 && attempts < MANIFEST_RETRY_LIMIT) {
            attempts += 1;
            retryTimer = setTimeout(attach, MANIFEST_RETRY_MS);
            return;
          }
          setState('none');
        });
      };

      attach();
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (hls) { try { hls.destroy(); } catch { /* noop */ } }
    };
  }, [url]);

  /*
   * Fullscreen belongs to the stage, not the video — the same thing the live
   * camera tile and the NVR grid do. A fullscreened <video> is promoted to the
   * top layer, where its containing block is the viewport and the zoom
   * surface's transform on an ancestor simply does not apply, so zoom goes
   * dead and the zoom toolbar (a sibling of the video) is not painted at all.
   * Fullscreening the stage keeps the whole surface inside the top-layer
   * element, so zoom, pan and the toolbar all survive.
   *
   * Redirecting after the fact does not work: the video's own button spends
   * the click's user activation on its own request, so requesting again for
   * the stage is refused and the user just sees fullscreen flash open and
   * shut. Hence the button on the stage rather than a handler that reacts.
   */
  useEffect(() => {
    const onChange = () => {
      const current = document.fullscreenElement;
      const stageFullscreen = current === stageRef.current;
      setIsFullscreen(stageFullscreen);

      if (current && current === videoRef.current) {
        // Firefox ignores controlsList, so its own button can still get here.
        // Move fullscreen onto the stage — best effort only: the click that
        // opened it has already spent its activation on the video's own
        // request, so the browser may well refuse this one. Failing that, the
        // exit at least leaves the user somewhere sane rather than zoomless.
        Promise.resolve(document.exitFullscreen?.())
          .then(() => stageRef.current?.requestFullscreen?.())
          .catch(() => { /* the stage button and Escape both still work */ });
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stageRef.current?.requestFullscreen?.();
  };

  /* Escape closes, matching the report modal. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // The first Escape leaves fullscreen; only the next one closes.
      if (document.fullscreenElement) return;
      onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /*
   * Once zoomed, the surface claims every pointerdown for drag-to-pan —
   * preventDefault plus a pointer capture — which would take the scrub bar
   * with it. The controls are in the shadow DOM and cannot be targeted, but
   * they sit in a fixed band at the bottom of the element, and offsetY is in
   * the element's own untransformed space, so the band is the same height at
   * any zoom level. Below it: the controls. Above it: pan as usual.
   */
  const keepControlsDraggable = (event) => {
    const video = videoRef.current;
    if (!video) return;
    if (event.nativeEvent.offsetY > video.clientHeight - CONTROLS_BAND_PX) {
      event.stopPropagation();
    }
  };

  const camName = channel?.customName || channel?.name || item?.channelData?.name || 'Camera';
  const totalSeconds = window_.beforeSeconds + window_.afterSeconds;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(6,9,15,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      {/* Two controls the browser paints that this player does not want: the
          volume, because recordings carry no audio, and fullscreen, because the
          browser's own one fullscreens the video element and kills zoom (the
          button by the zoom toolbar does it on the stage instead). controlsList
          is the documented way to drop fullscreen and does not take here, so
          both go through the shadow-DOM pseudo-elements. Chromium only —
          Firefox exposes no equivalent hook, and is handled by the redirect in
          the fullscreenchange listener. */}
      <style>{`
        .vq-preview-video::-webkit-media-controls-mute-button,
        .vq-preview-video::-webkit-media-controls-volume-slider,
        .vq-preview-video::-webkit-media-controls-volume-control-container,
        .vq-preview-video::-webkit-media-controls-fullscreen-button {
          display: none !important;
        }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 760, background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 16px 10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item?.incidentName || 'Incident preview'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
              {camName} · {totalSeconds}s around the incident
              {' '}({window_.beforeSeconds}s before, {window_.afterSeconds}s after)
            </div>
          </div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--tx3)', display: 'flex', flex: '0 0 auto' }}>
            <X size={18} />
          </span>
        </div>

        <div
          ref={stageRef}
          style={{
            position: 'relative',
            background: '#000',
            // A fixed 16/9 box in the modal; the whole viewport in fullscreen.
            ...(isFullscreen ? { width: '100vw', height: '100vh' } : { aspectRatio: '16 / 9' }),
          }}
        >
          {/* Same scroll-to-zoom / drag-to-pan surface the live wall and playback
              use, so a plate or a face in the clip can be read without leaving
              the card. resetKey returns it to 1x whenever a different incident
              is opened. */}
          <FullscreenZoomSurface
            enabled
            resetKey={item?._id || item?.id || url}
            toolbarStyle={{ right: 58 }}
          >
            <video
              ref={videoRef}
              controls
              className="vq-preview-video"
              // Both of these would make the video itself the fullscreen or
              // picture-in-picture element, and the zoom surface cannot
              // transform it there. The stage button below does the same job
              // on an element zoom survives.
              controlsList="nofullscreen"
              disablePictureInPicture
              onPointerDown={keepControlsDraggable}
              playsInline
              muted
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                display: state === 'ready' ? 'block' : 'none',
                // The surface sets pointerEvents:none on whatever it wraps —
                // harmless for the live wall and playback, whose videos are
                // chrome-less, but it would swallow every click on our own
                // controls. pointer-events is inherited, so re-enabling it
                // here gives the controls back without disturbing the surface:
                // wheel and drag still bubble up to it.
                pointerEvents: 'auto',
              }}
            />
          </FullscreenZoomSurface>

          {state === 'ready' && (
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (zoom stays available)'}
              style={{
                position: 'absolute', top: 22, right: 14, zIndex: 31,
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(8px)',
                color: '#fff', cursor: 'pointer',
              }}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}

          {state !== 'ready' && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(226,232,240,.9)',
            }}>
              {state === 'loading' ? (
                <>
                  <Loader2 size={26} className="animate-spin" />
                  <span style={{ fontSize: 12.5 }}>Loading the recording…</span>
                </>
              ) : (
                <>
                  <VideoOff size={26} />
                  <span style={{ fontSize: 12.5 }}>No recording available for this moment</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
