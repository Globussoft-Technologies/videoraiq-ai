import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, VideoOff, Maximize2, Minimize2, Play, Pause, MoreVertical, Download, Check } from 'lucide-react';
import { toast } from 'sonner';
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

/*
 * The recorder never closes its playlist with EXT-X-ENDLIST, so nothing ever
 * announces the last segment. What it does do is republish the same playlist
 * unchanged once it has stopped writing, so this many reloads carrying no new
 * segment — roughly one target-duration apart — is the end.
 *
 * Waiting on a timer instead would guess: the recorder writes the window at
 * about real time, so a gap longer than any sensible timeout is normal
 * mid-clip, and a clip that was still being written gets cut short.
 */
const STALE_RELOADS_BEFORE_END = 4;

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2];

/*
 * Extra recording asked for beyond the end of the window, and never played.
 *
 * The media server packages the clip as HLS and publishes whole segments only,
 * so the unfinished one at the end is dropped: a six second window came back as
 * four. Asking for more than is needed means that loss comes out of footage
 * nobody sees, and the configured window arrives complete. Playback still stops
 * where the admin set it — see clipSpan.
 */
const TAIL_PAD_SECONDS = 6;

/** Safe for a filename on any platform, and still recognisable. */
const slug = (value) => String(value || '')
  .trim()
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

/** Whatever the recorder actually handed over, by the best measure available. */
function measureClipEnd(video) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  const { seekable } = video;
  if (seekable.length) return seekable.end(seekable.length - 1);
  const { buffered } = video;
  return buffered.length ? buffered.end(buffered.length - 1) : 0;
}

/** m:ss — a preview is seconds long, so hours would only be noise. */
function formatClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const menuItemStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '7px 9px',
  borderRadius: 7,
  border: 'none',
  background: 'transparent',
  fontSize: 12.5,
  textAlign: 'left',
  cursor: 'pointer',
};

