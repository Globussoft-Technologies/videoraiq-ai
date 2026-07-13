import { useEffect, useState } from 'react';
import { Search, Video, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getChannels, getNvrs, getDetectionTypes, toggleChannelDetection, updateChannel, getCamerasByNvr } from '../../../helpers/configure';
import { Popover, PopoverTrigger, PopoverContent } from '../../../pages/AttendanceLogs/components/Popover';
import DetectionZoneMarking from './DetectionZoneMarking';

const DETECTION_FIELD_KEYS = [
  'countPersonsSettings', 'motionDetectionSettings', 'genericObjectDetectionSettings',
  'countVehiclesSettings', 'loiteringWithoutAuthSettings', 'fireSmokeDetectionSettings',
  'weaponDetectionSettings', 'unattendedBaggageDetectionSettings', 'unauthorizedAccessSettings',
  'lineCrossingSettings', 'loiteringWithAuthSettings', 'personalProtectiveEquipmentSettings',
  'crowdDetectionSettings', 'lightDetectionSettings', 'doorDetectionSettings',
  'vehicleDetectionSettings', 'deskAbsenceSettings', 'guardAbsenceSettings',
  'conveyorDetectionSettings', 'crusherDetectionSettings', 'waterSpillageDetectionSettings',
  'vehicleTypeDetectionSettings', 'loiteringDetectionSettings', 'vehicleObstructionSettings',
  'tableOccupancyDetectionSettings', 'foodServicePPEDetectionSettings', 'mobilePhoneDetectionSettings',
];

const CHECK_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'checkout', label: 'Check-out' },
];

// Shared Tailwind classes for the field labels shown beside each value in the mobile card layout.
const M_LABEL = 'font-[family-name:var(--mono)] text-[9.5px] tracking-[.06em] text-[var(--tx3)] shrink-0';

// Shared column-template so the header and desktop rows stay in lockstep.
const GRID_COLS = 'grid-cols-[minmax(200px,1.6fr)_120px_190px_150px_44px]';

