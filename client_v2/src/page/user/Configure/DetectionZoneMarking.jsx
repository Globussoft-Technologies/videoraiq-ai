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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(6,9,15,.6)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
        borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15.5 }}>Save Detection Area</span>
          <span onClick={onCancel} style={{ cursor: 'pointer', color: 'var(--tx3)', display: 'flex' }}>
            <X size={17} />
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--tx2)', marginBottom: 6 }}>Detection Name</label>
            <input
              autoFocus
              value={detectionName}
              onChange={e => { setDetectionName(e.target.value); setErrors(er => ({ ...er, detectionName: false })); }}
              maxLength={50}
              placeholder="Enter detection name"
              style={{
                width: '100%', height: 40, padding: '0 12px', borderRadius: 9, boxSizing: 'border-box',
                background: 'var(--bg2)', border: `1px solid ${errors.detectionName ? 'var(--danger, #ef4444)' : 'var(--bd)'}`,
                fontSize: 13, color: 'var(--tx)', outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--tx2)', marginBottom: 6 }}>Priority</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              style={{
                width: '100%', height: 40, padding: '0 12px', borderRadius: 9, boxSizing: 'border-box',
                background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 13, color: 'var(--tx)',
                outline: 'none', cursor: 'pointer',
              }}
            >
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Global time zone — one setting for all zones' schedules. */}
          <TimezoneField />

          {zoneDrafts.map((z, i) => (
            <div key={i} style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)' }}>Zone {i + 1}</div>
              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Zone Name</label>
                <input
                  value={z.name}
                  onChange={e => updateZoneField(i, 'name', e.target.value)}
                  maxLength={50}
                  placeholder="Enter zone name"
                  style={{
                    width: '100%', height: 36, padding: '0 11px', borderRadius: 8, boxSizing: 'border-box',
                    background: 'var(--bg2)', border: `1px solid ${errors[`zone-${i}-name`] ? 'var(--danger, #ef4444)' : 'var(--bd)'}`,
                    fontSize: 12.5, color: 'var(--tx)', outline: 'none',
                  }}
                />
              </div>
              {extraFields.includes('capacity') && (
                <div>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Capacity</label>
                  <input
                    type="number"
                    min={0}
                    value={z.capacity}
                    onChange={e => updateZoneField(i, 'capacity', e.target.value)}
                    placeholder="e.g. 10"
                    style={{
                      width: '100%', height: 36, padding: '0 11px', borderRadius: 8, boxSizing: 'border-box',
                      background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx)', outline: 'none',
                    }}
                  />
                </div>
              )}
              {extraFields.includes('threshold') && (
                <div>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Threshold (sec)</label>
                  <input
                    type="number"
                    min={0}
                    value={z.threshold}
                    onChange={e => updateZoneField(i, 'threshold', e.target.value)}
                    placeholder="e.g. 30"
                    style={{
                      width: '100%', height: 36, padding: '0 11px', borderRadius: 8, boxSizing: 'border-box',
                      background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx)', outline: 'none',
                    }}
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              height: 38, padding: '0 16px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
              fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              height: 38, padding: '0 18px', borderRadius: 9, background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              border: 'none', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
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
          style={{
            width: '100%', height: 42, padding: '0 34px 0 13px', borderRadius: 10,
            background: 'var(--bg2)', border: '1px solid var(--blue)', fontSize: 13,
            outline: 'none', cursor: 'pointer', color: 'var(--tx)',
            boxShadow: '0 0 0 3px rgba(59,130,246,.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
          }}
        >
          {activeLabel}
          <ChevronDown size={15} style={{ color: 'var(--blue)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6}>
        <div style={{ width: triggerWidth || 320, maxHeight: 176, overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.35)', padding: 5 }}>
          {types.map(t => {
            const selected = t.settingType === value;
            return (
              <div
                key={t.settingType}
                onClick={() => { onChange(t.settingType); setOpen(false); }}
                style={{
                  padding: '8px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
                  background: selected ? 'var(--blue)' : 'transparent',
                  color: selected ? '#fff' : 'var(--tx)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}
              >
                <span>{t.label}</span>
                {t.configured && <CheckCircle2 size={13} style={{ color: selected ? '#fff' : 'var(--ok)', flexShrink: 0 }} />}
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
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, padding: 16 }}>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 5 }}>Zone Settings</div>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>
        {zones.length} zone{zones.length === 1 ? '' : 's'} drawn on this camera for this detection type.
      </div>
      {/* Global time zone — schedules for every zone are interpreted against it. */}
      <div style={{ marginBottom: 12 }}>
        <TimezoneField />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {zones.map((z, i) => {
          const isOpen = expanded === i;
          return (
            <div
              key={i}
              style={{ border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden' }}
              onMouseEnter={() => onSetActive(i)}
              onMouseLeave={() => onSetActive(null)}
            >
              <div
                onClick={() => setExpanded(isOpen ? null : i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: 'pointer',
                  background: activeIndex === i ? 'rgba(245,158,11,.1)' : 'transparent',
                }}
              >
                <ChevronDown size={14} style={{ color: 'var(--tx3)', transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.name}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); onDelete(i); }}
                  title="Delete this zone"
                  style={{ display: 'flex', color: '#ef4444', cursor: 'pointer', opacity: savingIndex === i ? 0.5 : 1 }}
                >
                  <Trash2 size={14} />
                </span>
              </div>
              {isOpen && (
                <div style={{ padding: '10px 11px', borderTop: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Zone Name</label>
                    <input
                      value={z.name}
                      onChange={e => onUpdateField(i, 'name', e.target.value)}
                      maxLength={50}
                      style={{
                        width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                        background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx)', outline: 'none',
                      }}
                    />
                  </div>
                  {extraFields.includes('capacity') && (
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Capacity</label>
                      <input
                        type="number"
                        min={0}
                        value={z.capacity}
                        onChange={e => onUpdateField(i, 'capacity', e.target.value)}
                        placeholder="e.g. 10"
                        style={{
                          width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx)', outline: 'none',
                        }}
                      />
                    </div>
                  )}
                  {extraFields.includes('threshold') && (
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Threshold (sec)</label>
                      <input
                        type="number"
                        min={0}
                        value={z.threshold}
                        onChange={e => onUpdateField(i, 'threshold', e.target.value)}
                        placeholder="e.g. 30"
                        style={{
                          width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx)', outline: 'none',
                        }}
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
                    style={{
                      alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px',
                      borderRadius: 7, background: 'var(--blue)', border: 'none', fontSize: 11.5, fontWeight: 600, color: '#fff',
                      cursor: savingIndex === i ? 'not-allowed' : 'pointer', opacity: savingIndex === i ? 0.6 : 1,
                    }}
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
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)',
            color: 'var(--tx2)', cursor: 'pointer',
          }}
        >
          <ArrowLeft size={17} />
        </button>
        <span style={{
          width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(59,130,246,.13)', color: 'var(--blue)',
        }}>
          <Video size={20} strokeWidth={1.7} />
        </span>
        <div>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>
            {camera.customName || camera.name}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx3)' }}>
            {camera.ipAddress || '—'} · Zone Marking
          </div>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={!activeType?.settingId}
          title={activeType?.settingId ? 'Reset all detection settings for this detection type' : 'Nothing saved yet for this detection type'}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7,
            height: 36, padding: '0 14px', borderRadius: 9,
            background: 'var(--bg2)', border: '1px solid var(--bd)',
            fontSize: 12.5, fontWeight: 500, color: activeType?.settingId ? '#ef4444' : 'var(--tx3)',
            cursor: activeType?.settingId ? 'pointer' : 'not-allowed', opacity: activeType?.settingId ? 1 : 0.5,
          }}
        >
          <RotateCcw size={15} /> Reset Detection UI
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}>
        {/* Video + drawing tools */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Pencil size={16} color="var(--blue)" strokeWidth={1.9} />
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Zone Marking</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: activeType?.configured ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', color: 'var(--tx3)', marginBottom: 7 }}>
                DETECTION TYPE
              </div>
              {allTypes.length === 0 ? (
                <div style={{
                  height: 42, display: 'flex', alignItems: 'center', padding: '0 13px',
                  borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)',
                  fontSize: 12.5, color: 'var(--tx3)',
                }}>
                  No detection types available.
                </div>
              ) : (
                <DetectionTypeDropdown types={allTypes} value={selectedType} onChange={setSelectedType} />
              )}
            </div>

            {/* Detection Name — read-only, populated once a zone has been saved (V1 parity). Zone names now live per-zone in the Zone Settings panel. */}
            {activeType?.configured && (
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', color: 'var(--tx3)', marginBottom: 7 }}>
                  DETECTION NAME
                </div>
                <div style={{
                  height: 42, display: 'flex', alignItems: 'center', padding: '0 13px', borderRadius: 10,
                  background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {activeType.setting?.name || '—'}
                </div>
              </div>
            )}
          </div>

          {activeType && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: -6, marginBottom: 14, fontSize: 10.5, color: activeType.configured ? 'var(--ok)' : 'var(--tx3)' }}>
              {activeType.configured
                ? <><CheckCircle2 size={12} /> Already configured for this camera</>
                : 'Not configured yet — saving a zone will create it'}
            </div>
          )}

          <div
            ref={stageRef}
            onClick={handleStageClick}
            style={{
              position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9',
              background: '#0a0e15', cursor: drawing ? 'crosshair' : 'default', border: '1px solid var(--bd)',
            }}
          >
            <video
              ref={videoRef}
              muted autoPlay playsInline
              onLoadedMetadata={handleLoadedMetadata}
              onCanPlay={handleVideoReady}
              onPlaying={handleVideoReady}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                display: (url && videoState === 'ready') ? 'block' : 'none',
              }}
            />

            {/* Buffering overlay — shown while the stream connects, instead of a blank box.
                Same look as PlaybackTimeline.jsx's buffering state (Wifi icon + blink). */}
            {url && videoState === 'loading' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(0,0,0,.75)', zIndex: 2, color: '#2563EB', fontSize: 13 }}>
                <Wifi size={34} className="vq-blink" />
                <span>Buffering…</span>
              </div>
            )}

            {(!url || videoState === 'error') && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.35)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                {!url ? 'No stream configured' : 'Stream unavailable'}
              </div>
            )}

            {/* Points cap + fullscreen pill — top-right, matching V1 */}
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 6, zIndex: 3 }}>
              <button
                onClick={() => setMaxPoints(p => Math.max(MIN_POINTS_TO_CLOSE, p - 1))}
                title="Decrease max points"
                style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Minus size={13} />
              </button>
              <span style={{ padding: '4px 9px', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, fontFamily: 'var(--mono)', borderRadius: 6 }}>
                {maxPoints}
              </span>
              <button
                onClick={() => setMaxPoints(p => p + 1)}
                title="Increase max points"
                style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
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
                style={{
                  position: 'absolute',
                  left: `${(z.points[0].x / videoSize.w) * 100}%`,
                  top: `${(z.points[0].y / videoSize.h) * 100}%`,
                  transform: 'translate(-4px, -130%)',
                  background: '#ef4444', color: '#fff', fontSize: 10.5, fontWeight: 600,
                  padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 3,
                  opacity: activeZoneIndex === null || activeZoneIndex === zi ? 1 : 0.35,
                }}
              >
                {z.name}
              </span>
            ))}

            {zones.length === 0 && points.length === 0 && videoState !== 'loading' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(220,232,255,.85)',
                  background: 'rgba(8,11,17,.6)', border: '1px solid rgba(255,255,255,.15)',
                  borderRadius: 20, padding: '6px 14px',
                }}>
                  ▶ Press "Start Drawing", then click to place zone points
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
            <button
              onClick={handleMaxArea}
              disabled={!activeType || !videoSize.w}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8,
                background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)',
                cursor: (activeType && videoSize.w) ? 'pointer' : 'not-allowed', opacity: (activeType && videoSize.w) ? 1 : 0.5,
              }}
            >
              <Maximize size={14} /> Max Area
            </button>
            <button
              onClick={handleMinArea}
              disabled={!activeType || !videoSize.w}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8,
                background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)',
                cursor: (activeType && videoSize.w) ? 'pointer' : 'not-allowed', opacity: (activeType && videoSize.w) ? 1 : 0.5,
              }}
            >
              <Minimize size={14} /> Min Area
            </button>
            <button
              onClick={() => setDrawing(d => !d)}
              disabled={!activeType}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8,
                fontSize: 12, cursor: activeType ? 'pointer' : 'not-allowed', border: '1px solid var(--bd)',
                background: drawing ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg2)',
                color: drawing ? '#fff' : 'var(--tx2)', opacity: activeType ? 1 : 0.5,
              }}
            >
              <Pencil size={14} /> {drawing ? 'Stop Drawing' : 'Start Drawing'}
            </button>
            <button
              onClick={handleUndo}
              disabled={points.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8,
                background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)',
                cursor: points.length ? 'pointer' : 'not-allowed', opacity: points.length ? 1 : 0.5,
              }}
            >
              <Undo2 size={14} /> Undo
            </button>
            <button
              onClick={handleClear}
              disabled={points.length === 0}
              title="Clear the in-progress polygon (does not affect already-added zones)"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8,
                background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)',
                cursor: points.length ? 'pointer' : 'not-allowed', opacity: points.length ? 1 : 0.5,
              }}
            >
              <Trash2 size={14} /> Clear All
            </button>
            <button
              onClick={handleOpenSaveModal}
              disabled={!activeType || saving || (zones.length === 0 && points.length < MIN_POINTS_TO_CLOSE)}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 16px',
                borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: '#fff', border: 'none',
                background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                cursor: (!activeType || saving || (zones.length === 0 && points.length < MIN_POINTS_TO_CLOSE)) ? 'not-allowed' : 'pointer',
                opacity: (!activeType || saving || (zones.length === 0 && points.length < MIN_POINTS_TO_CLOSE)) ? 0.6 : 1,
                boxShadow: '0 3px 12px rgba(99,102,241,.3)',
              }}
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save Area'}
            </button>
          </div>
        </div>

        {/* Right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, padding: 16 }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Device Detail</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>MODEL</span>
                <span style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right' }}>{camera.model || '—'}</span>
              </div>
              <div style={{ height: 1, background: 'var(--bd)' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>NVR</span>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{camera.nvrId?.nvrName || '—'}</span>
              </div>
              <div style={{ height: 1, background: 'var(--bd)' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>IP ADDRESS</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500, color: 'var(--cyan)' }}>{camera.ipAddress || '—'}</span>
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
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, padding: 16 }}>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 5 }}>Alert Recipients</div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>
                Who gets notified on a {activeType.label} event.
              </div>
              {activeType.settingId ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 11 }}>
                    {selectedRecipients.map(r => (
                      <span
                        key={r._id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 500,
                          background: 'rgba(59,130,246,.13)', border: '1px solid rgba(59,130,246,.32)',
                          color: 'var(--blue)', borderRadius: 20, padding: '4px 6px 4px 11px',
                        }}
                      >
                        {r.fullName}
                        <span onClick={() => removeRecipient(String(r._id))} style={{ cursor: 'pointer', display: 'flex', opacity: 0.7 }}>
                          <X size={12} />
                        </span>
                      </span>
                    ))}
                    {selectedRecipients.length === 0 && !recipientsApi.loading && (
                      <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>No recipients assigned yet.</span>
                    )}
                  </div>
                  {recipientsApi.loading ? (
                    <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Loading recipients…</div>
                  ) : recipientsApi.error ? (
                    <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Couldn't load recipients.</div>
                  ) : addableRecipients.length === 0 && allRecipients.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>No verified recipients yet — add one under Alert Recipients.</div>
                  ) : addableRecipients.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>All recipients already assigned.</div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <select
                        value="__add"
                        onChange={e => addRecipient(e.target.value === '__add' ? null : e.target.value)}
                        disabled={savingAlerts}
                        style={{
                          width: '100%', height: 40, padding: '0 34px 0 13px', borderRadius: 10, boxSizing: 'border-box',
                          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5,
                          outline: 'none', cursor: 'pointer', color: 'var(--tx3)', appearance: 'none',
                        }}
                      >
                        <option value="__add">+ Add recipient…</option>
                        {addableRecipients.map(r => (
                          <option key={r._id} value={r._id}>{r.fullName} ({r.value})</option>
                        ))}
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)', pointerEvents: 'none' }} />
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Save a zone first to assign recipients.</div>
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
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(6,9,15,.6)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 400, background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
            borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,.45)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(239,68,68,.13)', color: '#ef4444', flexShrink: 0,
              }}>
                <AlertTriangle size={18} />
              </span>
              <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Reset Detection UI?</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 20 }}>
              <strong>Warning:</strong> This will reset all detection settings to their default values. This action cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{
                  height: 38, padding: '0 16px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
                  fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteArea}
                disabled={deleting}
                style={{
                  height: 38, padding: '0 18px', borderRadius: 9, background: '#ef4444',
                  border: 'none', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
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
