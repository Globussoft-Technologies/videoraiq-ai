import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VideoOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { Panel, ActionLink } from '../../../components/primitives';
import { Loading, Empty } from '../../../components/States';
import CameraStream from '../../../components/CameraStream';
import LiveCameraLogsOverlay from '../../../components/LiveCameraLogsOverlay';
import usePageActive from '../../../hooks/usePageActive';
import { useCameraStatusStream } from '../../../hooks/useCameraStatusStream';
import { isCameraLive, isCameraRtspOnline, cameraStatusId } from '../../../helpers/cameraStatus';

const PRIORITY_SELECTED = -50;

/**
 * Command Center live camera panel: switchable camera tabs + the latest frame
 * for the selected camera. "Open full view" jumps to the Live Wall focused on
 * this camera; the tile's maximize icon puts just the video into real
 * browser fullscreen in place.
 */
export default function LiveCamera({ channels = [], loading, latestByChannel = {}, onOnlineCountChange }) {
  const navigate = useNavigate();
  // `channels` is the full camera inventory: every one gets a switchable tab
  // (the tab row scrolls) and every one is counted by "Cameras Online".
  const cams = useMemo(
    () => (Array.isArray(channels) ? channels : []),
    [channels]
  );
  const statusTargets = useMemo(
    () => cams.filter((camera) => !!cameraStatusId(camera)),
    [cams]
  );
  const [activeId, setActiveId] = useState(null);

  /* Tab hidden / browser minimised → drop the visible stream on this panel. */
  const pageActive = usePageActive({ graceMs: 3000 });
  const tileRef = useRef(null);
  const tabsRef = useRef(null);

  const active = cams.find((c) => (c._id || c.id) === activeId) || cams[0];
  const activeKey = active?._id || active?.id;
  const snapshot = active ? latestByChannel[activeKey] : null;

  // Real online/offline per tab, straight from the backend: a camera is live
  // when the RTSP source is reachable AND this server is actually producing
  // fresh HLS segments for it right now (rtsp_online && stream_status ===
  // 'running') — see CAMERA_STATUS_API.md. Streamed over one connection (the
  // backend pushes a fresh reading every ~3s), not stream-probed per tab, so
  // every tab gets a real verdict without polling.
  const statusApi = useCameraStatusStream(statusTargets, { enabled: statusTargets.length > 0 });
  const statusById = useMemo(() => {
    const map = {};
    (statusApi.data?.cameras || []).forEach((cam) => {
      if (cam?.id) map[cam.id] = cam;
    });
    return map;
  }, [statusApi.data]);
  const isCamLive = useCallback((channel) => isCameraLive(statusById[cameraStatusId(channel)]), [statusById]);

  // Denominator is every rendered tab, including cameras with no stream URL
  // configured — a camera you own but can't stream is still a camera, and it
  // correctly reads OFFLINE (isCamLive returns false when cameraStatusId is null).
  const onlineCount = cams.filter((channel) => isCameraRtspOnline(statusById[cameraStatusId(channel)])).length;
  const hasStatus = !!statusApi.data;
  useEffect(() => {
    // Keep the last known Sidebar tally until the first status response lands,
    // instead of publishing an initial 0/0 that would make navigation look
    // like it reset the count.
    if (!hasStatus) return;
    onOnlineCountChange?.(onlineCount, cams.length);
  }, [onlineCount, cams.length, onOnlineCountChange, hasStatus]);

  const online = active ? isCamLive(active) : false;
  const liveColor = !active ? 'var(--tx3)' : online ? 'var(--ok)' : 'var(--crit)';

  const handleTabWheel = useCallback((event) => {
    const node = tabsRef.current;
    if (!node) return;
    const hasHorizontalOverflow = node.scrollWidth > node.clientWidth;
    if (!hasHorizontalOverflow) return;

    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!delta) return;

    event.preventDefault();
    node.scrollLeft += delta;
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === tileRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const activeIndex = cams.findIndex((c) => (c._id || c.id) === activeKey);
  const goToOffset = useCallback((offset) => {
    if (cams.length < 2) return;
    const nextIndex = (activeIndex + offset + cams.length) % cams.length;
    const nextCam = cams[nextIndex];
    if (nextCam) setActiveId(nextCam._id || nextCam.id);
  }, [cams, activeIndex]);
  const goPrev = useCallback(() => goToOffset(-1), [goToOffset]);
  const goNext = useCallback(() => goToOffset(1), [goToOffset]);

  // Keep the active tab scrolled into view when it changes via the prev/next
  // arrows rather than a direct tab click.
  useEffect(() => {
    tabsRef.current?.querySelector(`[data-cam-id="${activeKey}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeKey]);

  function openFullView() {
    if (!active) return;
    // Live Wall is mounted at `/live` (see routes.jsx) — not `/v2/wall`.
    navigate(`/live${activeKey ? `?cam=${activeKey}` : ''}`);
  }

  function toggleTileFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      tileRef.current?.requestFullscreen?.();
    }
  }

  const frameStyle = isFullscreen
    ? {
        position: 'relative',
        width: '100vw',
        height: '100vh',
        margin: 0,
        background: '#000',
        overflow: 'hidden',
      }
    : {
        position: 'relative',
        aspectRatio: '16/9',
        margin: '0 16px 16px',
      };

  return (
    <Panel style={{ background: 'var(--bg1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px 0', flexWrap: 'wrap', rowGap: 4 }}>
        <span className="vq-blink" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--crit)', flex: '0 0 auto' }} />
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Live Camera</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', flex: '0 0 auto', whiteSpace: 'nowrap' }}>switch feeds ↓</span>
        <ActionLink
          style={{ marginLeft: 'auto', flex: '0 0 auto', whiteSpace: 'nowrap', ...(active ? {} : { color: 'var(--tx3)', cursor: 'default' }) }}
          onClick={openFullView}
        >
          Open full view →
        </ActionLink>
      </div>

      {/* Tabs */}
      <div
        ref={tabsRef}
        className="vq-scroll"
        onWheel={handleTabWheel}
        style={{
          display: 'flex',
          gap: 7,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '11px 16px',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth',
        }}
      >
        {cams.map((c) => {
          const id = c._id || c.id;
          const isActive = id === activeKey;
          const dot = isCamLive(c) ? 'var(--ok)' : 'var(--crit)';
          return (
            <div
              key={id}
              data-cam-id={id}
              onClick={() => setActiveId(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flex: '0 0 auto',
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                padding: '5px 10px',
                borderRadius: 7,
                cursor: 'pointer',
                color: isActive ? 'var(--tx)' : 'var(--tx2)',
                background: isActive ? 'var(--bg3)' : 'var(--bg2)',
                border: `1px solid ${isActive ? 'var(--bd2)' : 'var(--bd)'}`,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />
              {c.customName || c.name || id}
            </div>
          );
        })}
      </div>

      {/* Frame — live HLS stream for the selected camera */}
      <div ref={tileRef} style={frameStyle}>
        {loading ? (
          <Loading minH={220} />
        ) : !active ? (
          <Empty icon={VideoOff} label="No cameras configured" minH={220} />
        ) : (
          <CameraStream
            key={activeKey}
            channel={active}
            onMaximize={toggleTileFullscreen}
            isFullscreen={isFullscreen}
            minH={isFullscreen ? 0 : 220}
            rounded={!isFullscreen}
            fit={isFullscreen ? 'contain' : 'cover'}
            active={pageActive}
            priority={PRIORITY_SELECTED}
            immediate
            enableFullscreenZoom
            zoomToolbarStyle={{ top: 8, right: 96 }}
          />
        )}
        {isFullscreen && active && <LiveCameraLogsOverlay channel={active} />}

        {/* Prev/next nav — cycles the active tab so users can step through
            cameras without reaching for the tab strip above. */}
        {active && cams.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              title="Previous camera"
              style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.8)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.55)'; }}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              title="Next camera"
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.8)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.55)'; }}
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
    </Panel>
  );
}
