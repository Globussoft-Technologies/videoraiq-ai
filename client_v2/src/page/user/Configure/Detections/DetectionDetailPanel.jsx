import {
  Activity, AlertCircle, Armchair, Box, Briefcase, Calendar, CalendarCheck,
  Car, CarFront, CircleOff, Clock, Clock3, DoorOpen, Factory, Flame,
  GitCommitHorizontal, Globe, Hammer, HardHat, Lightbulb, ListRestart, Plus,
  ScanFace, ScanLine, ShieldAlert, ShieldOff, Smartphone, Table2, Trash2,
  Users, UtensilsCrossed, Waves, X, ChevronDown,
} from 'lucide-react';
import { Toggle } from '../../../../components/primitives';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import ConfirmationModal from '../../../../components/DeleteConfirmation';
import { getDetectionSchedule, updateDetectionSchedule, deleteDetectionSchedule } from '../../../../helpers/configure';
import { useTimezones } from '../ZoneScheduleFields';
import { thresholdLabel } from './detectionsData';
import { fetchAlertRecipients, updateDetectionAlerts } from '../DetectionZoneMarking/api/detectionZoneApi';

// Detection types are API-driven, so use their stable setting type rather than
// the category icon. Aliases cover the setting-type variants returned by the
// camera and detection-settings APIs.
const DETECTION_ICONS = {
  faceAuth: ScanFace,
  faceRecognitionSettings: ScanFace,
  faceDetectionSettings: ScanFace,
  genericObjectDetectionSettings: Box,
  objectDetectionSettings: Box,
  countPersonsSettings: Users,
  crowdDetectionSettings: Users,
  motionDetectionSettings: Activity,
  unauthorizedAccessSettings: ShieldAlert,
  intrusionDetectionSettings: ShieldAlert,
  zoneIntrusionSettings: ShieldAlert,
  lineCrossingSettings: GitCommitHorizontal,
  loiteringDetectionSettings: Clock3,
  loiteringWithAuthSettings: Clock3,
  loiteringWithoutAuthSettings: Clock3,
  unattendedBaggageDetectionSettings: Briefcase,
  baggageDetectionSettings: Briefcase,
  fireSmokeDetectionSettings: Flame,
  fireDetectionSettings: Flame,
  weaponDetectionSettings: ShieldAlert,
  lightDetectionSettings: Lightbulb,
  personalProtectiveEquipmentSettings: HardHat,
  foodServicePPEDetection: UtensilsCrossed,
  foodServicePPEDetectionSettings: UtensilsCrossed,
  countVehiclesSettings: CarFront,
  vehicleDetectionSettings: Car,
  vehicleTypeDetectionSettings: CarFront,
  vehicleObstructionSettings: CircleOff,
  numberPlateDetectionSettings: ScanLine,
  anprSettings: ScanLine,
  vehicleNumberPlateSettings: ScanLine,
  doorDetectionSettings: DoorOpen,
  deskAbsenceDetection: Armchair,
  deskAbsenceSettings: Armchair,
  guardAbsenceSettings: ShieldOff,
  tableOccupancySettings: Table2,
  tableOccupancyDetectionSettings: Table2,
  mobilePhoneDetectionSettings: Smartphone,
  conveyorDetectionSettings: Factory,
  crusherDetectionSettings: Hammer,
  waterSpillageDetectionSettings: Waves,
};

function detectionIconFor(model, fallbackIcon) {
  return DETECTION_ICONS[model?.settingType || model?.id] || fallbackIcon;
}

