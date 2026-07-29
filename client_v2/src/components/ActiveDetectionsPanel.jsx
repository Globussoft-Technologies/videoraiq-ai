import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { timeAgo, detectionLabel } from '../lib/format';
import { ENGINE_PALETTE } from '../lib/engineMeta';
import { getEnabledEngines } from './CameraGrid';

const SEV_COLOR = {
  high: 'var(--crit)', critical: 'var(--crit)',
  moderate: 'var(--warn)', medium: 'var(--warn)',
  low: 'var(--cyan)',
};

const MAX_LIVE_DETECTIONS = 6;

function channelIdsOf(channel) {
  return [channel?._id, channel?.channelId].filter(Boolean).map(String);
}

function detectionMatchesChannel(data, ids) {
  const candidates = [
    data?.channelId?._id || data?.channelId,
    data?.cameraId?._id || data?.cameraId,
  ].filter(Boolean).map(String);
  return candidates.some((id) => ids.includes(id));
}

/**
 * Live detections for one camera, sourced from the same
 * `cameradetection_${adminId}` socket event DetectionNotificationContext
 * already uses for toasts — filtered here to just this camera's channel/
 * camera id. The event only carries incident-level metadata (type, severity,
 * time), never bounding boxes / confidence / a tracking id, so this shows
 * what's real rather than fabricating those fields.
 */
function useLiveDetections(channel) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [detections, setDetections] = useState([]);

  useEffect(() => {
    setDetections([]);
  }, [channel?._id, channel?.channelId]);

  useEffect(() => {
    if (!socket || !user?.adminId) return undefined;
    const ids = channelIdsOf(channel);
    if (!ids.length) return undefined;

    const handleDetection = (data) => {
      if (!detectionMatchesChannel(data, ids)) return;
      const entry = {
        key: data?._id || `${data?.incidentType}_${data?.timeOfIncident || Date.now()}`,
        label: detectionLabel(data?.incidentType || data?.incidentName || data?.displayName),
        severity: String(data?.severity || '').toLowerCase(),
        time: data?.timeOfIncident || data?.createdAt || new Date(),
      };
      setDetections((prev) => [entry, ...prev.filter((d) => d.key !== entry.key)].slice(0, MAX_LIVE_DETECTIONS));
    };

    socket.on(`cameradetection_${user.adminId}`, handleDetection);
    return () => socket.off(`cameradetection_${user.adminId}`, handleDetection);
  }, [socket, user?.adminId, channel?._id, channel?.channelId]);

  return detections;
}

function DetectionRow({ detection }) {
  const color = SEV_COLOR[detection.severity] || 'var(--ph)';
  return (
    <div>
      <div className="flex items-center gap-2 mb-[5px]">
        <span
          className="w-[9px] h-[9px] rounded-[2px] flex-none"
          style={{ background: color, boxShadow: `0 0 7px ${color}` }}
        />
        <span className="flex-1 min-w-0 truncate text-[12.5px] font-medium text-[var(--tx)]">
          {detection.label}
        </span>
      </div>
      <div
        className="h-[5px] rounded-[3px] bg-[var(--track)] overflow-hidden mb-[3px] relative"
        style={{ background: color }}
      >
        <span
          className="vq-shimmer absolute top-0 bottom-0 left-0 w-[45%]"
          style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)' }}
        />
      </div>
      <div className="pl-[17px] text-[10.5px] text-[var(--tx3)]">
        {timeAgo(detection.time) || 'just now'}
      </div>
    </div>
  );
}

function EngineChip({ name, color }) {
  return (
    <span
      className="flex items-center gap-[5px] rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold"
      style={{ color, borderColor: color }}
    >
      <span className="vq-glowpulse w-[5px] h-[5px] rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[7px] border-b border-[var(--bd)] last:border-b-0 last:pb-0 first:pt-0">
      <span className="shrink-0 whitespace-nowrap text-[11.5px] text-[var(--tx3)]">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-[12px] font-medium text-[var(--tx)] ${mono ? 'font-mono text-[11px]' : ''}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

const cardClass = 'rounded-[13px] border border-[var(--bd)] bg-[var(--bg1)] p-[15px]';

/** Sidebar next to the single-camera playback/live view: real live detection
 * events (from the shared detection socket), the camera's enabled engines,
 * a link into Detection Settings to configure zones, and the camera's
 * actually-known info. No bounding boxes / confidence / tracking id /
 * resolution / fps / protocol / live-status — this app has no data source
 * for any of those today. */
export default function ActiveDetectionsPanel({ channel }) {
  const navigate = useNavigate();
  const liveDetections = useLiveDetections(channel);
  const engines = getEnabledEngines(channel);
  const nvr = channel?.nvrId;
  const site = nvr?.location || channel?.location || channel?.locationName || '—';
  const nvrName = nvr?.nvrName || channel?.nvrName || '—';
  const nvrBrandModel = [nvr?.brand, nvr?.model].filter(Boolean).join(' / ') || '—';
  const nvrIp = nvr?.ip && nvr?.port ? `${nvr.ip}:${nvr.port}` : nvr?.ip || '—';
  const camModel = channel?.model || '—';
  const camSerial = channel?.serialNumber || '—';
  const camIp = channel?.ipAddress || '—';

  return (
    <div className="flex flex-col gap-3.5">
      <div className={cardClass}>
        <div className="mb-[13px] flex items-center justify-between">
          <span className="font-[var(--disp)] text-[13px] font-semibold text-[var(--tx)]">Active Detections</span>
          <span className="font-mono text-[10px] text-[var(--cyan)]">{liveDetections.length} TRACKED</span>
        </div>
        {liveDetections.length ? (
          <div className="flex flex-col gap-3">
            {liveDetections.map((d) => (
              <DetectionRow key={d.key} detection={d} />
            ))}
          </div>
        ) : (
          <div className="text-xs text-[var(--tx3)]">No detections yet on this camera</div>
        )}
      </div>

      <div className={cardClass}>
        <div className="mb-3 font-[var(--disp)] text-[13px] font-semibold text-[var(--tx)]">
          Engines on this Camera
        </div>
        {engines.length ? (
          <div className="flex flex-wrap gap-[7px]">
            {engines.map((name, i) => (
              <EngineChip key={name} name={name} color={ENGINE_PALETTE[i % ENGINE_PALETTE.length]} />
            ))}
          </div>
        ) : (
          <div className="text-xs text-[var(--tx3)]">No detections enabled on this camera</div>
        )}
        <button
          type="button"
          onClick={() => navigate('/engines')}
          className="mt-3.5 w-full rounded-[9px] border border-[rgba(59,130,246,.4)] py-2 text-center text-xs font-medium text-[var(--blue)] cursor-pointer"
        >
          Configure detection zones →
        </button>
      </div>

      <div className={cardClass}>
        <div className="mb-1 font-[var(--disp)] text-[13px] font-semibold text-[var(--tx)]">
          Camera Info
        </div>
        <div className="flex flex-col">
          <InfoRow label="Site" value={site} />
          <InfoRow label="NVR" value={nvrName} />
          <InfoRow label="NVR Model" value={nvrBrandModel} />
          <InfoRow label="NVR IP" value={nvrIp} mono />
          <InfoRow label="Camera" value={channel?.customName || channel?.name || '—'} />
          {camModel !== '—' && <InfoRow label="Camera Model" value={camModel} />}
          {camSerial !== '—' && <InfoRow label="Serial No." value={camSerial} mono />}
          <InfoRow label="Camera IP" value={camIp} mono />
        </div>
      </div>
    </div>
  );
}