export default function IncidentPreviewModal({ item, channel, channelId, at, onClose }) {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const [url, setUrl] = useState('');
  const [state, setState] = useState('loading'); // loading | ready | none
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [window_, setWindow] = useState(INCIDENT_PREVIEW_DEFAULTS);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [finished, setFinished] = useState(false);
  const [clipEnd, setClipEnd] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const menuRef = useRef(null);
  // Segment URLs from the playlist, which is what a download has to stitch:
  // HLS has no single file to link to.
  const fragmentsRef = useRef([]);
  const trackRef = useRef(null);
  const scrubbingRef = useRef(false);

  const incidentAt = useMemo(() => {
    const parsed = new Date(at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [at]);

  /* Resolve a playable URL for [incident - before, incident + after + pad]. */
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
        const endTime = new Date(
          incidentAt.getTime() + (settings.afterSeconds + TAIL_PAD_SECONDS) * 1000,
        );

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

    /*
     * The recorder writes the window a segment at a time, so playback catches
     * up with it repeatedly on the way through. Every one of those is just a
     * wait for more, not the end — show the spinner and let it continue.
     *
     * The playlist is never closed with EXT-X-ENDLIST though, so nothing ever
     * announces the last segment: hls.js would poll for more forever and the
     * spinner would never clear. Segments arriving cancel the countdown, so it
     * only runs out when the recorder really has stopped writing.
     */
    setFinished(false);
    setClipEnd(0);

    let loadStopped = false;

    // Every stall on the way through is the recorder still writing: show the
    // loader and wait. Only the playlist can say the clip is actually over.
    const onWaiting = () => setBuffering(true);
    const onResumed = () => setBuffering(false);

    const finishClip = (knownDuration) => {
      setBuffering(false);
      setClipEnd(knownDuration > 0 ? knownDuration : measureClipEnd(video));
      setFinished(true);
      video.pause();
      try { hls?.stopLoad(); loadStopped = true; } catch { /* noop */ }
    };

    // A short recording is still a guess from silence, so let pressing play
    // take it back rather than leaving the preview permanently truncated.
    const onPlay = () => {
      if (!loadStopped) return;
      loadStopped = false;
      try { hls?.startLoad(); } catch { /* noop */ }
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);
    video.addEventListener('playing', onResumed);
    video.addEventListener('pause', onResumed);
    video.addEventListener('play', onPlay);

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

        let lastShape = null;
        let staleReloads = 0;
        hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
          if (cancelled) return;
          const details = data?.details;
          if (!details) return;

          fragmentsRef.current = (details.fragments || [])
            .map((fragment) => fragment?.url)
            .filter(Boolean);

          // A playlist closed with EXT-X-ENDLIST is definitive: this is the
          // whole clip and nothing has to be inferred.
          if (details.live === false) {
            finishClip(details.totalduration);
            return;
          }

          /*
           * Otherwise the only evidence is the playlist not changing. Compare
           * everything that grows, not just endSN: a media server that omits
           * sequence numbers would leave endSN undefined on every reload, which
           * compares equal to itself and would call a clip finished while it
           * was still being written. That is what cut a six second window down
           * to four.
           */
          const shape = [
            details.endSN,
            details.fragments?.length,
            details.totalduration,
          ].join('|');

          if (shape !== lastShape) {
            lastShape = shape;
            staleReloads = 0;
            return;
          }

          staleReloads += 1;
          if (staleReloads < STALE_RELOADS_BEFORE_END) return;

          // Stopped growing. If playback has also consumed everything in it,
          // this recording really is all there is.
          const { buffered } = video;
          const end = buffered.length ? buffered.end(buffered.length - 1) : 0;
          if (video.currentTime >= end - 0.5) finishClip();
        });

        let firstFrag = false;
        hls.on(Hls.Events.FRAG_LOADED, () => {
          if (cancelled) return;
          if (firstFrag) return;
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
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('playing', onResumed);
      video.removeEventListener('pause', onResumed);
      video.removeEventListener('play', onPlay);
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
   * Redirecting a browser fullscreen after the fact does not work either: its
   * button spends the click's user activation on its own request, so asking
   * again for the stage is refused and fullscreen just flashes open and shut.
   * The video carries no controls of its own, so nothing but the button below
   * can start this.
   */
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
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

  const camName = channel?.customName || channel?.name || item?.channelData?.name || 'Camera';
  const totalSeconds = window_.beforeSeconds + window_.afterSeconds;

  /*
   * The transport is ours rather than the browser's because it has to be told
   * how long the clip is. The recorder publishes the window as a playlist it
   * keeps appending to, so video.duration is only ever "what has been written
   * so far" — the browser's own bar therefore starts a few seconds wide, grows
   * as chunks land, and finally reads 0:09 for a ten-second window because the
   * last partial segment is never published and it floors what it has.
   *
   * The requested window is known up front, so the track is scaled to that: it
   * is full width from the first frame, the lighter fill shows how much the
   * recorder has actually handed over, and the total reads the window that was
   * asked for.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const syncTime = () => {
      setCurrentTime(video.currentTime || 0);
      const { buffered } = video;
      setBufferedEnd(buffered.length ? buffered.end(buffered.length - 1) : 0);
      setClipEnd((previous) => Math.max(previous, measureClipEnd(video)));

      // Stop at the configured window even when the recorder handed over more.
      if (totalSeconds && video.currentTime >= totalSeconds) {
        video.pause();
        setFinished(true);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setClipEnd(measureClipEnd(video));
      setFinished(true);
    };

    video.addEventListener('timeupdate', syncTime);
    video.addEventListener('progress', syncTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', syncTime);
      video.removeEventListener('progress', syncTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [totalSeconds]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    // Resuming on the last frame would stall straight away; start over.
    if (finished) {
      video.currentTime = 0;
      setFinished(false);
    }
    video.play().catch(() => setPlaying(false));
  };

  const seekFromPointer = (clientX) => {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video || !clipSpan) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    // The track spans the whole window, but only what the recorder has handed
    // over can be seeked to; past that the position would just be clamped.
    const { seekable } = video;
    const published = seekable.length ? seekable.end(seekable.length - 1) : 0;
    const furthest = Math.min(published, clipSpan);
    video.currentTime = Math.min(ratio * clipSpan, furthest);
    setCurrentTime(video.currentTime);
    if (video.currentTime < furthest - 0.5) setFinished(false);
  };

  const startScrub = (event) => {
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekFromPointer(event.clientX);
  };
  const moveScrub = (event) => {
    if (scrubbingRef.current) seekFromPointer(event.clientX);
  };
  const endScrub = (event) => {
    scrubbingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  /*
   * What comes back is never exactly the window that was asked for: the NVR
   * seeks to a keyframe and the packager publishes whole segments, so six
   * seconds arrives as 5.6 or as 8 depending on where those boundaries fall.
   *
   * The window is the setting, so the extra is not played — the preview runs to
   * the configured length and stops. Coming up short is the one case the track
   * has to follow the footage instead, or the thumb would stop before the end
   * of a clip that has nothing left to give.
   */
  const clipSpan = finished
    ? Math.min(clipEnd || totalSeconds, totalSeconds)
    : totalSeconds;

  const pct = (seconds) => (clipSpan
    ? Math.min(100, Math.max(0, (seconds / clipSpan) * 100))
    : 0);

  const playedSeconds = finished ? clipSpan : currentTime;

  // Say so when the recorder had less than the window to give, rather than
  // presenting four seconds as a complete six second preview.
  const shortfall = finished && clipEnd > 0 && clipEnd < totalSeconds - 0.5;

  // A download stitches the segments the playlist has handed over, so it can
  // only produce the whole clip once the whole clip has arrived. Offering it
  // earlier would quietly save a truncated file.
  const clipReady = finished || bufferedEnd >= clipSpan - 0.5;

  /* Anywhere outside the menu closes it, as a menu of its own would. */
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const applySpeed = (rate) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
    setSpeed(rate);
  };

  /*
   * HLS has no single file to point a link at, so a download means fetching the
   * playlist's segments and stitching them back together. They are already
   * being fetched for playback, so this costs nothing new and needs no server
   * endpoint. The result is the raw transport stream the recorder produced —
   * .ts rather than .mp4, which every player opens but no browser can be asked
   * to remux without transcoding.
   */
  const downloadClip = async () => {
    if (!clipReady) {
      // Left clickable on purpose: a dead button explains nothing.
      toast.info('Let the clip finish loading, then download it');
      return;
    }

    const urls = fragmentsRef.current;
    if (!urls.length) {
      toast.error('Nothing has loaded to download yet');
      return;
    }

    setDownloading(true);
    try {
      const parts = [];
      for (const fragmentUrl of urls) {
        // Sequentially: the order is the clip, and a handful of segments is
        // not worth racing.
        // eslint-disable-next-line no-await-in-loop
        const response = await fetch(fragmentUrl);
        if (!response.ok) throw new Error('segment unavailable');
        // eslint-disable-next-line no-await-in-loop
        parts.push(await response.blob());
      }

      const stamp = incidentAt ? incidentAt.toISOString().replace(/[:.]/g, '-') : 'clip';
      const name = [slug(item?.incidentName) || 'incident', slug(camName), stamp]
        .filter(Boolean)
        .join('_');

      const objectUrl = URL.createObjectURL(new Blob(parts, { type: 'video/mp2t' }));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${name}.ts`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Could not download this clip');
    } finally {
      setDownloading(false);
      setMenuOpen(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(6,9,15,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
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
            {/* <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
              {camName} · {totalSeconds}s around the incident
              {' '}({window_.beforeSeconds}s before, {window_.afterSeconds}s after)
              {shortfall && (
                <span style={{ color: 'var(--amber, #f59e0b)' }}>
                  {' '}· only {Math.round(clipEnd)}s recorded
                </span>
              )}
            </div> */}
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
              // Picture-in-picture would move the video to a layer the zoom
              // surface cannot transform. Nothing else is needed: the transport
              // below is ours, so the video stays chrome-less like the live
              // wall's and the surface keeps every pointer event for zoom.
              disablePictureInPicture
              playsInline
              muted
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                display: state === 'ready' ? 'block' : 'none',
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

          {state === 'ready' && buffering && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 20, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              // Never in the way of a scroll-to-zoom or a drag-to-pan.
              pointerEvents: 'none',
            }}>
              <Loader2 size={30} className="animate-spin" style={{ color: 'rgba(255,255,255,.85)' }} />
            </div>
          )}

          {state === 'ready' && (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 31,
              display: 'flex', alignItems: 'center', gap: 12, padding: '18px 14px 12px',
              background: 'linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,0))',
            }}>
              <button
                type="button"
                onClick={togglePlay}
                title={playing ? 'Pause' : 'Play'}
                style={{
                  flex: '0 0 auto', width: 28, height: 28, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                  border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer',
                }}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>

              <div
                ref={trackRef}
                onPointerDown={startScrub}
                onPointerMove={moveScrub}
                onPointerUp={endScrub}
                onPointerCancel={endScrub}
                style={{
                  position: 'relative', flex: '1 1 auto', height: 14,
                  display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none',
                }}
              >
                <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.25)' }} />
                {/* How much of the window the recorder has actually written. */}
                <div style={{ position: 'absolute', left: 0, width: `${pct(bufferedEnd)}%`, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.45)' }} />
                <div style={{ position: 'absolute', left: 0, width: `${pct(playedSeconds)}%`, height: 4, borderRadius: 2, background: '#fff' }} />
                <div style={{
                  position: 'absolute', left: `${pct(playedSeconds)}%`, width: 11, height: 11,
                  marginLeft: -5.5, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,.5)',
                }} />
              </div>

              <span style={{
                flex: '0 0 auto', fontFamily: 'var(--mono, monospace)', fontSize: 11.5,
                color: 'rgba(255,255,255,.9)', fontVariantNumeric: 'tabular-nums',
              }}>
                {formatClock(playedSeconds)} / {formatClock(clipSpan)}
              </span>

              <div ref={menuRef} style={{ position: 'relative', flex: '0 0 auto' }}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  title="More"
                  style={{
                    width: 26, height: 26, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', borderRadius: 6, border: 'none',
                    background: menuOpen ? 'rgba(255,255,255,.16)' : 'transparent',
                    color: '#fff', cursor: 'pointer',
                  }}
                >
                  <MoreVertical size={16} />
                </button>

                {menuOpen && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 32,
                    minWidth: 168, padding: 6, borderRadius: 10,
                    background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(255,255,255,0.14)',
                    backdropFilter: 'blur(8px)', boxShadow: '0 12px 32px rgba(0,0,0,.45)',
                  }}>
                    <div style={{
                      padding: '5px 9px 4px', fontSize: 10.5, fontWeight: 700,
                      letterSpacing: '.4px', textTransform: 'uppercase',
                      color: 'rgba(255,255,255,.45)',
                    }}>
                      Playback speed
                    </div>

                    {PLAYBACK_SPEEDS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => applySpeed(rate)}
                        style={{ ...menuItemStyle, color: '#fff' }}
                      >
                        <span>{rate === 1 ? 'Normal' : `${rate}×`}</span>
                        {speed === rate && <Check size={13} />}
                      </button>
                    ))}

                    <div style={{ height: 1, margin: '5px 4px', background: 'rgba(255,255,255,.12)' }} />

                    <button
                      type="button"
                      onClick={downloadClip}
                      disabled={downloading}
                      title={clipReady ? 'Download clip' : 'Still loading'}
                      style={{
                        ...menuItemStyle,
                        color: downloading || !clipReady ? 'rgba(255,255,255,.42)' : '#fff',
                        cursor: downloading ? 'wait' : (clipReady ? 'pointer' : 'not-allowed'),
                      }}
                    >
                      <span>{downloading ? 'Preparing…' : 'Download clip'}</span>
                      {downloading
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Download size={13} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
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
