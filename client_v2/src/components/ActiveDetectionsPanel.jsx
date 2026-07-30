import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar, Settings, Map, Monitor, MapPin, HardDrive, Cpu, Globe, Video, Layers, Barcode, Network, Cctv } from 'lucide-react';
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

function InfoRow({ icon: Icon, tint, label, value, mono }) {
  return (
    <div className="grid grid-cols-[15px_auto_1fr] items-center gap-x-2 py-[10px] border-b border-[var(--bd)] last:border-b-0">
      {Icon && <Icon size={13} className="flex-none" style={{ color: tint || 'var(--tx3)' }} strokeWidth={2} />}
      <span className="min-w-[78px] shrink-0 whitespace-nowrap text-[12px] text-[var(--tx3)]">{label}</span>
      <span
        className={`min-w-0 truncate text-left text-[12.5px] font-medium text-[var(--tx)] ${mono ? 'font-mono text-[11px]' : ''}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function SectionIcon({ icon: Icon, tint }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{ background: `${tint}1a`, color: tint }}
    >
      <Icon size={15} strokeWidth={2} />
    </span>
  );
}

const cardClass = 'rounded-[14px] border border-[var(--bd)] bg-[var(--bg1)] p-4';
const cardClassFlush = 'rounded-[14px] border border-[var(--bd)] bg-[var(--bg1)] overflow-hidden';

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
    <div className="flex flex-col gap-4">
      <div className={cardClass}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <SectionIcon icon={Radar} tint="var(--blue)" />
            <div className="min-w-0">
              <div className="font-[var(--disp)] text-[13.5px] font-semibold leading-tight text-[var(--tx)]">Active Detections</div>
              {!liveDetections.length && (
                <div className="text-[11px] leading-tight text-[var(--tx3)]">No detections yet on this camera</div>
              )}
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[rgba(34,197,94,.14)] px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide text-[var(--ok)]">
            <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--ok)]" />
            TRACKED
          </span>
        </div>
        {liveDetections.length > 0 && (
          <div className="flex flex-col gap-3">
            {liveDetections.map((d) => (
              <DetectionRow key={d.key} detection={d} />
            ))}
          </div>
        )}
      </div>

      <div className={cardClass}>
        <div className="mb-3 flex items-center gap-2.5">
          <SectionIcon icon={Settings} tint="var(--violet)" />
          <div className="min-w-0">
            <div className="font-[var(--disp)] text-[13.5px] font-semibold leading-tight text-[var(--tx)]">Engines on this Camera</div>
            {!engines.length && (
              <div className="text-[11px] leading-tight text-[var(--tx3)]">No detections enabled on this camera</div>
            )}
          </div>
        </div>
        {engines.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-[7px]">
            {engines.map((name, i) => (
              <EngineChip key={name} name={name} color={ENGINE_PALETTE[i % ENGINE_PALETTE.length]} />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate('/engines')}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(59,130,246,.4)] py-2 text-center text-[12px] font-medium text-[var(--blue)] cursor-pointer"
        >
          <Map size={13} strokeWidth={2} />
          Configure detection zones →
        </button>
      </div>

      <div className={cardClassFlush}>
        <div
          className="relative flex items-center gap-2.5 overflow-hidden px-4 py-3.5"
          style={{ background: 'linear-gradient(120deg, rgba(59,130,246,.12), rgba(168,85,247,.12))' }}
        >
          <span
            className="pointer-events-none absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ background: 'rgba(168,85,247,.16)', color: 'var(--violet)' }}
          >
            <Cctv size={20} strokeWidth={1.75} />
          </span>
          <SectionIcon icon={Monitor} tint="var(--blue)" />
          <div className="relative font-[var(--disp)] text-[13.5px] font-semibold text-[var(--tx)]">Camera Information</div>
        </div>
        <div className="flex flex-col px-4 pb-1 pt-1">
          <InfoRow icon={MapPin} tint="var(--blue)" label="Site" value={site} />
          <InfoRow icon={HardDrive} tint="var(--magenta)" label="NVR" value={nvrName} />
          <InfoRow icon={Cpu} tint="var(--violet)" label="NVR Model" value={nvrBrandModel} />
          <InfoRow icon={Globe} tint="var(--cyan)" label="NVR IP" value={nvrIp} mono />
          <InfoRow icon={Video} tint="var(--ok)" label="Camera" value={channel?.customName || channel?.name || '—'} />
          {camModel !== '—' && <InfoRow icon={Layers} tint="var(--violet)" label="Camera Model" value={camModel} />}
          {camSerial !== '—' && <InfoRow icon={Barcode} tint="var(--warn)" label="Serial No." value={camSerial} mono />}
          <InfoRow icon={Network} tint="var(--blue)" label="Camera IP" value={camIp} mono />
        </div>
      </div>
    </div>
  );
}