// Track a narrow (phone) viewport so the fixed-grid table can fall back to stacked cards.
function useIsMobile(maxWidth = 640) {
  const query = `(max-width:${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return isMobile;
}

function isTypeEnabled(camera, key) {
  return !!(camera?.detections?.[key]?.id && camera.detections[key].enabled);
}

/** Popover: toggle each detection type on/off for this one camera. Rendered in a
 * body portal (see Popover.jsx) so it isn't clipped by the table's overflow:hidden. */
function AppliedTypesPopover({ camera, typeLabels, onToggle }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null); // key currently mid-request

  // Only show types with a real, known label — several DETECTION_FIELD_KEYS
  // are disabled backend-side (no entry in DETECTION_TYPES) and would
  // otherwise render as raw camelCase keys.
  const availableTypes = DETECTION_FIELD_KEYS.filter(key => typeLabels[key]);

  const handleToggle = async (key, next) => {
    setPending(key);
    try {
      await onToggle(camera, key, next);
    } finally {
      setPending(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-[6px] h-[30px] pl-[12px] pr-[10px] rounded-[20px] bg-[rgba(59,130,246,.1)] border border-[rgba(59,130,246,.32)] text-[11.5px] font-medium text-[var(--blue)] cursor-pointer">
          Applied Types
          <ChevronDown size={13} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6}>
        <div className="w-[260px] p-[10px]">
          <div className="font-[family-name:var(--mono)] text-[9.5px] tracking-[.08em] text-[var(--tx3)] pt-[2px] px-[4px] pb-[8px]">
            DETECTION TYPES
          </div>
          {/* Capped to ~5 visible rows (34px each incl. gap) so a long type list scrolls instead of pushing the popover off-screen. */}
          <div className="max-h-[170px] overflow-y-auto flex flex-col gap-[2px]">
            {availableTypes.map(key => {
              const label = typeLabels[key];
              const enabled = isTypeEnabled(camera, key);
              const busy = pending === key;
              return (
                <div key={key} className="flex items-center justify-between gap-[10px] py-[7px] px-[6px]">
                  <span className="text-[12.5px] text-[var(--tx)]">{label}</span>
                  <button
                    onClick={() => handleToggle(key, !enabled)}
                    disabled={busy}
                    className={`w-[36px] h-[20px] rounded-[10px] relative shrink-0 border border-[var(--bd)] ${
                      enabled ? 'bg-[linear-gradient(135deg,var(--blue),var(--violet))]' : 'bg-[var(--bg3,#2a2d3a)]'
                    } ${busy ? 'cursor-wait opacity-60' : 'cursor-pointer opacity-100'}`}
                  >
                    <span
                      className={`absolute top-[1.5px] w-[15px] h-[15px] rounded-full bg-white transition-[left] duration-150 shadow-[0_1px_3px_rgba(0,0,0,.4)] ${
                        enabled ? 'left-[17px]' : 'left-[1.5px]'
                      }`}
                    />
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

function CameraRow({ camera, typeLabels, onOpen, onToggleDetection, onCheckTypeChange, isMobile }) {
  const online = camera.control === 1;

  const identity = (
    <span className="flex items-center gap-[11px] min-w-0">
      <span className="w-[34px] h-[34px] shrink-0 rounded-[9px] flex items-center justify-center bg-[rgba(59,130,246,.13)] text-[var(--blue)]">
        <Video size={18} strokeWidth={1.7} />
      </span>
      <span className="min-w-0">
        <span className="font-semibold block whitespace-nowrap overflow-hidden text-ellipsis">
          {camera.customName || camera.name}
        </span>
        <span className="font-[family-name:var(--mono)] text-[10.5px] text-[var(--tx3)] block">
          {camera.ipAddress || '—'}
        </span>
      </span>
    </span>
  );

  const status = (
    <span className={`flex items-center gap-[6px] text-[11px] font-semibold ${online ? 'text-[var(--ok)]' : 'text-[var(--tx3)]'}`}>
      <span className={`w-[7px] h-[7px] rounded-full ${online ? 'bg-[var(--ok)] shadow-[0_0_6px_var(--ok)]' : 'bg-[var(--tx3)]'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  );

  const appliedTypes = <AppliedTypesPopover camera={camera} typeLabels={typeLabels} onToggle={onToggleDetection} />;

  const cameraTypeSelect = (
    <span className="relative">
      <select
        value={camera.checkType || 'none'}
        onChange={e => onCheckTypeChange(camera, e.target.value)}
        className="h-[32px] pl-[11px] pr-[26px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[12px] outline-none cursor-pointer text-[var(--tx)] appearance-none"
      >
        {CHECK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-[9px] top-[10px] pointer-events-none text-[var(--tx3)]" />
    </span>
  );

  // On phones the 5-column grid can't fit, so each camera becomes a stacked card
  // with its columns turned into labelled rows.
  if (isMobile) {
    return (
      <div
        className="vq-row flex flex-col gap-[12px] py-[14px] px-[16px] border-b border-[var(--bd)] cursor-pointer"
        onClick={onOpen}
      >
        <div className="flex items-center gap-[11px]">
          {identity}
          <span className="ml-auto text-[var(--tx3)] shrink-0"><ChevronRight size={16} /></span>
        </div>
        <div className="flex items-center justify-between gap-[10px]">
          <span className={M_LABEL}>STATUS</span>
          {status}
        </div>
        <div className="flex items-center justify-between gap-[10px]" onClick={e => e.stopPropagation()}>
          <span className={M_LABEL}>DETECTION</span>
          {appliedTypes}
        </div>
        <div className="flex items-center justify-between gap-[10px]" onClick={e => e.stopPropagation()}>
          <span className={M_LABEL}>CAMERA TYPE</span>
          {cameraTypeSelect}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`vq-row grid ${GRID_COLS} gap-0 py-[13px] px-[18px] border-b border-[var(--bd)] items-center text-[13px] cursor-pointer transition-colors duration-[120ms]`}
      onClick={onOpen}
    >
      {identity}
      <span className="flex justify-center">{status}</span>
      <span className="flex justify-center" onClick={e => e.stopPropagation()}>{appliedTypes}</span>
      <span className="flex justify-center" onClick={e => e.stopPropagation()}>{cameraTypeSelect}</span>
      <span className="flex justify-center text-[var(--tx3)]">
        <ChevronRight size={16} />
      </span>
    </div>
  );
}

const LIMIT = 12;

export default function DetectionSettings() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [nvrFilter, setNvrFilter] = useState('');
  const [page, setPage] = useState(0);
  const [openCamera, setOpenCamera] = useState(null);

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
  const onlineCount = cameras.filter(c => c.control === 1).length;

  // Matches V1: a single toggle endpoint for on/off; 404s if the type was
  // never linked to this camera (no auto-create — same as V1's real behavior).
  const handleToggleDetection = async (camera, detectionType, enable) => {
    try {
      await toggleChannelDetection({ channelId: camera._id, detectionType, enable });
      channelsApi.refetch();
    } catch (err) {
      const msg = err?.response?.data?.body?.message || 'Failed to update detection type.';
      toast.error(msg);
    }
  };

  const handleCheckTypeChange = async (camera, checkType) => {
    try {
      await updateChannel(camera._id, { checkType });
      channelsApi.refetch();
    } catch {
      toast.error('Failed to update camera type.');
    }
  };

  // Re-fetch just this camera (with freshly-populated detections/settings) after
  // a save inside Zone Marking, so a just-created DetectionSetting's id shows up
  // without the user having to leave and reopen the camera.
  // GET /channel/nvr/:nvrId (getCamerasByNvr) doesn't populate nvrId — it comes
  // back as a raw id, not an object — so re-attach the already-populated nvrId
  // from the current snapshot rather than letting it be overwritten with the
  // raw id, which would break the stream URL (camera.nvrId._id).
  const refreshOpenCamera = async () => {
    if (!openCamera?.nvrId?._id) return;
    try {
      const list = await getCamerasByNvr(openCamera.nvrId._id);
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
        onBack={() => { setOpenCamera(null); channelsApi.refetch(); }}
        onSaved={refreshOpenCamera}
      />
    );
  }

  return (
    <div className={`${isMobile ? 'p-[14px]' : 'p-[22px]'} flex flex-col gap-[16px]`}>
      <div className="flex items-center gap-[12px] flex-wrap">
        <div className={`relative flex-1 min-w-[200px] ${isMobile ? 'max-w-full' : 'max-w-[320px]'}`}>
          <Search size={16} className="absolute left-[12px] top-1/2 -translate-y-1/2 text-[var(--tx3)]" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Filter cameras…"
            className="w-full h-[40px] pl-[36px] pr-[12px] box-border rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)] text-[13px] text-[var(--tx)] outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={nvrFilter}
            onChange={e => { setNvrFilter(e.target.value); setPage(0); }}
            className="h-[40px] pl-[13px] pr-[34px] rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)] text-[13px] outline-none cursor-pointer text-[var(--tx)] appearance-none"
          >
            <option value="">All NVRs</option>
            {nvrs.map(n => <option key={n._id} value={n._id}>{n.nvrName}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-[12px] top-1/2 -translate-y-1/2 pointer-events-none text-[var(--tx3)]" />
        </div>
        <span className="ml-auto font-[family-name:var(--mono)] text-[11px] text-[var(--tx3)]">
          {onlineCount} online · {total} total
        </span>
      </div>

      <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[15px] overflow-hidden">
        {/* Column header — hidden on phones, where each row renders its own inline labels. */}
        <div className={`${isMobile ? 'hidden' : 'grid'} ${GRID_COLS} gap-0 py-[12px] px-[18px] border-b border-[var(--bd)] font-[family-name:var(--mono)] text-[9.5px] tracking-[.06em] text-[var(--tx3)] items-center`}>
          <span>CAMERA NAME</span>
          <span className="text-center">STATUS</span>
          <span className="text-center">ENABLE DETECTION</span>
          <span className="text-center">CAMERA TYPE</span>
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
          {() => cameras.map(camera => (
            <CameraRow
              key={camera._id}
              camera={camera}
              typeLabels={typeLabels}
              onOpen={() => setOpenCamera(camera)}
              onToggleDetection={handleToggleDetection}
              onCheckTypeChange={handleCheckTypeChange}
              isMobile={isMobile}
            />
          ))}
        </AsyncBoundary>
      </div>

      {pages > 1 && (
        <div className="flex justify-center gap-[4px]">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-[30px] h-[30px] rounded-[7px] text-[12px] cursor-pointer border ${
                page === i
                  ? 'bg-[var(--blue)] text-white border-[var(--blue)]'
                  : 'bg-[var(--bg2)] text-[var(--tx3)] border-[var(--bd)]'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
