import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VideoOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { Panel, ActionLink } from '../../../components/primitives';
import { Loading, Empty } from '../../../components/States';
import CameraStream from '../../../components/CameraStream';
import CameraProbe from '../../../components/CameraProbe';
import LiveCameraLogsOverlay from '../../../components/LiveCameraLogsOverlay';
import usePageActive from '../../../hooks/usePageActive';

const PROBE_LIMIT = 32; // cameras stream-probed for the online tally

/* Only the selected tab streams. Everything else is a background status probe
   that runs one-at-a-time through the shared scheduler (lib/streamQueue) and
   disconnects once it has a verdict — see components/CameraProbe. */
const PRIORITY_SELECTED = -50;
const PRIORITY_PROBE    = 800;

/**
 * Command Center live camera panel: switchable camera tabs + the latest frame
 * for the selected camera. "Open full view" jumps to the Live Wall focused on
 * this camera; the tile's maximize icon puts just the video into real
 * browser fullscreen in place.
 */
export default function LiveCamera({ channels = [], loading, latestByChannel = {}, onLiveChange, onOnlineCountChange }) {
  const navigate = useNavigate();
  // Two different lists on purpose:
  //   probeCams — every camera matching the current filter, each briefly
  //     connected in the background so "Cameras Online" counts the whole
  //     filtered set. These are serialised by the stream scheduler and torn
  //     down again once their status is known, so the panel holds at most one
  //     hidden stream at a time. PROBE_LIMIT caps the tally's denominator.
  //   cams — the handful actually rendered as switchable tabs.
  const cams = useMemo(
    () => (Array.isArray(channels) ? channels : []),
    [channels]
  );
  const probeCams = useMemo(() => cams.slice(0, PROBE_LIMIT), [cams]);
  const [activeId, setActiveId] = useState(null);

  /* Tab hidden / browser minimised → drop every stream on this panel. */
  const pageActive = usePageActive({ graceMs: 3000 });
  const pageActiveRef = useRef(pageActive);
  pageActiveRef.current = pageActive;
  const tileRef = useRef(null);
  const tabsRef = useRef(null);

  const active = cams.find((c) => (c._id || c.id) === activeId) || cams[0];
  const activeKey = active?._id || active?.id;
  const snapshot = active ? latestByChannel[activeKey] : null;

  // Real online/offline per tab — each tab's stream connection is probed in the
  // background (hidden, same HLS decode Live Wall uses per tile) since there's
  // no reliable "is this camera live" field from the backend to read instead.
  const [liveById, setLiveById] = useState({});
  const setTabLive = useCallback((id, isLive) => {
    // Streams are torn down while the tab is hidden; those teardown reports
    // would wrongly zero the tally, so freeze the last known state instead.
    if (!pageActiveRef.current) return;
    setLiveById((prev) => (prev[id] === isLive ? prev : { ...prev, [id]: isLive }));
  }, []);
  useEffect(() => {
    // Drop entries for cameras no longer in the current filtered list.
    const ids = new Set(probeCams.map((c) => c._id || c.id));
    setLiveById((prev) => {
      const next = {};
      let changed = false;
      Object.keys(prev).forEach((id) => {
        if (ids.has(id)) next[id] = prev[id];
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [probeCams]);
  const onlineCount = probeCams.filter((c) => liveById[c._id || c.id]).length;
  const probedCount = probeCams.filter((c) => Object.prototype.hasOwnProperty.call(liveById, c._id || c.id)).length;
  const probeComplete = probeCams.length > 0 && probedCount === probeCams.length;
  useEffect(() => {
    // Keep the last known Sidebar tally while streams are connecting. Publishing
    // the initial 0/0 or 0/N would make navigation appear to reset the count.
    if (!probeComplete) return;
    onOnlineCountChange?.(onlineCount, probeCams.length);
  }, [onlineCount, probeCams.length, onOnlineCountChange, probeComplete]);

  const online = active ? !!liveById[activeKey] : false;
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
          const dot = liveById[id] ? 'var(--ok)' : 'var(--crit)';
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
            onLiveChange={(isLive) => { setTabLive(activeKey, isLive); onLiveChange?.(isLive); }}
            minH={isFullscreen ? 0 : 220}
            rounded={!isFullscreen}
            fit={isFullscreen ? 'contain' : 'cover'}
            active={pageActive}
            priority={PRIORITY_SELECTED}
            immediate
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

      {/* Hidden probes — every filtered camera is connected in the background
          (not rendered) purely to learn its real live/offline state for the
          "Cameras Online" count and tab dots; the active tab's own tile above
          already reports its status via onLiveChange.

          These run strictly one at a time through the shared scheduler and
          disconnect once their verdict is in, so clicking a tab opens that one
          camera rather than the whole filtered set. */}
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
        {probeCams.filter((c) => (c._id || c.id) !== activeKey).map((c, idx) => {
          const id = c._id || c.id;
          return (
            <CameraProbe
              key={id}
              channel={c}
              channelId={id}
              setLive={setTabLive}
              active={pageActive && !isFullscreen}
              priority={PRIORITY_PROBE + idx}
            />
          );
        })}
      </div>
    </Panel>
  );
}