function StatBox({ label, value, color = 'var(--tx)' }) {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 8,
        padding: '10px 12px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 13,
          fontWeight: 600,
          color,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatScheduleMode(value, fallback = 'N/A') {
  const raw = typeof value === 'string' ? value : value?.mode;
  if (!raw) return fallback;
  const text = String(raw);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function recipientId(value) {
  return String(typeof value === 'string' ? value : value?._id || value?.id || '');
}

function RecipientSelectButton({ settingId, initialAlerts = [], onSaved }) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => initialAlerts.map(recipientId).filter(Boolean));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    setSelectedIds(initialAlerts.map(recipientId).filter(Boolean));
  }, [settingId, initialAlerts]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const loadRecipients = async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const result = await fetchAlertRecipients({ limit: 1000, filterByStatus: 'verified' });
      setRecipients(result?.recipients || []);
      setLoaded(true);
    } catch {
      toast.error('Failed to load recipients.');
    } finally {
      setLoading(false);
    }
  };

  const toggleOpen = () => {
    if (!settingId) {
      toast.error('No saved setting found for recipients.');
      return;
    }
    setOpen((next) => {
      const shouldOpen = !next;
      if (shouldOpen) loadRecipients();
      return shouldOpen;
    });
  };

  const persist = async (nextIds) => {
    const previous = selectedIds;
    setSelectedIds(nextIds);
    setSaving(true);
    try {
      await updateDetectionAlerts(settingId, nextIds);
      onSaved?.(nextIds);
      toast.success('Recipients updated successfully.');
    } catch (err) {
      setSelectedIds(previous);
      toast.error(err?.response?.data?.body?.message || 'Failed to update recipients.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRecipient = (id) => {
    if (saving) return;
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    persist(nextIds);
  };

  const selectedNames = recipients
    .filter((recipient) => selectedIds.includes(String(recipient._id)))
    .map((recipient) => recipient.fullName || recipient.name || recipient.value)
    .filter(Boolean);
  const buttonLabel = selectedIds.length
    ? `${selectedIds.length} Recipient${selectedIds.length === 1 ? '' : 's'}`
    : 'Select Recipients';

  return (
    <div ref={wrapRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <button
        type="button"
        onClick={toggleOpen}
        disabled={!settingId}
        title={!settingId ? 'No saved setting for this detection type' : 'Select alert recipients'}
        style={{
          width: '100%',
          height: 36,
          borderRadius: 8,
          border: '1px solid var(--bd)',
          cursor: !settingId ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: !settingId ? 'var(--tx3)' : 'var(--tx2)',
          background: 'var(--bg2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          opacity: !settingId ? 0.65 : 1,
        }}
      >
        {saving ? (
          <span
            style={{
              width: 13,
              height: 13,
              borderRadius: '50%',
              border: '2px solid rgba(236,72,153,.25)',
              borderTopColor: '#ec4899',
              animation: 'vq-spin .7s linear infinite',
            }}
          />
        ) : (
          <Users size={15} />
        )}
        {buttonLabel}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 42,
            right: 0,
            width: 'min(360px, 82vw)',
            maxHeight: 260,
            overflowY: 'auto',
            zIndex: 80,
            background: 'var(--bg1solid)',
            border: '1px solid var(--bd)',
            borderRadius: 10,
            boxShadow: '0 14px 34px rgba(15,23,42,.18)',
            padding: 6,
          }}
        >
          <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>
            Select Recipients
          </div>
          {loading ? (
            <div style={{ padding: '10px', fontSize: 12, color: 'var(--tx3)' }}>Loading recipients...</div>
          ) : recipients.length === 0 ? (
            <div style={{ padding: '10px', fontSize: 12, color: 'var(--tx3)' }}>No recipients available</div>
          ) : (
            recipients.map((recipient) => {
              const id = String(recipient._id);
              const label = recipient.fullName || recipient.name || recipient.value || 'Recipient';
              return (
                <label
                  key={id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '9px 10px',
                    borderRadius: 8,
                    cursor: saving ? 'wait' : 'pointer',
                    fontSize: 12.5,
                    color: 'var(--tx)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(id)}
                    disabled={saving}
                    onChange={() => toggleRecipient(id)}
                    style={{ cursor: saving ? 'wait' : 'pointer' }}
                  />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </label>
              );
            })
          )}
          {selectedNames.length > 0 && (
            <div style={{ borderTop: '1px solid var(--bd)', marginTop: 4, padding: '8px 10px', fontSize: 11, color: 'var(--tx3)' }}>
              Selected: {selectedNames.slice(0, 2).join(', ')}{selectedNames.length > 2 ? ` +${selectedNames.length - 2}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleFieldDropdown({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
  icon: Icon,
  searchable = false,
  minMenuWidth = 260
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = searchable && query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = Math.max(r.width, minMenuWidth);
    const menuH = 168 + (searchable ? 44 : 0);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH + 8 && r.top > spaceBelow;
    const left = Math.min(r.left, window.innerWidth - menuW - 8);
    setCoords({ top: openUp ? r.top : r.bottom, left: Math.max(8, left), width: menuW, openUp });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onResize = () => place();
    const onScroll = (e) => {
      if (listRef.current && listRef.current.contains(e.target)) return;
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) setOpen(false);
      else place();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    if (listRef.current) {
      const sel = listRef.current.querySelector('[data-selected="true"]');
      if (sel) sel.scrollIntoView({ block: 'center' });
    }
    if (searchable && searchRef.current) searchRef.current.focus();
  }, [open, searchable]);

  const list = open && !disabled && createPortal(
    <div
      ref={listRef}
      style={{
        position: 'fixed', top: coords.top, left: coords.left, width: coords.width,
        transform: coords.openUp ? 'translateY(-100%)' : 'none', zIndex: 10000,
        borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg1solid)',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', overflow: 'hidden',
      }}
    >
      {searchable && (
        <div style={{ padding: 6, borderBottom: '1px solid var(--bd)' }}>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            style={{
              width: '100%', height: 32, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx)', outline: 'none',
            }}
          />
        </div>
      )}
      <ul className="vq-scroll" style={{ maxHeight: 168, overflowY: 'auto', margin: 0, padding: 4, listStyle: 'none' }}>
        {filtered.length === 0 && (
          <li style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--tx2)' }}>No matches</li>
        )}
        {filtered.map((opt) => {
          const selected = opt === value;
          return (
            <li key={opt} data-selected={selected}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: selected ? 600 : 400,
                  background: selected ? '#7c3aed' : 'transparent',
                  color: selected ? '#fff' : 'var(--tx)',
                }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--bg3)'; }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
              >
                {opt}
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body
  );

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Border container that acts as trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          width: '100%',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '0 16px',
          borderRadius: 12,
          boxSizing: 'border-box',
          fontSize: 14,
          textAlign: 'left',
          background: 'var(--bg1solid)',
          border: `1px solid ${open ? 'var(--violet)' : 'var(--bd2)'}`,
          color: disabled ? 'var(--tx3)' : 'var(--tx)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {Icon && <Icon size={18} style={{ color: 'var(--tx2)', flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {value || placeholder}
          </span>
        </div>
        <ChevronDown size={16} style={{ flexShrink: 0, color: 'var(--tx2)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {/* Floating label positioned on the top border */}
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 14,
          transform: 'translateY(-50%)',
          background: 'var(--bg1solid)',
          padding: '0 6px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--tx2)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}
      >
        {label}
      </span>

      {list}
    </div>
  );
}

/**
 * Detail card for the selected detection: identity + enable toggle, sensitivity
 * slider, the four config stats and the two configure actions.
 *
 * Sensitivity is lifted to the page (`onSensitivityChange`) so the value
 * survives switching between detections; persisting it is a PATCH away once the
 * API exists.
 */
export default function DetectionDetailPanel({
  model,
  category,
  onToggle,
  toggleDisabled,
  onSensitivityChange,
  onThresholdChange,
  onEditZones,
  onResetSetting,
  onResetThresholds,
  resetDisabled = false,
  resetThresholdDisabled = false,
  settingId,
  channel,
  onScheduleSaved,
  initialAlerts = [],
  onRecipientsChange,
  canEdit = true,
}) {
  const Icon = detectionIconFor(model, category?.icon);
  const color = category?.color || 'var(--blue)';
  const sensitivity = model.sensitivity;
  const appliedCameras = model.appliedCameras == null ? 'N/A' : model.appliedCameras;
  const minConfidence = model.minConfidence == null ? 'N/A' : `${model.minConfidence}%`;
  const statusValue = model.status || (model.active ? 'Active' : 'Paused');
  const scheduleFallback = formatScheduleMode(model.scheduleMode || model.schedule, 'N/A');
  const thresholdKeys = model.thresholds ? Object.keys(model.thresholds) : [];
  const usesThresholds = thresholdKeys.length > 0;
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleForm, setScheduleForm] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [actualScheduleMode, setActualScheduleMode] = useState('Loading...');

  const channelId = channel?._id || channel?.channelId || channel?.id;
  const timezones = useTimezones();
  const scheduleDisabled = !canEdit || !settingId || !channelId;
  const scheduleDisabledTitle = !channelId
    ? 'Select a camera to edit schedule'
    : !canEdit
      ? 'You only have view access for detections'
      : 'Create detection setting first to edit schedule';

  useEffect(() => {
    let alive = true;
    if (!settingId || !channelId) {
      setActualScheduleMode(scheduleFallback);
      return;
    }
    setActualScheduleMode('Loading...');
    getDetectionSchedule(settingId, channelId)
      .then((res) => {
        if (!alive) return;
        const mode = res?.schedule?.mode || 'always';
        setActualScheduleMode(formatScheduleMode(mode, scheduleFallback));
      })
      .catch(() => {
        if (alive) setActualScheduleMode(scheduleFallback);
      });
    return () => { alive = false; };
  }, [settingId, channelId, scheduleFallback]);

  async function openSchedule() {
    if (scheduleDisabled) {
      toast.error(scheduleDisabledTitle);
      return;
    }
    setScheduleOpen(true);
    setScheduleLoading(true);
    setScheduleError('');
    try {
      const res = await getDetectionSchedule(settingId, channelId);
      const defaultPayload = res?.schedule
        ? { mode: res.schedule.mode, timezone: res.schedule.timezone || 'Asia/Kolkata', days: res.schedule.days || {} }
        : { mode: 'always', timezone: 'Asia/Kolkata', days: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } };
      setScheduleForm(defaultPayload);
    } catch (e) {
      setScheduleError(e?.response?.data?.message || e?.message || 'Failed to load schedule');
    } finally {
      setScheduleLoading(false);
    }
  }

  function closeSchedule() {
    if (scheduleLoading) return;
    setScheduleOpen(false);
    setScheduleForm(null);
    setScheduleError('');
  }

  function validateScheduleForm() {
    if (!scheduleForm) return 'Missing schedule data.';
    if (!scheduleForm.timezone) return 'Please select a timezone.';

    const mode = scheduleForm.mode || 'always';
    if (mode === 'custom') {
      const days = ensureDays(scheduleForm.days);
      const ranges = Object.values(days).flat();
      if (!ranges.length) return 'Please add at least one active time range.';

      for (const { start, end } of ranges) {
        if (!start || !end) return 'Please fill both start and end times for all ranges.';
        if (start >= end) return 'Please make sure start time is before end time.';
      }
    }

    return '';
  }

  function ensureDays(d) {
    const base = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
    const formatted = {};
    for (const day of Object.keys(base)) {
      const list = d?.[day] || [];
      formatted[day] = list.slice(0, 1);
    }
    return formatted;
  }

  function addInterval(day) {
    setScheduleForm((s) => {
      const days = ensureDays(s.days);
      return { ...s, days: { ...days, [day]: [{ start: '09:00', end: '18:00' }] } };
    });
  }

  function removeInterval(day, idx) {
    setScheduleForm((s) => {
      const days = ensureDays(s.days);
      return { ...s, days: { ...days, [day]: [] } };
    });
  }

  function updateInterval(day, idx, field, value) {
    setScheduleForm((s) => {
      const days = ensureDays(s.days);
      const next = (days[day] || []).map((it, i) => (i === idx ? { ...it, [field]: value } : it));
      return { ...s, days: { ...days, [day]: next } };
    });
  }

  async function submitSchedule() {
    if (!settingId || !channelId) return setScheduleError('Missing setting or channel id');
    const validationError = validateScheduleForm();
    if (validationError) {
      setScheduleError(validationError);
      toast.error(validationError);
      return;
    }
    if (!scheduleForm) return setScheduleError('Missing schedule data');
    setScheduleLoading(true);
    setScheduleError('');
    try {
      const payload = { mode: scheduleForm.mode, timezone: scheduleForm.timezone || 'Asia/Kolkata', days: ensureDays(scheduleForm.days) };
      const response = await updateDetectionSchedule(settingId, channelId, payload);
      const message = response?.message || 'Schedule saved successfully';
      toast.success(message);
      const newMode = scheduleForm.mode || 'always';
      setActualScheduleMode(newMode.charAt(0).toUpperCase() + newMode.slice(1));
      if (typeof onScheduleSaved === 'function') await onScheduleSaved();
      closeSchedule();
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || 'Failed to update schedule';
      setScheduleError(message);
      toast.error(message);
    } finally {
      setScheduleLoading(false);
    }
  }

  function requestDeleteSchedule() {
    setScheduleError('');
    setConfirmDeleteOpen(true);
  }

  async function confirmDeleteSchedule() {
    if (!settingId || !channelId) return setScheduleError('Missing setting or channel id');
    setScheduleLoading(true);
    setScheduleError('');
    try {
      const response = await deleteDetectionSchedule(settingId, channelId);
      const message = response?.message || 'Schedule deleted successfully';
      toast.success(message);
      setActualScheduleMode('Always');
      if (typeof onScheduleSaved === 'function') await onScheduleSaved();
      setConfirmDeleteOpen(false);
      closeSchedule();
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || 'Failed to delete schedule';
      setScheduleError(message);
      toast.error(message);
    } finally {
      setScheduleLoading(false);
    }
  }

  const hasSelectedRange =
    scheduleForm?.mode === 'custom' &&
    Object.values(scheduleForm?.days || {}).some(
      (ranges) => Array.isArray(ranges) && ranges.length > 0
    );
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 36,
            height: 36,
            flex: '0 0 auto',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: category?.tint || 'var(--bg2)',
            color,
          }}
        >
          {Icon ? <Icon size={18} strokeWidth={1.9} /> : null}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--disp)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--tx)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={model.name}
          >
            {model.name}
          </span>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--tx2)', marginTop: 3 }}>
            {category?.label} · {model.subtitle}
          </span>
        </span>
        <span style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {/* <button
            type="button"
            onClick={onResetThresholds}
            disabled={resetThresholdDisabled}
            title={resetThresholdDisabled ? 'No saved setting for this detection type' : 'Reset detection thresholds'}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid var(--bd)',
              background: 'var(--bg2)',
              color: resetThresholdDisabled ? 'var(--tx3)' : '#ec4899',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: resetThresholdDisabled ? 'not-allowed' : 'pointer',
              opacity: resetThresholdDisabled ? 0.6 : 1,
            }}
            aria-label="Reset detection thresholds"
          >
            <ListRestart size={15} />
          </button> */}
          <Toggle on={model.active} onChange={onToggle} disabled={toggleDisabled} />
        </span>
      </div>

      {/* Dynamic threshold rows: one slider per key from the API. */}
      {usesThresholds && (
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {thresholdKeys.map((key) => {
            const value = model.thresholds[key] ?? 70;
            const label = thresholdLabel(key);
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'var(--tx2)',
                    flex: '0 0 auto',
                  }}
                  title={label}
                >
                  {label}
                </span>
                <input
                  type="range"
                  className="vq-det-range"
                  min={0}
                  max={100}
                  value={value}
                  disabled={!model.active || !canEdit}
                  onChange={(e) => onThresholdChange(key, Number(e.target.value))}
                  aria-label={`${model.name} ${label}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: `linear-gradient(to right, #7c3aed ${value}%, var(--sliderrest, rgba(148,163,184,0.45)) ${value}%)`,
                    opacity: model.active ? 1 : 0.5,
                  }}
                />
                <span
                  style={{
                    flex: '0 0 auto',
                    minWidth: 22,
                    textAlign: 'right',
                    fontFamily: 'var(--mono)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: '#ec4899',
                  }}
                >
                  {value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Config stats */}
      <div
        className="vq-det-detail-stats"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 16 }}
      >
        <StatBox
          label="Status"
          value={statusValue}
          color={String(statusValue).toLowerCase() === 'active' ? 'var(--ok)' : 'var(--tx3)'}
        />
        <StatBox label="Schedule" value={actualScheduleMode} />
        <StatBox label="Applied Cameras" value={appliedCameras} />
        <StatBox label="Min Confidence" value={minConfidence} color="#ec4899" />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button
          type="button"
          onClick={onEditZones}
          disabled={!canEdit}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 8,
            border: 0,
            cursor: canEdit ? 'pointer' : 'not-allowed',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            background: 'linear-gradient(135deg,#ec4899,var(--violet))',
            boxShadow: '0 6px 18px rgba(236,72,153,.25)',
            opacity: canEdit ? 1 : 0.65,
          }}
        >
          Edit zones &amp; rules
        </button>
        <button
          type="button"
          onClick={openSchedule}
          disabled={scheduleDisabled}
          title={scheduleDisabled ? scheduleDisabledTitle : 'Edit schedule for this camera'}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 8,
            border: '1px solid var(--bd)',
            cursor: scheduleDisabled ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: scheduleDisabled ? 'var(--tx3)' : 'var(--tx2)',
            background: 'var(--bg2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            opacity: scheduleDisabled ? 0.65 : 1,
          }}
        >
          Edit Schedule
        </button>
        <button
          type="button"
          onClick={onResetSetting}
          disabled={resetDisabled || !canEdit}
          title={!canEdit ? 'You only have view access for detections' : (resetDisabled ? 'No saved setting for this detection type' : 'Reset selected detection settings')}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 8,
            border: '1px solid var(--bd)',
            cursor: (resetDisabled || !canEdit) ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: (resetDisabled || !canEdit) ? 'var(--tx3)' : 'var(--tx2)',
            background: 'var(--bg2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            opacity: (resetDisabled || !canEdit) ? 0.65 : 1,
          }}
        >
          <ListRestart size={15} />
          Reset Setting
        </button>
        <RecipientSelectButton
          settingId={canEdit ? settingId : null}
          initialAlerts={initialAlerts}
          onSaved={onRecipientsChange}
        />
      </div>
        {scheduleOpen && createPortal(
          <div
            onClick={() => { if (!scheduleLoading) closeSchedule(); }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(640px, 94vw)',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg1solid)',
                border: '1px solid var(--bd)',
                borderRadius: '20px',
                boxShadow: '0 20px 40px -15px rgba(124, 58, 237, 0.12), 0 0 0 1px rgba(124, 58, 237, 0.04)',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '24px 28px 18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      display: 'grid',
                      placeItems: 'center',
                      background: '#7c3aed',
                      color: '#ffffff',
                      flexShrink: 0,
                    }}
                  >
                    <Calendar size={22} strokeWidth={2} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--disp, sans-serif)' }}>
                      Edit Schedule for {model.name}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, color: 'var(--tx2)', lineHeight: 1.5 }}>
                      Set the timezone, mode and daily time ranges for the schedule.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { if (!scheduleLoading) closeSchedule(); }}
                  aria-label="Close schedule editor"
                  disabled={scheduleLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: scheduleLoading ? 'var(--tx3)' : 'var(--tx3)',
                    cursor: scheduleLoading ? 'not-allowed' : 'pointer',
                    padding: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    transition: 'color 0.15s, background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!scheduleLoading) {
                      e.currentTarget.style.color = 'var(--tx)';
                      e.currentTarget.style.backgroundColor = 'var(--bg3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!scheduleLoading) {
                      e.currentTarget.style.color = 'var(--tx3)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div style={{ overflowY: 'auto', padding: '0 28px 24px', display: 'grid', gap: 20 }}>
                {/* Schedule Settings Header */}
                <div style={{ display: 'grid', gap: 12 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '.05em',
                      color: '#7c3aed',
                      textTransform: 'uppercase',
                      marginTop: 4,
                    }}
                  >
                    Schedule Settings
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <ScheduleFieldDropdown
                      label="Time zone"
                      value={scheduleForm?.timezone || 'Asia/Kolkata'}
                      options={timezones}
                      placeholder={timezones.length ? 'Select time zone' : 'Loading time zonesÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦'}
                      disabled={scheduleLoading || !timezones.length}
                      onChange={(tz) => setScheduleForm((s) => ({ ...(s || {}), timezone: tz }))}
                      icon={Globe}
                      searchable
                    />

                    <ScheduleFieldDropdown
                      label="Mode"
                      value={scheduleForm?.mode === 'always' ? 'Always' : 'Custom'}
                      options={['Always', 'Custom']}
                      disabled={scheduleLoading}
                      onChange={(val) => setScheduleForm((s) => ({ ...(s || {}), mode: val.toLowerCase() }))}
                      icon={Clock}
                    />
                  </div>
                </div>

                {/* Weekly Schedule Days List */}
                <div style={{ display: 'grid', gap: 10 }}>
                  {scheduleForm?.mode === 'always' ? (
                    <div
                      style={{
                        padding: '18px 20px',
                        borderRadius: '16px',
                        background: 'var(--bg2)',
                        border: '1px solid var(--bd)',
                        color: 'var(--tx)',
                      }}
                    >
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Always mode</div>
                      <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--tx2)' }}>
                        This detection is active continuously. Daily time ranges are not required when the schedule mode is Always.
                        Switch to Custom mode if you want to define specific active days and times.
                      </div>
                    </div>
                  ) : (
                    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                      const ranges = scheduleForm?.days?.[day] || [];
                      const hasRange = ranges.length > 0;
                      return (
                        <div
                          key={day}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                            padding: '12px 16px',
                            background: 'var(--bg1solid)',
                            border: '1px solid var(--bd)',
                            borderRadius: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '8px',
                                display: 'grid',
                                placeItems: 'center',
                                background: 'color-mix(in srgb, var(--violet) 12%, var(--bg2))',
                                color: '#7c3aed',
                                flexShrink: 0,
                              }}
                            >
                              <Calendar size={16} />
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', width: 90, flexShrink: 0 }}>
                              {day.charAt(0).toUpperCase() + day.slice(1)}
                            </span>
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                              {!hasRange ? (
                                <span style={{ fontSize: 13, color: 'var(--tx3)' }}>No ranges</span>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input
                                    type="time"
                                    value={ranges[0].start || '09:00'}
                                    onChange={(e) => updateInterval(day, 0, 'start', e.target.value)}
                                    style={{
                                      border: '1px solid var(--bd2)',
                                      borderRadius: '8px',
                                      padding: '4px 8px',
                                      fontSize: '13px',
                                      fontWeight: 500,
                                      color: 'var(--tx)',
                                      background: 'var(--bg1solid)',
                                      outline: 'none',
                                    }}
                                  />
                                  <span style={{ fontSize: 13, color: 'var(--tx2)', fontWeight: 500 }}>to</span>
                                  <input
                                    type="time"
                                    value={ranges[0].end || '18:00'}
                                    onChange={(e) => updateInterval(day, 0, 'end', e.target.value)}
                                    style={{
                                      border: '1px solid var(--bd2)',
                                      borderRadius: '8px',
                                      padding: '4px 8px',
                                      fontSize: '13px',
                                      fontWeight: 500,
                                      color: 'var(--tx)',
                                      background: 'var(--bg1solid)',
                                      outline: 'none',
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          {hasRange ? (
                            <button
                              onClick={() => removeInterval(day, 0)}
                              type="button"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 32,
                                height: 32,
                                borderRadius: '8px',
                                border: 'none',
                                      color: '#ef4444',
                                cursor: 'pointer',
                                      flexShrink: 0,
                              }}
                              title="Remove time range"
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : (
                            <button
                              onClick={() => addInterval(day)}
                              type="button"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                height: 32,
                                padding: '0 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'color-mix(in srgb, var(--violet) 12%, var(--bg2))',
                                color: '#7c3aed',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '13px',
                                      flexShrink: 0,
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'color-mix(in srgb, var(--violet) 20%, var(--bg2))'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'color-mix(in srgb, var(--violet) 12%, var(--bg2))'}
                            >
                              <Plus size={14} strokeWidth={2.5} />
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  
                  {hasSelectedRange && (
                      <button
                        onClick={requestDeleteSchedule}
                        type="button"
                        className="vq-det-delete-schedule"
                        style={{
                          height: 44,
                          padding: '0 20px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <Trash2 size={15} />
                        Delete schedule
                      </button>
                    )}
                  </div>
                  <button
                    onClick={submitSchedule}
                    disabled={scheduleLoading}
                    type="button"
                    style={{
                      height: 44,
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: scheduleLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '0 32px',
                      boxShadow: '0 4px 12px rgba(124, 58, 237, 0.2)',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!scheduleLoading) e.currentTarget.style.opacity = 0.95;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = 1;
                    }}
                  >
                    {scheduleLoading ? (
                      'Saving...'
                    ) : (
                      <>
                        <CalendarCheck size={16} />
                        Save Schedule
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
        <ConfirmationModal
          open={confirmDeleteOpen}
          title="Delete schedule"
          message="Delete this custom schedule? This will remove the current schedule and revert the detection to Always mode."
          icon={<AlertCircle size={20} />}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          loading={scheduleLoading}
          onClose={() => setConfirmDeleteOpen(false)}
          onConfirm={confirmDeleteSchedule}
        />
    </div>
  );
}
