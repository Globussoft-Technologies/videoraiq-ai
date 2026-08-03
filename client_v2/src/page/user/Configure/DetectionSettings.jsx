import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, Video, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import ConfirmationModal from '../../../components/DeleteConfirmation';
import { useApi } from '../../../hooks/useApi';
import { getChannels, getNvrs, getDetectionTypes, toggleChannelDetection, updateChannel, getCamerasByNvr } from '../../../helpers/configure';
import { Popover, PopoverTrigger, PopoverContent } from '../../../pages/AttendanceLogs/components/Popover';
import CameraStream from '../../../components/CameraStream';
import DetectionZoneMarking from './DetectionZoneMarking';

const CHECK_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'checkout', label: 'Check-out' },
];

function isTypeEnabled(camera, key) {
  return !!camera?.detections?.[key]?.enabled;
}

function detectionTypeLabel(value, fallback) {
  if (typeof value === 'string') return value;
  return value?.displayName || value?.label || value?.name || fallback;
}

function appliedTypesFor(camera, typeLabels) {
  const entries = Array.isArray(typeLabels)
    ? typeLabels.map((type, index) => [
        type?.settingType || type?.detectionType || type?.key || type?.id || '',
        type,
      ])
    : Object.entries(typeLabels || {});

  const masterList = entries
    .map(([key, value], index) => ({
      key,
      label: detectionTypeLabel(value, key),
      enabled: isTypeEnabled(camera, key),
      order: index,
    }))
    .filter(type => type.key && type.label);

  return masterList.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.order - b.order;
  });
}

/** Popover: toggle each detection type on/off for this one camera. Rendered in a
 * body portal (see Popover.jsx) so it isn't clipped by the table's overflow:hidden. */
