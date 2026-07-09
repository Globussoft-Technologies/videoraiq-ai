import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VideoOff } from 'lucide-react';
import { Panel, ActionLink } from '../../../components/primitives';
import { Loading, Empty } from '../../../components/States';
import CameraStream from '../../../components/CameraStream';

/**
 * Command Center live camera panel: switchable camera tabs + the latest frame
 * for the selected camera. "Open full view" jumps to the Live Wall focused on
 * this camera; the tile's maximize icon puts just the video into real
 * browser fullscreen in place.
 */
export default function LiveCamera({ channels = [], loading, latestByChannel = {}, onLiveChange }) {
  const navigate = useNavigate();
  const cams = useMemo(() => (Array.isArray(channels) ? channels.slice(0, 8) : []), [channels]);
  const [activeId, setActiveId] = useState(null);
  const tileRef = useRef(null);

  const active = cams.find((c) => (c._id || c.id) === activeId) || cams[0];
  const activeKey = active?._id || active?.id;
  const snapshot = active ? latestByChannel[activeKey] : null;
  const online = active ? active.status !== 'offline' : false;
  const liveColor = !active ? 'var(--tx3)' : online ? 'var(--ok)' : 'var(--crit)';

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === tileRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function openFullView() {
    if (!active) return;
    navigate(`/v2/wall${activeKey ? `?cam=${activeKey}` : ''}`);
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px 0' }}>
        <span className="vq-blink" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--crit)' }} />
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Live Camera</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>switch feeds ↓</span>
        <ActionLink
          style={{ marginLeft: 'auto', ...(active ? {} : { color: 'var(--tx3)', cursor: 'default' }) }}
          onClick={openFullView}
        >
          Open full view →
        </ActionLink>
      </div>

      {/* Tabs */}
      <div className="vq-scroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '11px 16px' }}>
        {cams.map((c) => {
          const id = c._id || c.id;
          const isActive = id === activeKey;
          const dot = c.status === 'offline' ? 'var(--crit)' : c.status === 'warning' ? 'var(--warn)' : 'var(--ok)';
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
          <CameraStream key={activeKey} channel={active} onMaximize={toggleTileFullscreen} isFullscreen={isFullscreen} onLiveChange={onLiveChange} minH={220} />
        )}
      </div>
    </Panel>
  );
}
