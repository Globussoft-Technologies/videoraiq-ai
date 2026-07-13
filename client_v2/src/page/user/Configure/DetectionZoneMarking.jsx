import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Video, Pencil, Undo2, Trash2, Save, Maximize, Minimize, X, Wifi, Minus, Plus, CheckCircle2, ChevronDown, AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import useHlsPlayer from '../../../hooks/useHlsPlayer';
import { streamUrl } from '../../../lib/stream';
import { useApi } from '../../../hooks/useApi';
import { getDetectionTypes, updateDetectionSetting, createDetectionSetting, deleteDetectionSetting } from '../../../helpers/configure';
import { getRecipients } from '../../../api/administer';
import { Popover, PopoverTrigger, PopoverContent } from '../../../pages/AttendanceLogs/components/Popover';
import ZoneScheduleFields, { TimezoneField, emptySchedule, scheduleFromConfig, buildScheduleFields, scheduleError } from './ZoneScheduleFields';

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

const DEFAULT_MAX_POINTS = 4; // V1 defaults to 3; bumped to 4 per product request. Floor stays 3 (min to close a polygon).
const MIN_POINTS_TO_CLOSE = 3;

// Track a narrow (phone) viewport so the fixed video + right-rail grid can stack.
function useIsMobile(maxWidth = 860) {
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

/**
 * Per-zone extra fields, by detection type — product spec (V1's own schema/UI
 * is inconsistent across these types, so this is the authoritative source,
 * not a port). Both fields reuse Desk Absence's existing per-zone field names
 * (settings.zone_configs[i].capacity / .threshold_sec) generalized to any type
 * that needs them, rather than inventing new field names.
 */
const ZONE_EXTRA_FIELDS = {
  vehicleObstructionSettings: ['threshold'],
  guardAbsenceSettings: ['threshold'],
  loiteringDetectionSettings: ['threshold'],
  loiteringWithoutAuthSettings: ['threshold'],
  loiteringWithAuthSettings: ['threshold'],
  tableOccupancyDetectionSettings: ['threshold'],
  deskAbsenceSettings: ['threshold', 'capacity'],
  crowdDetectionSettings: ['capacity'],
};

function extraFieldsFor(settingType) {
  return ZONE_EXTRA_FIELDS[settingType] || [];
}

/**
 * All detection types (from the global catalog), each flagged with whether
 * it's already linked to this camera. Matches V1: the dropdown lists every
 * type, not just configured ones — selecting an unconfigured type and saving
 * creates a new DetectionSetting rather than requiring one to exist first.
 */
function allTypesFor(camera, typeLabels) {
  const detections = camera?.detections || {};
  return DETECTION_FIELD_KEYS
    .filter(key => typeLabels[key]) // only types the backend actually supports (has a label)
    .map(key => {
      const entry = detections[key];
      const setting = entry?.id && typeof entry.id === 'object' ? entry.id : null;
      return {
        settingType: key,
        label: typeLabels[key],
        configured: !!(entry?.id),
        settingId: setting?._id || (entry?.id && typeof entry.id !== 'object' ? entry.id : null),
        setting,
      };
    });
}

/**
 * A camera+type can have multiple named zones (e.g. two separate counting
 * areas in one frame). Points are native video pixel coordinates, tied to
 * the video's resolution: settings.referencePoints[cameraId] = an array of
 * polygons, each a flat [[x,y], [x,y], ...] list. Names are index-aligned in
 * settings.zone_configs = [{ name }, ...] (same field V1 uses for Desk
 * Absence's per-zone metadata, reused here generically for any type).
 */
function zonesFor(setting, cameraId) {
  const raw = setting?.settings?.referencePoints?.[cameraId];
  const configs = setting?.settings?.zone_configs || [];
  if (!Array.isArray(raw) || !raw.length) return [];
  // Tolerate a legacy single-polygon shape ([x,y] pairs, no outer nesting) alongside the multi-zone shape.
  const isMultiZone = Array.isArray(raw[0]?.[0]);
  const polygons = isMultiZone ? raw : [raw];
  return polygons.map((poly, i) => ({
    name: configs[i]?.name || `Zone ${i + 1}`,
    capacity: configs[i]?.capacity ?? '',
    threshold: configs[i]?.threshold_sec ?? '',
    // Restore the saved startTime/endTime into the schedule picker.
    schedule: scheduleFromConfig(configs[i]),
    points: (poly || []).map(p => (Array.isArray(p) ? { x: p[0], y: p[1] } : p)),
  }));
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];

/**
 * V1's "Save Detection Area" modal — collects a Detection Name and Priority
 * (settings.levelOfImportance) before every save, for both create and update.
 * Also collects Zone Name + any type-specific extra fields (Capacity/
 * Threshold) for every zone about to be saved, so a first-time save doesn't
 * create a zone with those required fields blank — matching V1's modal,
 * which expands a per-zone section for types that need it.
 */
function SaveDetectionAreaModal({ initialName, initialPriority, zones, extraFields, saving, onCancel, onSubmit }) {
  const [detectionName, setDetectionName] = useState(initialName || '');
  const [priority, setPriority] = useState(initialPriority || 'moderate');
  const [zoneDrafts, setZoneDrafts] = useState(zones);
  const [errors, setErrors] = useState({});

  const updateZoneField = (index, field, value) => {
    setZoneDrafts(prev => prev.map((z, i) => (i === index ? { ...z, [field]: value } : z)));
    setErrors(er => ({ ...er, [`zone-${index}-${field}`]: false }));
  };

  const handleSubmit = () => {
    const nextErrors = {};
    if (!detectionName.trim()) nextErrors.detectionName = true;
    zoneDrafts.forEach((z, i) => {
      if (!String(z.name || '').trim()) nextErrors[`zone-${i}-name`] = true;
    });
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    // Schedule window must be valid (end after start) for every zone.
    for (let i = 0; i < zoneDrafts.length; i++) {
      const err = scheduleError(zoneDrafts[i].schedule);
      if (err) { toast.error(`Zone ${i + 1}: ${err}`); return; }
    }
    onSubmit({ detectionName: detectionName.trim(), priority, zones: zoneDrafts });
  };

  return (
    <div className="fixed inset-0 bg-[rgba(6,9,15,.6)] z-[50] flex items-center justify-center p-[20px]">
      <div className="w-full max-w-[440px] max-h-[85vh] overflow-y-auto bg-[var(--bg1solid)] border border-[var(--bd2)] rounded-[16px] p-[22px] shadow-[0_24px_64px_rgba(0,0,0,.45)]">
        <div className="flex items-center justify-between mb-[16px]">
          <span className="font-[family-name:var(--disp)] font-semibold text-[15.5px]">Save Detection Area</span>
          <span onClick={onCancel} className="cursor-pointer text-[var(--tx3)] flex">
            <X size={17} />
          </span>
        </div>

        <div className="flex flex-col gap-[14px]">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--tx2)] mb-[6px]">Detection Name</label>
            <input
              autoFocus
              value={detectionName}
              onChange={e => { setDetectionName(e.target.value); setErrors(er => ({ ...er, detectionName: false })); }}
              maxLength={50}
              placeholder="Enter detection name"
              className={`w-full h-[40px] px-[12px] rounded-[9px] box-border bg-[var(--bg2)] border ${errors.detectionName ? 'border-[var(--danger,#ef4444)]' : 'border-[var(--bd)]'} text-[13px] text-[var(--tx)] outline-none`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[var(--tx2)] mb-[6px]">Priority</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="w-full h-[40px] px-[12px] rounded-[9px] box-border bg-[var(--bg2)] border border-[var(--bd)] text-[13px] text-[var(--tx)] outline-none cursor-pointer"
            >
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Global time zone — one setting for all zones' schedules. */}
          <TimezoneField />

          {zoneDrafts.map((z, i) => (
            <div key={i} className="border border-[var(--bd)] rounded-[10px] p-[12px] flex flex-col gap-[10px]">
              <div className="text-[11.5px] font-semibold text-[var(--tx2)]">Zone {i + 1}</div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[var(--tx3)] mb-[5px]">Zone Name</label>
                <input
                  value={z.name}
                  onChange={e => updateZoneField(i, 'name', e.target.value)}
                  maxLength={50}
                  placeholder="Enter zone name"
                  className={`w-full h-[36px] px-[11px] rounded-[8px] box-border bg-[var(--bg2)] border ${errors[`zone-${i}-name`] ? 'border-[var(--danger,#ef4444)]' : 'border-[var(--bd)]'} text-[12.5px] text-[var(--tx)] outline-none`}
                />
              </div>
              {extraFields.includes('capacity') && (
                <div>
                  <label className="block text-[10.5px] font-semibold text-[var(--tx3)] mb-[5px]">Capacity</label>
                  <input
                    type="number"
                    min={0}
                    value={z.capacity}
                    onChange={e => updateZoneField(i, 'capacity', e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full h-[36px] px-[11px] rounded-[8px] box-border bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] text-[var(--tx)] outline-none"
                  />
                </div>
              )}
              {extraFields.includes('threshold') && (
                <div>
                  <label className="block text-[10.5px] font-semibold text-[var(--tx3)] mb-[5px]">Threshold (sec)</label>
                  <input
                    type="number"
                    min={0}
                    value={z.threshold}
                    onChange={e => updateZoneField(i, 'threshold', e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full h-[36px] px-[11px] rounded-[8px] box-border bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] text-[var(--tx)] outline-none"
                  />
                </div>
              )}
              {/* Per-zone schedule (Time Range). Timezone is global (below Priority). */}
              <ZoneScheduleFields
                value={z.schedule}
                onChange={schedule => updateZoneField(i, 'schedule', schedule)}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-[10px] mt-[20px]">
          <button
            onClick={onCancel}
            disabled={saving}
            className="h-[38px] px-[16px] rounded-[9px] bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] font-medium text-[var(--tx2)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={`h-[38px] px-[18px] rounded-[9px] bg-[linear-gradient(135deg,var(--blue),var(--violet))] border-none text-[12.5px] font-semibold text-white ${saving ? 'cursor-not-allowed opacity-70' : 'cursor-pointer opacity-100'}`}
          >
            {saving ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function polygonPointsAttr(points, videoW, videoH, boxW, boxH) {
  if (!videoW || !videoH) return '';
  return points.map(p => `${(p.x / videoW * boxW).toFixed(1)},${(p.y / videoH * boxH).toFixed(1)}`).join(' ');
}

/**
 * Custom dropdown replacing a native <select> — a native <select>'s options
 * list ignores CSS max-height entirely, so a long detection-type list would
 * always render every option at once. This caps to ~5 visible rows and
 * scrolls the rest, same pattern as the "Applied Types" popover.
 */
function DetectionTypeDropdown({ types, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState(null);
  const triggerRef = useRef(null);
  const activeLabel = types.find(t => t.settingType === value)?.label || 'Select Detection Type';

  return (
    <Popover
      open={open}
      onOpenChange={(v) => { if (v) setTriggerWidth(triggerRef.current?.offsetWidth); setOpen(v); }}
      className="block w-full"
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          className="w-full h-[42px] pr-[34px] pl-[13px] rounded-[10px] bg-[var(--bg2)] border border-[var(--blue)] text-[13px] outline-none cursor-pointer text-[var(--tx)] shadow-[0_0_0_3px_rgba(59,130,246,.14)] flex items-center justify-between text-left"
        >
          {activeLabel}
          <ChevronDown size={15} className={`text-[var(--blue)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6}>
        <div style={{ width: triggerWidth || 320 }} className="max-h-[176px] overflow-y-auto bg-[var(--bg1solid)] border border-[var(--bd2)] rounded-[12px] shadow-[0_18px_50px_rgba(0,0,0,.35)] p-[5px]">
          {types.map(t => {
            const selected = t.settingType === value;
            return (
              <div
                key={t.settingType}
                onClick={() => { onChange(t.settingType); setOpen(false); }}
                className={`py-[8px] px-[10px] rounded-[7px] text-[12.5px] cursor-pointer ${selected ? 'bg-[var(--blue)] text-white' : 'bg-transparent text-[var(--tx)]'} flex items-center justify-between gap-[8px]`}
              >
                <span>{t.label}</span>
                {t.configured && <CheckCircle2 size={13} className={`shrink-0 ${selected ? 'text-white' : 'text-[var(--ok)]'}`} />}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Right-rail "Zone Settings" — lists every zone saved for the active
 * detection type, each independently renamable/deletable (V1's per-zone
 * rename+trash panel, generalized here to any detection type rather than
 * just Desk Absence, since one camera+type can hold multiple named zones).
 */
function ZoneSettingsPanel({ zones, extraFields, activeIndex, onSetActive, onUpdateField, onSave, onDelete, savingIndex }) {
  const [expanded, setExpanded] = useState(null);

  if (zones.length === 0) return null;

  return (
    <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[15px] p-[16px]">
      <div className="font-[family-name:var(--disp)] font-semibold text-[14px] mb-[5px]">Zone Settings</div>
      <div className="text-[11px] text-[var(--tx3)] mb-[12px]">
        {zones.length} zone{zones.length === 1 ? '' : 's'} drawn on this camera for this detection type.
      </div>
      {/* Global time zone — schedules for every zone are interpreted against it. */}
      <div className="mb-[12px]">
        <TimezoneField />
      </div>
      <div className="flex flex-col gap-[8px]">
        {zones.map((z, i) => {
          const isOpen = expanded === i;
          return (
            <div
              key={i}
              className="border border-[var(--bd)] rounded-[10px] overflow-hidden"
              onMouseEnter={() => onSetActive(i)}
              onMouseLeave={() => onSetActive(null)}
            >
              <div
                onClick={() => setExpanded(isOpen ? null : i)}
                className={`flex items-center gap-[8px] py-[9px] px-[11px] cursor-pointer ${activeIndex === i ? 'bg-[rgba(245,158,11,.1)]' : 'bg-transparent'}`}
              >
                <ChevronDown size={14} className={`text-[var(--tx3)] transition-transform duration-150 shrink-0 ${isOpen ? '' : '-rotate-90'}`} />
                <span className="text-[12.5px] font-medium flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{z.name}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); onDelete(i); }}
                  title="Delete this zone"
                  className={`flex text-[#ef4444] cursor-pointer ${savingIndex === i ? 'opacity-50' : 'opacity-100'}`}
                >
                  <Trash2 size={14} />
                </span>
              </div>
              {isOpen && (
                <div className="py-[10px] px-[11px] border-t border-[var(--bd)] flex flex-col gap-[8px]">
                  <div>
                    <label className="block text-[10px] font-semibold text-[var(--tx3)] mb-[5px]">Zone Name</label>
                    <input
                      value={z.name}
                      onChange={e => onUpdateField(i, 'name', e.target.value)}
                      maxLength={50}
                      className="w-full h-[34px] px-[10px] rounded-[8px] box-border bg-[var(--bg2)] border border-[var(--bd)] text-[12px] text-[var(--tx)] outline-none"
                    />
                  </div>
                  {extraFields.includes('capacity') && (
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--tx3)] mb-[5px]">Capacity</label>
                      <input
                        type="number"
                        min={0}
                        value={z.capacity}
                        onChange={e => onUpdateField(i, 'capacity', e.target.value)}
                        placeholder="e.g. 10"
                        className="w-full h-[34px] px-[10px] rounded-[8px] box-border bg-[var(--bg2)] border border-[var(--bd)] text-[12px] text-[var(--tx)] outline-none"
                      />
                    </div>
                  )}
                  {extraFields.includes('threshold') && (
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--tx3)] mb-[5px]">Threshold (sec)</label>
                      <input
                        type="number"
                        min={0}
                        value={z.threshold}
                        onChange={e => onUpdateField(i, 'threshold', e.target.value)}
                        placeholder="e.g. 30"
                        className="w-full h-[34px] px-[10px] rounded-[8px] box-border bg-[var(--bg2)] border border-[var(--bd)] text-[12px] text-[var(--tx)] outline-none"
                      />
                    </div>
                  )}
                  {/* Per-zone schedule (Time Range). */}
                  <ZoneScheduleFields
                    value={z.schedule}
                    onChange={schedule => onUpdateField(i, 'schedule', schedule)}
                  />
                  <button
                    onClick={() => onSave(i)}
                    disabled={savingIndex === i}
                    className={`self-end flex items-center gap-[5px] h-[30px] px-[12px] rounded-[7px] bg-[var(--blue)] border-none text-[11.5px] font-semibold text-white ${savingIndex === i ? 'cursor-not-allowed opacity-60' : 'cursor-pointer opacity-100'}`}
                  >
                    <Save size={12} /> {savingIndex === i ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DetectionZoneMarking({ camera, onBack, onSaved }) {
  const isMobile = useIsMobile();
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  // Single state machine (mirrors PlaybackTimeline.jsx) instead of two
  // independent booleans — those could disagree mid-retry (onStarted firing
  // after onError already fired) and leave neither overlay condition true,
  // rendering a blank box instead of buffering/error UI.
  const [videoState, setVideoState] = useState('loading'); // loading | ready | error
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });

  const typesApi = useApi(() => getDetectionTypes(), []);
  const typeLabels = typesApi.data || {};

  const allTypes = useMemo(() => allTypesFor(camera, typeLabels), [camera, typeLabels]);
  const [selectedType, setSelectedType] = useState(null);

  useEffect(() => {
    if (!selectedType && allTypes.length) setSelectedType(allTypes[0].settingType);
  }, [allTypes, selectedType]);

  const activeType = allTypes.find(t => t.settingType === selectedType) || null;

  // Saved/committed zones for this camera+type — each { name, points }. Points
  // are native video pixel coordinates, matching V1's saved shape.
  const [zones, setZones] = useState([]);
  // The polygon currently being drawn, not yet committed to `zones`.
  const [points, setPoints] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maxPoints, setMaxPoints] = useState(DEFAULT_MAX_POINTS);
  const [activeZoneIndex, setActiveZoneIndex] = useState(null); // which saved zone is highlighted/being renamed

  // Load this type's saved zones whenever the selected detection type changes.
  useEffect(() => {
    setZones(zonesFor(activeType?.setting, camera._id));
    setPoints([]);
    setDrawing(false);
    setActiveZoneIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  // Trim an in-progress polygon if the max-points cap is lowered below what's already placed.
  useEffect(() => {
    setPoints(prev => (prev.length > maxPoints ? prev.slice(0, maxPoints) : prev));
  }, [maxPoints]);

  const url = camera?.nvrId?._id ? `stream/${camera.nvrId._id}-${camera._id}/playlist.m3u8` : '';
  useHlsPlayer(videoRef, streamUrl({ streamingUrl: url }), {
    enabled: !!url,
    onError: () => setVideoState('error'),
    onStarted: () => setVideoState(s => (s === 'ready' ? s : 'loading')), // retrying after a 404 — stay in loading, don't clear a real error into limbo
  });

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v?.videoWidth) setVideoSize({ w: v.videoWidth, h: v.videoHeight });
  };
  const handleVideoReady = () => setVideoState('ready');

  const handleStageClick = (e) => {
    if (!drawing || !videoSize.w) return;
    if (points.length >= maxPoints) return; // cap reached — ignore further clicks, matching V1
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * videoSize.w);
    const y = Math.round((e.clientY - rect.top) / rect.height * videoSize.h);
    setPoints(prev => [...prev, { x, y }]);
  };

  const handleUndo = () => setPoints(prev => prev.slice(0, -1));
  const handleClear = () => setPoints([]);

  // Quick-start rectangle presets (V1 parity) — full-frame / a small fixed
  // box — the user then drags points to adjust; these aren't size limits.
  const handleMaxArea = () => {
    if (!videoSize.w) return;
    const { w, h } = videoSize;
    setPoints([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
    setDrawing(false);
  };
  const handleMinArea = () => {
    if (!videoSize.w) return;
    setPoints([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }]);
    setDrawing(false);
  };

  const handleUpdateZoneField = (index, field, value) => {
    setZones(prev => prev.map((z, i) => (i === index ? { ...z, [field]: value } : z)));
  };

  const persistZones = async ({ detectionName, priority, nextZones }) => {
    const polygons = nextZones.map(z => z.points.map(p => [p.x, p.y]));
    const fields = extraFieldsFor(activeType.settingType);
    const zoneConfigs = nextZones.map(z => ({
      name: z.name,
      ...(fields.includes('capacity') ? { capacity: z.capacity === '' ? undefined : Number(z.capacity) } : {}),
      ...(fields.includes('threshold') ? { threshold_sec: z.threshold === '' ? undefined : Number(z.threshold) } : {}),
      // startTime/endTime added only when fully selected in the schedule picker.
      ...buildScheduleFields(z.schedule),
    }));
    if (activeType.settingId) {
      const setting = activeType.setting;
      await updateDetectionSetting(activeType.settingId, {
        name: detectionName ?? setting.name,
        enabled: setting.enabled,
        settingType: setting.settingType,
        NVRId: camera.nvrId?._id,
        channelId: [camera._id],
        settings: {
          ...setting.settings,
          levelOfImportance: priority ?? setting.settings?.levelOfImportance,
          referencePoints: { ...setting.settings?.referencePoints, [camera._id]: polygons },
          zone_configs: zoneConfigs,
          videoResolution: [videoSize.w, videoSize.h],
        },
      });
    } else {
      await createDetectionSetting({
        name: detectionName,
        settingType: activeType.settingType,
        channelId: [camera._id],
        NVRId: camera.nvrId?._id,
        enabled: true,
        settings: {
          levelOfImportance: priority,
          referencePoints: { [camera._id]: polygons },
          zone_configs: zoneConfigs,
          videoResolution: [videoSize.w, videoSize.h],
        },
        alerts: [],
      });
    }
  };

  // V1 always collects Detection Name / Priority in a modal before saving,
  // for both create and update — never a silent save. The zone(s) about to be
  // saved (including the in-progress polygon currently on the canvas) are
  // captured here too, so the modal can collect Capacity/Threshold for types
  // that need them right away, instead of requiring a second trip through the
  // Zone Settings panel after the zone already exists.
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingZones, setPendingZones] = useState([]);

  const handleOpenSaveModal = () => {
    if (!activeType) return;
    // The in-progress polygon on the canvas is folded straight into the save,
    // so drawing once and hitting Save works without a separate commit step.
    if (zones.length === 0 && points.length < MIN_POINTS_TO_CLOSE) return;
    const nextZones = points.length >= MIN_POINTS_TO_CLOSE
      ? [...zones, { name: `Zone ${zones.length + 1}`, capacity: '', threshold: '', schedule: emptySchedule(), points }]
      : zones;
    setPendingZones(nextZones);
    setShowSaveModal(true);
  };

  const handleSubmitSave = async ({ detectionName, priority, zones: editedZones }) => {
    setSaving(true);
    try {
      await persistZones({ detectionName, priority, nextZones: editedZones });
      setZones(editedZones);
      setPoints([]);
      setDrawing(false);
      setShowSaveModal(false);
      toast.success(activeType.settingId ? 'Detection settings updated successfully.' : 'Detection area created and saved.');
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to save zone.');
    } finally {
      setSaving(false);
    }
  };

  // Rename/delete a single already-saved zone — a full save through the same
  // update path (V1's ZoneSettingsPanel does the same: it's a full PUT with
  // that one zone's entry filtered out or edited, not a separate endpoint).
  const [savingZoneIndex, setSavingZoneIndex] = useState(null);

  const handleSaveZoneName = async (index) => {
    if (!activeType?.settingId) return;
    const err = scheduleError(zones[index]?.schedule);
    if (err) { toast.error(err); return; }
    setSavingZoneIndex(index);
    try {
      await persistZones({ nextZones: zones });
      toast.success('Zone updated.');
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to update zone.');
    } finally {
      setSavingZoneIndex(null);
    }
  };

  const handleDeleteZone = async (index) => {
    const nextZones = zones.filter((_, i) => i !== index);
    if (!activeType?.settingId) {
      setZones(nextZones); // never saved — just drop it locally
      return;
    }
    setSavingZoneIndex(index);
    try {
      await persistZones({ nextZones });
      setZones(nextZones);
      toast.success('Zone deleted.');
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to delete zone.');
    } finally {
      setSavingZoneIndex(null);
    }
  };

  // "Reset Detection UI" — same DELETE /api/v1/detection-settings/:id V1 uses
  // under that label (Innersettings.jsx → ResetConfirmationDialog). Removes the
  // whole DetectionSetting doc and unlinks it from every camera referencing it,
  // not just this one.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteArea = async () => {
    if (!activeType?.settingId) return;
    setDeleting(true);
    try {
      await deleteDetectionSetting(activeType.settingId);
      toast.success('Detection settings reset successfully.');
      setZones([]);
      setPoints([]);
      setShowDeleteConfirm(false);
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to reset detection settings.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Alert Recipients (scoped to the selected detection type) ──────────────
  const recipientsApi = useApi(() => getRecipients({ limit: 200 }), []);
  const allRecipients = recipientsApi.data?.recipients ?? [];
  const [pendingAlerts, setPendingAlerts] = useState(null); // null = not yet touched for this type
  const [savingAlerts, setSavingAlerts] = useState(false);

  useEffect(() => { setPendingAlerts(null); }, [selectedType]);

  const alertIds = pendingAlerts ?? (activeType?.setting?.alerts || []).map(String);
  const selectedRecipients = allRecipients.filter(r => alertIds.includes(String(r._id)));
  const addableRecipients = allRecipients.filter(r => !alertIds.includes(String(r._id)));

  const persistAlerts = async (nextIds) => {
    if (!activeType?.settingId) return;
    setPendingAlerts(nextIds);
    setSavingAlerts(true);
    try {
      await updateDetectionSetting(activeType.settingId, { alerts: nextIds });
    } catch {
      // Keep the optimistic local state — a retry (add/remove again) will resend the full list.
    } finally {
      setSavingAlerts(false);
    }
  };

  const addRecipient = (id) => { if (id) persistAlerts([...alertIds, id]); };
  const removeRecipient = (id) => persistAlerts(alertIds.filter(x => x !== id));

  return (
    <div className={`${isMobile ? 'p-[14px]' : 'p-[22px]'} flex flex-col gap-[16px]`}>
      <div className="flex items-center gap-[12px] flex-wrap">
        <button
          onClick={onBack}
          className="w-[36px] h-[36px] flex items-center justify-center rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)] text-[var(--tx2)] cursor-pointer"
        >
          <ArrowLeft size={17} />
        </button>
        <span className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center bg-[rgba(59,130,246,.13)] text-[var(--blue)]">
          <Video size={20} strokeWidth={1.7} />
        </span>
        <div>
          <div className="font-[family-name:var(--disp)] font-semibold text-[16px]">
            {camera.customName || camera.name}
          </div>
          <div className="font-[family-name:var(--mono)] text-[10.5px] text-[var(--tx3)]">
            {camera.ipAddress || '—'} · Zone Marking
          </div>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={!activeType?.settingId}
          title={activeType?.settingId ? 'Reset all detection settings for this detection type' : 'Nothing saved yet for this detection type'}
          className={`ml-auto flex items-center gap-[7px] h-[36px] px-[14px] rounded-[9px] bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] font-medium ${activeType?.settingId ? 'text-[#ef4444] cursor-pointer opacity-100' : 'text-[var(--tx3)] cursor-not-allowed opacity-50'}`}
        >
          <RotateCcw size={15} /> Reset Detection UI
        </button>
      </div>

      <div className={`grid ${isMobile ? 'grid-cols-[1fr]' : 'grid-cols-[1fr_320px]'} ${isMobile ? 'gap-[14px]' : 'gap-[18px]'} items-start`}>
        {/* Video + drawing tools */}
        <div className={`bg-[var(--bg1)] border border-[var(--bd)] rounded-[15px] ${isMobile ? 'p-[12px]' : 'p-[16px]'} min-w-0`}>
          <div className="flex items-center gap-[8px] mb-[12px]">
            <Pencil size={16} color="var(--blue)" strokeWidth={1.9} />
            <span className="font-[family-name:var(--disp)] font-semibold text-[14px]">Zone Marking</span>
          </div>

          <div className={`grid ${(activeType?.configured && !isMobile) ? 'grid-cols-[1fr_1fr]' : 'grid-cols-[1fr]'} gap-[10px] mb-[14px]`}>
            <div>
              <div className="font-[family-name:var(--mono)] text-[9.5px] tracking-[.08em] text-[var(--tx3)] mb-[7px]">
                DETECTION TYPE
              </div>
              {allTypes.length === 0 ? (
                <div className="h-[42px] flex items-center px-[13px] rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] text-[var(--tx3)]">
                  No detection types available.
                </div>
              ) : (
                <DetectionTypeDropdown types={allTypes} value={selectedType} onChange={setSelectedType} />
              )}
            </div>

            {/* Detection Name — read-only, populated once a zone has been saved (V1 parity). Zone names now live per-zone in the Zone Settings panel. */}
            {activeType?.configured && (
              <div>
                <div className="font-[family-name:var(--mono)] text-[9.5px] tracking-[.08em] text-[var(--tx3)] mb-[7px]">
                  DETECTION NAME
                </div>
                <div className="h-[42px] flex items-center px-[13px] rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] text-[var(--tx2)] overflow-hidden text-ellipsis whitespace-nowrap">
                  {activeType.setting?.name || '—'}
                </div>
              </div>
            )}
          </div>

          {activeType && (
            <div className={`flex items-center gap-[5px] mt-[-6px] mb-[14px] text-[10.5px] ${activeType.configured ? 'text-[var(--ok)]' : 'text-[var(--tx3)]'}`}>
              {activeType.configured
                ? <><CheckCircle2 size={12} /> Already configured for this camera</>
                : 'Not configured yet — saving a zone will create it'}
            </div>
          )}

          <div
            ref={stageRef}
            onClick={handleStageClick}
            className={`relative rounded-[12px] overflow-hidden aspect-[16/9] bg-[#0a0e15] border border-[var(--bd)] ${drawing ? 'cursor-crosshair' : 'cursor-default'}`}
          >
            <video
              ref={videoRef}
              muted autoPlay playsInline
              onLoadedMetadata={handleLoadedMetadata}
              onCanPlay={handleVideoReady}
              onPlaying={handleVideoReady}
              className={`absolute inset-0 w-full h-full object-cover ${(url && videoState === 'ready') ? 'block' : 'hidden'}`}
            />

            {/* Buffering overlay — shown while the stream connects, instead of a blank box.
                Same look as PlaybackTimeline.jsx's buffering state (Wifi icon + blink). */}
            {url && videoState === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px] bg-[rgba(0,0,0,.75)] z-[2] text-[#2563EB] text-[13px]">
                <Wifi size={34} className="vq-blink" />
                <span>Buffering…</span>
              </div>
            )}

            {(!url || videoState === 'error') && (
              <div className="absolute inset-0 flex items-center justify-center text-[rgba(255,255,255,.35)] text-[12px] font-[family-name:var(--mono)]">
                {!url ? 'No stream configured' : 'Stream unavailable'}
              </div>
            )}

            {/* Points cap + fullscreen pill — top-right, matching V1 */}
            <div className="absolute top-[10px] right-[10px] flex items-center gap-[6px] z-[3]">
              <button
                onClick={() => setMaxPoints(p => Math.max(MIN_POINTS_TO_CLOSE, p - 1))}
                title="Decrease max points"
                className="w-[26px] h-[26px] rounded-full bg-[rgba(0,0,0,.6)] border-none text-white cursor-pointer flex items-center justify-center"
              >
                <Minus size={13} />
              </button>
              <span className="py-[4px] px-[9px] bg-[rgba(0,0,0,.6)] text-white text-[11px] font-[family-name:var(--mono)] rounded-[6px]">
                {maxPoints}
              </span>
              <button
                onClick={() => setMaxPoints(p => p + 1)}
                title="Increase max points"
                className="w-[26px] h-[26px] rounded-full bg-[rgba(0,0,0,.6)] border-none text-white cursor-pointer flex items-center justify-center"
              >
                <Plus size={13} />
              </button>
            </div>

            {/* Zone polygon overlay — points are native video pixels, scaled into a 1000x1000 box.
                Committed zones render in amber (matching V1's saved-zone labels); the in-progress
                polygon renders in blue so it's visually distinct while drawing. */}
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {videoSize.w > 0 && zones.map((z, zi) => (
                <g key={zi} opacity={activeZoneIndex === null || activeZoneIndex === zi ? 1 : 0.35}>
                  {z.points.length > 1 && (
                    <polygon
                      points={polygonPointsAttr(z.points, videoSize.w, videoSize.h, 1000, 1000)}
                      fill="rgba(245,158,11,.18)"
                      stroke="#f59e0b"
                      strokeWidth="3.5"
                    />
                  )}
                  {z.points.map((p, i) => (
                    <circle key={i} cx={(p.x / videoSize.w) * 1000} cy={(p.y / videoSize.h) * 1000} r="6" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
                  ))}
                </g>
              ))}
              {points.length > 1 && (
                <polygon
                  points={polygonPointsAttr(points, videoSize.w, videoSize.h, 1000, 1000)}
                  fill="rgba(59,130,246,.22)"
                  stroke="var(--blue)"
                  strokeWidth="4"
                />
              )}
              {videoSize.w > 0 && points.map((p, i) => (
                <circle
                  key={i}
                  cx={(p.x / videoSize.w) * 1000}
                  cy={(p.y / videoSize.h) * 1000}
                  r="8" fill="var(--blue)" stroke="#fff" strokeWidth="2.5"
                />
              ))}
            </svg>

            {/* Zone name labels — plain HTML pills positioned over each committed zone's first point, matching V1's on-canvas labels */}
            {videoSize.w > 0 && zones.map((z, zi) => z.points[0] && (
              <span
                key={zi}
                className="absolute [transform:translate(-4px,-130%)] bg-[#ef4444] text-white text-[10.5px] font-semibold py-[3px] px-[8px] rounded-[5px] whitespace-nowrap pointer-events-none z-[3]"
                style={{
                  left: `${(z.points[0].x / videoSize.w) * 100}%`,
                  top: `${(z.points[0].y / videoSize.h) * 100}%`,
                  opacity: activeZoneIndex === null || activeZoneIndex === zi ? 1 : 0.35,
                }}
              >
                {z.name}
              </span>
            ))}

            {zones.length === 0 && points.length === 0 && videoState !== 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="font-[family-name:var(--mono)] text-[11px] text-[rgba(220,232,255,.85)] bg-[rgba(8,11,17,.6)] border border-[rgba(255,255,255,.15)] rounded-[20px] py-[6px] px-[14px]">
                  ▶ Press "Start Drawing", then click to place zone points
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-[8px] mt-[13px]">
            <button
              onClick={handleMaxArea}
              disabled={!activeType || !videoSize.w}
              className={`flex items-center gap-[6px] h-[34px] px-[12px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[12px] text-[var(--tx2)] ${(activeType && videoSize.w) ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-50'}`}
            >
              <Maximize size={14} /> Max Area
            </button>
            <button
              onClick={handleMinArea}
              disabled={!activeType || !videoSize.w}
              className={`flex items-center gap-[6px] h-[34px] px-[12px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[12px] text-[var(--tx2)] ${(activeType && videoSize.w) ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-50'}`}
            >
              <Minimize size={14} /> Min Area
            </button>
            <button
              onClick={() => setDrawing(d => !d)}
              disabled={!activeType}
              className={`flex items-center gap-[6px] h-[34px] px-[12px] rounded-[8px] text-[12px] border border-[var(--bd)] ${activeType ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-50'} ${drawing ? 'bg-[linear-gradient(135deg,var(--blue),var(--violet))] text-white' : 'bg-[var(--bg2)] text-[var(--tx2)]'}`}
            >
              <Pencil size={14} /> {drawing ? 'Stop Drawing' : 'Start Drawing'}
            </button>
            <button
              onClick={handleUndo}
              disabled={points.length === 0}
              className={`flex items-center gap-[6px] h-[34px] px-[12px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[12px] text-[var(--tx2)] ${points.length ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-50'}`}
            >
              <Undo2 size={14} /> Undo
            </button>
            <button
              onClick={handleClear}
              disabled={points.length === 0}
              title="Clear the in-progress polygon (does not affect already-added zones)"
              className={`flex items-center gap-[6px] h-[34px] px-[12px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[12px] text-[var(--tx2)] ${points.length ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-50'}`}
            >
              <Trash2 size={14} /> Clear All
            </button>
            <button
              onClick={handleOpenSaveModal}
              disabled={!activeType || saving || (zones.length === 0 && points.length < MIN_POINTS_TO_CLOSE)}
              className={`ml-auto flex items-center gap-[6px] h-[34px] px-[16px] rounded-[8px] text-[12.5px] font-semibold text-white border-none bg-[linear-gradient(135deg,var(--blue),var(--violet))] shadow-[0_3px_12px_rgba(99,102,241,.3)] ${(!activeType || saving || (zones.length === 0 && points.length < MIN_POINTS_TO_CLOSE)) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer opacity-100'}`}
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save Area'}
            </button>
          </div>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-[16px]">
          <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[15px] p-[16px]">
            <div className="font-[family-name:var(--disp)] font-semibold text-[14px] mb-[14px]">Device Detail</div>
            <div className="flex flex-col gap-[12px]">
              <div className="flex items-center justify-between gap-[10px]">
                <span className="font-[family-name:var(--mono)] text-[9.5px] tracking-[.06em] text-[var(--tx3)]">MODEL</span>
                <span className="text-[12.5px] font-medium text-right">{camera.model || '—'}</span>
              </div>
              <div className="h-px bg-[var(--bd)]" />
              <div className="flex items-center justify-between gap-[10px]">
                <span className="font-[family-name:var(--mono)] text-[9.5px] tracking-[.06em] text-[var(--tx3)]">NVR</span>
                <span className="text-[12.5px] font-medium">{camera.nvrId?.nvrName || '—'}</span>
              </div>
              <div className="h-px bg-[var(--bd)]" />
              <div className="flex items-center justify-between gap-[10px]">
                <span className="font-[family-name:var(--mono)] text-[9.5px] tracking-[.06em] text-[var(--tx3)]">IP ADDRESS</span>
                <span className="font-[family-name:var(--mono)] text-[12px] font-medium text-[var(--cyan)]">{camera.ipAddress || '—'}</span>
              </div>
            </div>
          </div>

          {activeType && (
            <ZoneSettingsPanel
              zones={zones}
              extraFields={extraFieldsFor(activeType.settingType)}
              activeIndex={activeZoneIndex}
              onSetActive={setActiveZoneIndex}
              onUpdateField={handleUpdateZoneField}
              onSave={handleSaveZoneName}
              onDelete={handleDeleteZone}
              savingIndex={savingZoneIndex}
            />
          )}

          {activeType && (
            <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[15px] p-[16px]">
              <div className="font-[family-name:var(--disp)] font-semibold text-[14px] mb-[5px]">Alert Recipients</div>
              <div className="text-[11px] text-[var(--tx3)] mb-[12px]">
                Who gets notified on a {activeType.label} event.
              </div>
              {activeType.settingId ? (
                <>
                  <div className="flex flex-wrap gap-[7px] mb-[11px]">
                    {selectedRecipients.map(r => (
                      <span
                        key={r._id}
                        className="flex items-center gap-[6px] text-[11.5px] font-medium bg-[rgba(59,130,246,.13)] border border-[rgba(59,130,246,.32)] text-[var(--blue)] rounded-[20px] pt-[4px] pr-[6px] pb-[4px] pl-[11px]"
                      >
                        {r.fullName}
                        <span onClick={() => removeRecipient(String(r._id))} className="cursor-pointer flex opacity-70">
                          <X size={12} />
                        </span>
                      </span>
                    ))}
                    {selectedRecipients.length === 0 && !recipientsApi.loading && (
                      <span className="text-[11.5px] text-[var(--tx3)]">No recipients assigned yet.</span>
                    )}
                  </div>
                  {recipientsApi.loading ? (
                    <div className="text-[11.5px] text-[var(--tx3)]">Loading recipients…</div>
                  ) : recipientsApi.error ? (
                    <div className="text-[11.5px] text-[var(--tx3)]">Couldn't load recipients.</div>
                  ) : addableRecipients.length === 0 && allRecipients.length === 0 ? (
                    <div className="text-[11.5px] text-[var(--tx3)]">No verified recipients yet — add one under Alert Recipients.</div>
                  ) : addableRecipients.length === 0 ? (
                    <div className="text-[11.5px] text-[var(--tx3)]">All recipients already assigned.</div>
                  ) : (
                    <div className="relative">
                      <select
                        value="__add"
                        onChange={e => addRecipient(e.target.value === '__add' ? null : e.target.value)}
                        disabled={savingAlerts}
                        className="w-full h-[40px] pr-[34px] pl-[13px] rounded-[10px] box-border bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] outline-none cursor-pointer text-[var(--tx3)] appearance-none"
                      >
                        <option value="__add">+ Add recipient…</option>
                        {addableRecipients.map(r => (
                          <option key={r._id} value={r._id}>{r.fullName} ({r.value})</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[var(--tx3)] pointer-events-none" />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[11.5px] text-[var(--tx3)]">Save a zone first to assign recipients.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSaveModal && activeType && (
        <SaveDetectionAreaModal
          initialName={activeType.setting?.name || `${activeType.label} for ${camera.customName || camera.name}`}
          initialPriority={activeType.setting?.settings?.levelOfImportance || 'moderate'}
          zones={pendingZones}
          extraFields={extraFieldsFor(activeType.settingType)}
          saving={saving}
          onCancel={() => setShowSaveModal(false)}
          onSubmit={handleSubmitSave}
        />
      )}

      {showDeleteConfirm && activeType && (
        <div className="fixed inset-0 bg-[rgba(6,9,15,.6)] z-[50] flex items-center justify-center p-[20px]">
          <div className="w-full max-w-[400px] bg-[var(--bg1solid)] border border-[var(--bd2)] rounded-[16px] p-[22px] shadow-[0_24px_64px_rgba(0,0,0,.45)]">
            <div className="flex items-center gap-[10px] mb-[12px]">
              <span className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center bg-[rgba(239,68,68,.13)] text-[#ef4444] shrink-0">
                <AlertTriangle size={18} />
              </span>
              <span className="font-[family-name:var(--disp)] font-semibold text-[15px]">Reset Detection UI?</span>
            </div>
            <div className="text-[12.5px] text-[var(--tx2)] leading-[1.5] mb-[20px]">
              <strong>Warning:</strong> This will reset all detection settings to their default values. This action cannot be undone.
            </div>
            <div className="flex justify-end gap-[10px]">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="h-[38px] px-[16px] rounded-[9px] bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] font-medium text-[var(--tx2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteArea}
                disabled={deleting}
                className={`h-[38px] px-[18px] rounded-[9px] bg-[#ef4444] border-none text-[12.5px] font-semibold text-white ${deleting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer opacity-100'}`}
              >
                {deleting ? 'Resetting…' : 'Reset Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