function AppliedTypesPopover({ camera, typeLabels, onToggleRequest }) {
  const [open, setOpen] = useState(false);

  // Detection types API is the master list; merge each type with
  // camera.detections[key]?.enabled and show enabled items first.
  const availableTypes = appliedTypesFor(camera, typeLabels);

  const handleToggle = (type) => {
    setOpen(false);
    onToggleRequest(camera, type.key, type.label, type.enabled);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px 0 12px',
            borderRadius: 20, background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.32)',
            fontSize: 11.5, fontWeight: 500, color: 'var(--blue)', cursor: 'pointer',
          }}
        >
          Applied Types
          <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6}>
        <div style={{ width: 260, padding: 10 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', color: 'var(--tx3)', padding: '2px 4px 8px' }}>
            DETECTION TYPES
          </div>
          {/* Capped to ~5 visible rows (34px each incl. gap) so a long type list scrolls instead of pushing the popover off-screen. */}
          <div style={{ maxHeight: 170, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {availableTypes.map(type => {
              return (
                <div key={type.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 6px' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--tx)' }}>{type.label}</span>
                  <button
                    onClick={() => handleToggle(type)}
                    style={{
                      width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
                      background: type.enabled ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg3, #2a2d3a)',
                      border: '1px solid var(--bd)', cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 1.5, left: type.enabled ? 17 : 1.5, width: 15, height: 15,
                      borderRadius: '50%', background: '#fff', transition: 'left .15s',
                      boxShadow: '0 1px 3px rgba(0,0,0,.4)',
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CameraRow({ camera, online, typeLabels, onOpen, onToggleDetectionRequest, onCheckTypeChange }) {
  // `online` is the real live-stream status, probed by the parent. The backend's
  // `camera.control` flag means "has a detection enabled", NOT "is streaming",
  // so it can't be used here (see Sidebar.jsx / Command Center for the same note).
  return (
    <div
      className="vq-row"
      onClick={onOpen}
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(200px,1.6fr) 120px 190px 150px 44px',
        gap: 0, padding: '13px 18px', borderBottom: '1px solid var(--bd)',
        alignItems: 'center', fontSize: 13, cursor: 'pointer', transition: 'background .12s',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
        <span style={{
          width: 34, height: 34, flexShrink: 0, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(59,130,246,.13)', color: 'var(--blue)',
        }}>
          <Video size={18} strokeWidth={1.7} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {camera.customName || camera.name}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx3)', display: 'block' }}>
            {camera.ipAddress || '—'}
          </span>
        </span>
      </span>

      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: online ? 'var(--ok)' : 'var(--tx3)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: online ? 'var(--ok)' : 'var(--tx3)', boxShadow: online ? '0 0 6px var(--ok)' : 'none' }} />
          {online ? 'Online' : 'Offline'}
        </span>
      </span>

      <span style={{ display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        <AppliedTypesPopover camera={camera} typeLabels={typeLabels} onToggleRequest={onToggleDetectionRequest} />
      </span>

      <span style={{ display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        <span style={{ position: 'relative' }}>
          <select
            value={camera.checkType || 'none'}
            onChange={e => onCheckTypeChange(camera, e.target.value)}
            style={{
              height: 32, padding: '0 26px 0 11px', borderRadius: 8,
              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12,
              outline: 'none', cursor: 'pointer', color: 'var(--tx)', appearance: 'none',
            }}
          >
            {CHECK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: 'absolute', right: 9, top: 10, pointerEvents: 'none', color: 'var(--tx3)' }} />
        </span>
      </span>

      <span style={{ display: 'flex', justifyContent: 'center', color: 'var(--tx3)' }}>
        <ChevronRight size={16} />
      </span>
    </div>
  );
}

const LIMIT = 12;

export function DetectionSettingsCameraList({ onOpenCamera }) {
  // setCamHealth is shared via the layout so the Sidebar footer can show the
  // live camera tally from this page too — otherwise it only ever reflects
  // Command Center's probe and reads blank/stale on every other page.
  const { setCamHealth } = useOutletContext() || {};
  const [search, setSearch] = useState('');
  const [nvrFilter, setNvrFilter] = useState('');
  const [page, setPage] = useState(0);
  const [detectionConfirm, setDetectionConfirm] = useState(null);
  const [detectionActionLoading, setDetectionActionLoading] = useState(false);

  const nvrsApi = useApi(() => getNvrs(0, 100), []);
  const nvrs = nvrsApi.data?.nvrs ?? [];

  const typesApi = useApi(() => getDetectionTypes(), []);
  const typeLabels = typesApi.data || {};

  const channelsApi = useApi(
    () => getChannels({ skip: page * LIMIT, limit: LIMIT, nvrId: nvrFilter, search }),
    [page, nvrFilter, search],
  );
  const cameras = channelsApi.data?.channels ?? [];
  const total = channelsApi.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  // Real per-camera online status. There's no backend "is live" field — the
  // `control` flag only means a detection is enabled — so each camera's HLS
  // stream is probed in the background (same approach as Command Center's
  // "Cameras Online") and its live/offline state tracked here by id.
  const [liveById, setLiveById] = useState({});
  const setCamLive = useCallback((id, isLive) => {
    setLiveById(prev => (prev[id] === isLive ? prev : { ...prev, [id]: isLive }));
  }, []);
  // Drop entries for cameras no longer on the page (filter / page change).
  useEffect(() => {
    const ids = new Set(cameras.map(c => c._id));
    setLiveById(prev => {
      const next = {};
      let changed = false;
      Object.keys(prev).forEach(id => {
        if (ids.has(id)) next[id] = prev[id];
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [cameras]);
  const onlineCount = cameras.filter(c => liveById[c._id]).length;

  // Online cameras first, offline after — stable within each group so rows
  // don't otherwise reshuffle as more of the page's stream probes resolve.
  // Sorting is scoped to the current (server-paginated) page only; a camera
  // isn't known online/offline until its background probe connects.
  const sortedCameras = useMemo(
    () => [...cameras].sort((a, b) => (liveById[a._id] ? 0 : 1) - (liveById[b._id] ? 0 : 1)),
    [cameras, liveById],
  );

  // Publish the probed tally to the shared layout state so the Sidebar footer
  // reflects live cameras while this page is open (report only the cameras we
  // actually probe on the page, so online never exceeds total).
  useEffect(() => {
    setCamHealth?.({ online: onlineCount, total: cameras.length });
  }, [onlineCount, cameras.length, setCamHealth]);

  // Matches V1: a single toggle endpoint for on/off; 404s if the type was
  // never linked to this camera (no auto-create — same as V1's real behavior).
  const handleToggleDetection = async (camera, detectionType, enable) => {
    try {
      await toggleChannelDetection({ channelId: camera._id, detectionType, enable });
      channelsApi.refetch();
    } catch (err) {
      const msg = err?.response?.data?.body?.message || 'Failed to update detection type.';
      toast.error(msg);
      throw err;
    }
  };

  const handleDetectionToggleRequest = (camera, detectionType, label, currentlyEnabled) => {
    setDetectionConfirm({ camera, detectionType, label, currentlyEnabled });
  };

  const handleConfirmDetectionToggle = async () => {
    if (!detectionConfirm) return;
    setDetectionActionLoading(true);
    try {
      await handleToggleDetection(
        detectionConfirm.camera,
        detectionConfirm.detectionType,
        !detectionConfirm.currentlyEnabled,
      );
      setDetectionConfirm(null);
    } finally {
      setDetectionActionLoading(false);
    }
  };

  const handleCheckTypeChange = async (camera, checkType) => {
    try {
      await updateChannel(camera._id, { checkType });
      channelsApi.refetch();
    } catch (err) {
      const msg = err?.response?.data?.body?.message || 'Failed to update camera type.';
      toast.error(msg);
    }
  };

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Filter cameras…"
            style={{
              width: '100%', height: 40, padding: '0 12px 0 36px', boxSizing: 'border-box',
              borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)',
              fontSize: 13, color: 'var(--tx)', outline: 'none',
            }}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <select
            value={nvrFilter}
            onChange={e => { setNvrFilter(e.target.value); setPage(0); }}
            style={{
              height: 40, padding: '0 34px 0 13px', borderRadius: 10,
              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 13,
              outline: 'none', cursor: 'pointer', color: 'var(--tx)', appearance: 'none',
            }}
          >
            <option value="">All NVRs</option>
            {nvrs.map(n => <option key={n._id} value={n._id}>{n.nvrName}</option>)}
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)' }} />
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>
          {onlineCount} online · {total} total
        </span>
      </div>

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(200px,1.6fr) 120px 190px 150px 44px', gap: 0,
          padding: '12px 18px', borderBottom: '1px solid var(--bd)',
          fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)', alignItems: 'center',
        }}>
          <span>CAMERA NAME</span>
          <span style={{ textAlign: 'center' }}>STATUS</span>
          <span style={{ textAlign: 'center' }}>ENABLE DETECTION</span>
          <span style={{ textAlign: 'center' }}>CAMERA TYPE</span>
          <span />
        </div>
        <AsyncBoundary
          loading={channelsApi.loading}
          error={channelsApi.error}
          isEmpty={!channelsApi.loading && !channelsApi.error && cameras.length === 0}
          onRetry={channelsApi.refetch}
          minH={160}
          emptyLabel="No cameras found"
        >
          {() => sortedCameras.map(camera => (
            <CameraRow
              key={camera._id}
              camera={camera}
              online={!!liveById[camera._id]}
              typeLabels={typeLabels}
              onOpen={() => onOpenCamera?.(camera)}
              onToggleDetectionRequest={handleDetectionToggleRequest}
              onCheckTypeChange={handleCheckTypeChange}
            />
          ))}
        </AsyncBoundary>
      </div>

      {/* Hidden stream probes — each camera's HLS stream is connected in the
          background (not rendered) purely to learn its real live/offline state
          for the STATUS column and the online tally. Same technique the Command
          Center uses; there's no backend field to read instead. */}
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
        {cameras.map(camera => (
          <CameraStream
            key={camera._id}
            channel={camera}
            showOverlay={false}
            onLiveChange={isLive => setCamLive(camera._id, isLive)}
            minH={1}
          />
        ))}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              style={{
                width: 30, height: 30, borderRadius: 7, fontSize: 12,
                background: page === i ? 'var(--blue)' : 'var(--bg2)',
                color: page === i ? '#fff' : 'var(--tx3)',
                border: `1px solid ${page === i ? 'var(--blue)' : 'var(--bd)'}`,
                cursor: 'pointer',
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
      <ConfirmationModal
        open={!!detectionConfirm}
        title="Detection Control"
        message={detectionConfirm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
            <div>Camera: <span style={{ fontWeight: 600, color: 'var(--tx)' }}>{detectionConfirm.camera?.customName || detectionConfirm.camera?.name || 'Camera'}</span></div>
            <div>Detection Type: <span style={{ fontWeight: 600, color: 'var(--tx)' }}>{detectionConfirm.label || detectionConfirm.detectionType}</span></div>
            <div>Status: <span style={{ fontWeight: 600, color: detectionConfirm.currentlyEnabled ? 'var(--ok)' : 'var(--crit)' }}>{detectionConfirm.currentlyEnabled ? 'Enabled' : 'Disabled'}</span></div>
          </div>
        )}
        confirmLabel={detectionActionLoading ? (detectionConfirm?.currentlyEnabled ? 'Stopping...' : 'Starting...') : (detectionConfirm?.currentlyEnabled ? 'Stop Detection' : 'Start Detection')}
        cancelLabel="Cancel"
        onClose={() => !detectionActionLoading && setDetectionConfirm(null)}
        onConfirm={handleConfirmDetectionToggle}
        loading={detectionActionLoading}
        confirmClass={detectionConfirm?.currentlyEnabled ? 'bg-[var(--crit)] text-white hover:opacity-90 shadow-sm shadow-[var(--crit)]/20' : 'bg-[var(--blue)] text-white hover:opacity-90 shadow-sm shadow-[var(--blue)]/20'}
      />
    </div>
  );
}

export default function DetectionSettings() {
  const [openCamera, setOpenCamera] = useState(null);

  // Re-fetch just this camera (with freshly-populated detections/settings) after
  // a save inside Zone Marking, so a just-created DetectionSetting's id shows up
  // without the user having to leave and reopen the camera.
  // GET /channel/nvr/:nvrId (getCamerasByNvr) doesn't populate nvrId — it comes
  // back as a raw id, not an object — so re-attach the already-populated nvrId
  // from the current snapshot rather than letting it be overwritten with the
  // raw id, which would break the stream URL (camera.nvrId._id).
  const refreshOpenCamera = async () => {
    const openCameraNvrId = openCamera?.nvrId?._id || openCamera?.nvrId;
    if (!openCameraNvrId) return;
    try {
      const list = await getCamerasByNvr(openCameraNvrId);
      const fresh = (list || []).find(c => c._id === openCamera._id);
      if (fresh) setOpenCamera({ ...fresh, nvrId: openCamera.nvrId });
    } catch {
      // Keep showing the previous snapshot — not worth surfacing an error for a background refresh.
    }
  };

  if (openCamera) {
    return (
      <DetectionZoneMarking
        camera={openCamera}
        onBack={() => setOpenCamera(null)}
        onSaved={refreshOpenCamera}
      />
    );
  }

  return <DetectionSettingsCameraList onOpenCamera={setOpenCamera} />;
}
