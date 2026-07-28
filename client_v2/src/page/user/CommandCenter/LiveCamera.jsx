import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VideoOff } from 'lucide-react';
import { Panel, ActionLink } from '../../../components/primitives';
import { Loading, Empty } from '../../../components/States';
import CameraStream from '../../../components/CameraStream';
import LiveCameraLogsOverlay from '../../../components/LiveCameraLogsOverlay';

const PROBE_LIMIT = 32; // cameras stream-probed for the online tally

/**
 * Command Center live camera panel: switchable camera tabs + the latest frame
 * for the selected camera. "Open full view" jumps to the Live Wall focused on
 * this camera; the tile's maximize icon puts just the video into real
 * browser fullscreen in place.
 */
export default function LiveCamera({ channels = [], loading, latestByChannel = {}, onLiveChange, onOnlineCountChange }) {
  const navigate = useNavigate();
  // Two different lists on purpose:
  //   probeCams — every camera matching the current filter, each one connected in
  //     the background so "Cameras Online" counts the whole filtered set. Capped
  //     because each probe opens a real stream; raise/lower PROBE_LIMIT to trade
  //     accuracy on huge sites against connection load.
  //   cams — the handful actually rendered as switchable tabs.
  const cams = useMemo(
    () => (Array.isArray(channels) ? channels : []),
    [channels]
  );
  const probeCams = useMemo(() => cams.slice(0, PROBE_LIMIT), [cams]);
  const [activeId, setActiveId] = useState(null);
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
  useEffect(() => {
    onOnlineCountChange?.(onlineCount, probeCams.length);
  }, [onlineCount, probeCams.length, onOnlineCountChange]);

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
      <div ref={tileRef} style={{ position: 'relative', aspectRatio: '16/9', margin: '0 16px 16px' }}>
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
            minH={220}
          />
        )}
        {isFullscreen && active && <LiveCameraLogsOverlay channel={active} />}
      </div>

      {/* Hidden probes — every filtered camera's stream is connected in the
          background (not rendered) purely to learn its real live/offline state
          for the "Cameras Online" count and tab dots; the active tab's own tile
          above already reports its status via onLiveChange. */}
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
        {probeCams.filter((c) => (c._id || c.id) !== activeKey).map((c) => {
          const id = c._id || c.id;
          return (
            <CameraStream
              key={id}
              channel={c}
              showOverlay={false}
              onLiveChange={(isLive) => setTabLive(id, isLive)}
              minH={1}
            />
          );
        })}
      </div>
    </Panel>
  );
}
