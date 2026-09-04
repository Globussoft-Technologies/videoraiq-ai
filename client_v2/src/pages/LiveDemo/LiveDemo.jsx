import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileVideo,
  ImagePlus,
  Loader,
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DETECTION_CATEGORIES } from '@/page/user/Configure/Detections/detectionsData';
import { ZONE_EXTRA_FIELDS } from '@/page/user/Configure/DetectionZoneMarking/constants';
import { createAuthorizedUser, isEmailExist } from '../RegisterUser/Api';
import { mediaUrl } from '@/lib/format';
import { COMPACT_TOAST } from '../RegisterUser/toastOptions';
import FaceCaptureWizard from '../RegisterUser/FaceCaptureWizard';
import { getVideoRecordVideos, getVideoRecords } from './api/get';
import { deleteDemoMedia } from './api/delete';
import { createVideoRecord, getDemoAttendanceLogs, getDemoIncidents, getLiveDemoAnalytics, processVideoRecord, updateVideoRecord, uploadDemoClip } from './api/post';
import howToTakeFacePhotos from './assets/howto.jpg';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { buildAttendanceRows, buildSessionRows, handleLiveDemoExport, handleLiveDemoExportAll } from './liveDemoExport';
import { clearLiveDemoSession, readLiveDemoSession, updateLiveDemoSession } from './liveDemoSession';
import SessionAnalyticsPanel from './SessionAnalyticsPanel';
import VideoProcessingLoader from './VideoProcessingLoader';

const categories = [{ key: 'all', label: 'All', color: null }, ...DETECTION_CATEGORIES];

const detections = [
  { name: 'Count Person Detection', subtitle: 'Occupancy', category: 'people', color: '#4f7cff', settingType: 'countPersonsSettings' },
  { name: 'Crowd Detection', subtitle: 'Density', category: 'people', color: '#6366f1', settingType: 'crowdDetectionSettings' },
  { name: 'Face Recognition', subtitle: 'Biometric', category: 'people', color: '#2f80ed', settingType: 'faceAuthenticationSettings' },
  { name: 'Zone Intrusion Detection', subtitle: 'Perimeter', category: 'perimeter', color: '#f05252', settingType: 'unauthorizedAccessSettings' },
  { name: 'Line Crossing Detection', subtitle: 'Tripwire', category: 'perimeter', color: '#ff5a5f', settingType: 'lineCrossingSettings' },
  { name: 'Loitering Detection', subtitle: 'Dwell time', category: 'perimeter', color: '#ef4444', settingType: 'loiteringDetectionSettings' },
  { name: 'Bag Detection', subtitle: 'Unattended object', category: 'perimeter', color: '#fb4d4d' },
  { name: 'Count Vehicles Detection', subtitle: 'Flow', category: 'vehicles', color: '#a855f7', settingType: 'countVehiclesSettings' },
  { name: 'Num Plate Detection (ANPR)', subtitle: 'ANPR', category: 'vehicles', color: '#b43df1', settingType: 'vehicleDetectionSettings' },
  { name: 'Vehicle Type Detection', subtitle: 'Classification', category: 'vehicles', color: '#9333ea', settingType: 'vehicleTypeDetectionSettings' },
  // { name: 'Vehicle Traffic Obstruction', subtitle: 'Blockage', category: 'vehicles', color: '#7c3aed', settingType: 'vehicleObstructionSettings' },
  { name: 'PPE Detection', subtitle: 'Hard hat / vest', category: 'safety', color: '#f59e0b', settingType: 'personalProtectiveEquipmentSettings' },
  { name: 'Food Service PPE Detection', subtitle: 'Hygiene', category: 'safety', color: '#f6a51a', settingType: 'foodServicePPEDetectionSettings' },
  { name: 'Fire & Smoke Detection', subtitle: 'Hazard', category: 'safety', color: '#fb923c' },
  { name: 'Desk Absence Detection', subtitle: 'Workstation', category: 'workplace', color: '#38c5dd', settingType: 'deskAbsenceSettings' },
  { name: 'Guard Absence Detection', subtitle: 'Post coverage', category: 'workplace', color: '#22c7d8', settingType: 'guardAbsenceSettings' },
  { name: 'Restaurant Table Occupancy', subtitle: 'Seating', category: 'workplace', color: '#06b6d4', settingType: 'tableOccupancyDetectionSettings' },
  { name: 'Door Detection', subtitle: 'Open / closed', category: 'workplace', color: '#14b8a6', settingType: 'doorDetectionSettings' },
  { name: 'Oil/Water Spillage Detection', subtitle: 'Floor hazard', category: 'industrial', color: '#10b981', settingType: 'waterSpillageDetectionSettings' },
  // { name: 'Oil Spillage Detection', subtitle: 'Floor hazard', category: 'industrial', color: '#0ea5a4' },
  { name: 'Conveyor Belt Status Detection', subtitle: 'Equipment', category: 'industrial', color: '#059669', settingType: 'conveyorDetectionSettings' },
  { name: 'Crusher Status Detection', subtitle: 'Equipment', category: 'industrial', color: '#0d9488', settingType: 'crusherDetectionSettings' },
  { name: 'Light Detection', subtitle: 'Illumination', category: 'industrial', color: '#84cc16', settingType: 'lightDetectionSettings' },
];

const steps = [
  ['1', 'Detection'],
  ['2', 'Upload'],
  ['3', 'Configure'],
  ['4', 'Review'],
];

function colorWithAlpha(hex, alpha) {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mediaSrc(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || /^blob:/i.test(path) || /^data:/i.test(path)) return path;
  return `${import.meta.env.VITE_BACKEND}/${String(path).replace(/^\/+/, '')}`;
}

// The DS/video-process pipeline's dsVideoUrl is served from a different host
// than the rest of the app's media — VITE_INCIDENT_URL, not VITE_BACKEND.
function dsVideoSrc(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || /^blob:/i.test(path) || /^data:/i.test(path)) return path;
  const host = import.meta.env.VITE_INCIDENT_URL || import.meta.env.VITE_BACKEND;
  return `${String(host).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;
}

function fileSizeLabel(size = 0) {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function recordIdOf(record) {
  return record?._id || record?.id || '';
}

// Matched Alerts is normally a live socket feed. For a re-opened past run there
// is no socket replay, so seed the panel from the attendance sessions the demo
// produced — one alert card per recognized face session, newest first.
function alertsFromAttendance(attendance) {
  const usersLogs = Array.isArray(attendance?.usersLogs) ? attendance.usersLogs : [];
  const alerts = [];
  for (const log of usersLogs) {
    const personName = log?.userInfo?.userName || log?.personName;
    if (!personName || personName.toLowerCase() === 'unknown') continue;
    const department = log?.userInfo?.departmentName || log?.department || '';
    const profilePics = log?.userInfo?.profilePics || [];
    for (const session of Array.isArray(log?.sessions) ? log.sessions : []) {
      alerts.push({
        key: `${log?.userId || personName}-${session?.timestamp || session?._id || alerts.length}`,
        personName,
        department,
        cameraName: session?.channelName || session?.channel || '',
        timestamp: session?.timestamp || log?.date || null,
        images: session?.images || {},
        profilePics,
      });
    }
  }
  return alerts
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, 20);
}

// The live-demo-analytics endpoint keys on the canonical setting type
// (`faceAuthenticationSettings`), the same one the detection catalogue and the
// video record's `detections` field use — pass it straight through.
function analyticsSettingType(settingType) {
  if (!settingType) return '';
  return settingType === 'attendanceSettings' ? 'faceAuthenticationSettings' : settingType;
}

function firstVideoOf(record) {
  return Array.isArray(record?.videos) ? record.videos[0] : null;
}

function containRect(containerW, containerH, videoW, videoH) {
  if (!containerW || !containerH || !videoW || !videoH) {
    return { left: 0, top: 0, width: containerW || 0, height: containerH || 0 };
  }
  const containerRatio = containerW / containerH;
  const videoRatio = videoW / videoH;
  if (containerRatio > videoRatio) {
    const height = containerH;
    const width = height * videoRatio;
    return { left: (containerW - width) / 2, top: 0, width, height };
  }
  const width = containerW;
  const height = width / videoRatio;
  return { left: 0, top: (containerH - height) / 2, width, height };
}

function pointsToAttr(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function valueForPayload(value) {
  const trimmed = String(value ?? '').trim();
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function defaultZoneSetting(index, noun = 'Zone') {
  return {
    name: `${noun} ${index + 1}`,
    capacity: '',
    threshold: '',
    // Line Crossing only; harmless on zone types, which never read it.
    countMode: 'entry',
  };
}

function syncZoneSettings(settings = [], count = 0, noun = 'Zone') {
  return Array.from({ length: count }, (_, index) => ({
    ...defaultZoneSetting(index, noun),
    ...(settings[index] || {}),
  }));
}

function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  busy = false,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-2xl">
        <div className="px-5 py-4">
          <h3 className="text-base font-bold text-[var(--tx)]">{title}</h3>
          <p className="mt-2 text-xs leading-5 text-[var(--tx2)]">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[var(--bd)] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-10 cursor-pointer rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] px-5 text-sm font-bold text-[var(--tx2)] hover:bg-[var(--bg2)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-red-500 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DemoDrawingToolbar({
  drawing,
  pointCount,
  maxPoints,
  disabled,
  isLineCrossing,
  onDraw,
  onMaxArea,
  onMinArea,
  onDecrease,
  onIncrease,
  onUndo,
  onClear,
  onSave,
}) {
  const buttonBase = 'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] px-2.5 text-[11px] font-bold text-[var(--tx2)] transition-colors hover:border-[var(--blue)] hover:text-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isLineCrossing && (
        <>
          <button type="button" onClick={onMaxArea} disabled={disabled} className={buttonBase}>
            <Maximize2 className="h-3.5 w-3.5" />
            Max Area
          </button>
          <button type="button" onClick={onMinArea} disabled={disabled} className={buttonBase}>
            <Minimize2 className="h-3.5 w-3.5" />
            Min Area
          </button>
        </>
      )}
      <button type="button" onClick={onDraw} disabled={disabled} className={`${buttonBase} ${drawing ? 'border-[var(--blue)] text-[var(--blue)]' : ''}`}>
        <Pencil className="h-3.5 w-3.5" />
        {drawing ? 'Stop Drawing' : isLineCrossing ? 'Draw Line' : 'Start Drawing'}
      </button>
      {!isLineCrossing && (
        <div className="inline-flex h-8 items-center overflow-hidden rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)]">
          <button type="button" onClick={onDecrease} disabled={disabled || maxPoints <= 3} className="grid h-8 w-8 cursor-pointer place-items-center text-[var(--tx2)] disabled:cursor-not-allowed disabled:opacity-40">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-8 border-x border-[var(--bd)] px-2 text-center text-[11px] font-bold text-[var(--tx)]">{maxPoints}</span>
          <button type="button" onClick={onIncrease} disabled={disabled} className="grid h-8 w-8 cursor-pointer place-items-center text-[var(--tx2)] disabled:cursor-not-allowed disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <button type="button" onClick={onUndo} disabled={disabled || pointCount === 0} className={buttonBase}>
        <Undo2 className="h-3.5 w-3.5" />
        Undo
      </button>
      <button type="button" onClick={onClear} disabled={disabled || pointCount === 0} className={buttonBase}>
        <Trash2 className="h-3.5 w-3.5" />
        Clear
      </button>
      <button type="button" onClick={onSave} disabled={disabled || pointCount < 3} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-3 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
        <Save className="h-3.5 w-3.5" />
        {isLineCrossing ? 'Save Line' : 'Save Area'}
      </button>
    </div>
  );
}

function FullscreenDrawingMenu({
  drawing,
  pointCount,
  disabled,
  isLineCrossing,
  onDraw,
  onMaxArea,
  onMinArea,
  onUndo,
  onClear,
}) {
  const actions = [
    ...(isLineCrossing
      ? []
      : [
          { label: 'Max Area', icon: Maximize2, onClick: onMaxArea },
          { label: 'Min Area', icon: Minimize2, onClick: onMinArea },
        ]),
    { label: drawing ? 'Stop Drawing' : isLineCrossing ? 'Draw Line' : 'Start Drawing', icon: Pencil, onClick: onDraw },
    { label: 'Undo', icon: Undo2, onClick: onUndo, disabled: pointCount === 0 },
    { label: 'Clear All', icon: Trash2, onClick: onClear, disabled: pointCount === 0 },
  ];

  return (
    <div className="w-40 rounded-lg border border-white/10 bg-[#0d1118]/95 p-1.5 shadow-2xl backdrop-blur">
      {actions.map((action) => {
        const Icon = action.icon;
        const actionDisabled = disabled || action.disabled;
        return (
          <button
            key={action.label}
            type="button"
            disabled={actionDisabled}
            onClick={(event) => {
              event.stopPropagation();
              if (!actionDisabled) {
                action.onClick();
              }
            }}
            className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-left text-[11px] font-bold transition-colors ${
              actionDisabled
                ? 'cursor-not-allowed text-white/30'
                : 'bg-white/[0.06] text-white hover:bg-white/[0.12]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

function SaveDemoAreaModal({
  open,
  detectionName,
  settingType,
  zoneCount,
  zoneOffset = 0,
  initialZoneSettings,
  saving,
  onClose,
  onSubmit,
}) {
  const [name, setName] = useState(detectionName || '');
  const [zoneDrafts, setZoneDrafts] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const extraFields = ZONE_EXTRA_FIELDS[settingType] || [];
  const isLineCrossing = settingType === 'lineCrossingSettings';
  const noun = isLineCrossing ? 'Line' : 'Zone';

  useEffect(() => {
    if (!open) return;
    setName(detectionName || '');
    setZoneDrafts(Array.from({ length: Math.max(1, zoneCount) }, (_, index) => ({
      name: `${isLineCrossing ? 'Line' : 'Zone'} ${zoneOffset + index + 1}`,
      capacity: '',
      threshold: '',
      // Line Crossing's only extra field: which direction of travel is counted.
      countMode: 'entry',
      ...(initialZoneSettings?.[index] || {}),
    })));
    setCollapsed({});
  }, [open, detectionName, settingType, zoneCount, zoneOffset, initialZoneSettings, isLineCrossing]);

  const toggleCollapsed = (index) => {
    setCollapsed((current) => ({ ...current, [index]: !current[index] }));
  };

  if (!open) return null;

  const inputClass = 'h-11 w-full rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 text-sm font-semibold text-[var(--tx)] outline-none focus:border-[var(--blue)]';
  const labelClass = 'mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--tx3)]';

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--bd)] px-5 py-4">
          <h3 className="text-base font-bold text-[var(--tx)]">{isLineCrossing ? 'Save Detection Line' : 'Save Detection Area'}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[var(--tx3)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close save area"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className={labelClass}>Detection Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
              placeholder="Enter detection name"
            />
          </div>

          <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg2)] p-3">
            <div className="mb-3 text-xs font-bold text-[var(--tx)]">
              {zoneCount > 1 ? `${zoneCount} New ${noun}s` : `New ${noun}`}
            </div>
            <div className="max-h-[196px] space-y-3 overflow-y-auto pr-1">
              {zoneDrafts.map((zone, index) => {
                const isCollapsed = !!collapsed[index];
                return (
                  <div key={`save-zone-${index}`} className="rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)]">
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(index)}
                      className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left"
                      aria-expanded={!isCollapsed}
                    >
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--tx)]">
                        {isCollapsed ? <ChevronDown className="h-3.5 w-3.5 text-[var(--tx3)]" /> : <ChevronUp className="h-3.5 w-3.5 text-[var(--tx3)]" />}
                        {zone.name || `${noun} ${index + 1}`}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-3 border-t border-[var(--bd)] p-3">
                        <div>
                          <label className={labelClass}>{noun} Name *</label>
                          <input
                            value={zone.name}
                            onChange={(event) => {
                              const next = [...zoneDrafts];
                              next[index] = { ...next[index], name: event.target.value };
                              setZoneDrafts(next);
                            }}
                            className={inputClass}
                            placeholder={`Enter ${noun.toLowerCase()} name`}
                          />
                        </div>
                        {isLineCrossing && (
                          <div>
                            <label className={labelClass}>Mode</label>
                            <select
                              value={zone.countMode || 'entry'}
                              onChange={(event) => {
                                const next = [...zoneDrafts];
                                next[index] = { ...next[index], countMode: event.target.value };
                                setZoneDrafts(next);
                              }}
                              className={inputClass}
                            >
                              <option value="entry">Entry</option>
                              <option value="exit">Exit</option>
                              <option value="both">Both</option>
                            </select>
                          </div>
                        )}
                        {extraFields.includes('capacity') && (
                          <div>
                            <label className={labelClass}>Capacity *</label>
                            <input
                              type="number"
                              value={zone.capacity}
                              onChange={(event) => {
                                const next = [...zoneDrafts];
                                next[index] = { ...next[index], capacity: event.target.value };
                                setZoneDrafts(next);
                              }}
                              className={inputClass}
                              placeholder="e.g. 10"
                            />
                          </div>
                        )}
                        {extraFields.includes('threshold') && (
                          <div>
                            <label className={labelClass}>Threshold (sec) *</label>
                            <input
                              type="number"
                              value={zone.threshold}
                              onChange={(event) => {
                                const next = [...zoneDrafts];
                                next[index] = { ...next[index], threshold: event.target.value };
                                setZoneDrafts(next);
                              }}
                              className={inputClass}
                              placeholder="e.g. 30"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--bd)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 cursor-pointer rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] px-5 text-sm font-bold text-[var(--tx2)] hover:bg-[var(--bg2)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit({
              detectionName: name.trim(),
              severity: 'moderate',
              zoneDrafts: zoneDrafts.map((zone) => ({
                name: zone.name.trim(),
                capacity: zone.capacity,
                threshold: zone.threshold,
              })),
            })}
            disabled={saving}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-5 text-sm font-bold text-white shadow-lg shadow-[var(--violet)]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader className="h-4 w-4 animate-spin" />}
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

const detectionConfigs = {
  'Count Person Detection': {
    description: 'Set the trigger for count person detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Max Occupancy (People)', value: '12', unit: 'people' }],
  },
  'Crowd Detection': {
    description: 'Set the trigger for crowd detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Density Threshold (%)', value: '70', unit: '%' }],
  },
  'Zone Intrusion Detection': {
    description:
      'Draw the restricted zone directly on your clip - click at least 3 points on the video. Anyone entering the polygon triggers an intrusion event.',
    geometry: {
      text: 'Click at least 3 points on your video to outline the restricted zone. Anyone entering it triggers an intrusion alert.',
      badge: '0 / 3 Points Placed',
    },
    fields: [{ label: 'Alert After Dwell Of (Sec)', value: '3', unit: 'sec' }],
  },
  'Line Crossing Detection': {
    description: 'Click "Draw Line", then click the two line endpoints and one inside reference point.',
    geometry: {
      text: 'Click two points to place the tripwire, then a third point on the side that counts as inside. Every crossing is counted with its direction.',
      badge: '0 / 3 Points Placed',
    },
    fields: [{ label: 'Debounce Between Events (Sec)', value: '5', unit: 'sec' }],
  },
  'Loitering Detection': {
    description: 'Set the trigger for loitering detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Dwell Longer Than (Sec)', value: '120', unit: 'sec' }],
  },
  'Bag Detection': {
    description: 'Set the trigger for bag detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Unattended After (Sec)', value: '45', unit: 'sec' }],
  },
  'Count Vehicles Detection': {
    description: 'Set the trigger for count vehicles detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Flow Alert Threshold (Veh/Min)', value: '30', unit: 'veh/min' }],
  },
  'Num Plate Detection (ANPR)': {
    description:
      'Add the plates to watch for. Every plate read in the clip is logged; watchlist matches raise an alert with the captured frame.',
    anpr: true,
  },
  'Vehicle Type Detection': {
    description: 'Set the trigger for vehicle type detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Restricted Type', value: 'Truck' }],
  },
  'Vehicle Traffic Obstruction': {
    description:
      'Set the trigger for vehicle traffic obstruction and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Blocked Longer Than (Sec)', value: '20', unit: 'sec' }],
  },
  'PPE Detection': {
    description: 'Set the trigger for ppe detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Required Gear', value: 'Hard hat + Vest' }],
  },
  'Food Service PPE Detection': {
    description:
      'Set the trigger for food service ppe detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Required Gear', value: 'Hairnet + Gloves' }],
  },
  'Fire & Smoke Detection': {
    description: 'Set the trigger for fire & smoke detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Sensitivity (%)', value: '90', unit: '%' }],
  },
  'Desk Absence Detection': {
    description: 'Set the trigger for desk absence detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Absent Longer Than (Min)', value: '10', unit: 'min' }],
  },
  'Guard Absence Detection': {
    description: 'Set the trigger for guard absence detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Post Empty Longer Than (Min)', value: '5', unit: 'min' }],
  },
  'Restaurant Table Occupancy': {
    description:
      'Set the trigger for restaurant table occupancy and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Tables Monitored (Tables)', value: '8', unit: 'tables' }],
  },
  'Door Detection': {
    description: 'Set the trigger for door detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Held Open Longer Than (Sec)', value: '30', unit: 'sec' }],
  },
  'Water Spillage Detection': {
    description: 'Set the trigger for water spillage detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Sensitivity (%)', value: '80', unit: '%' }],
  },
  'Oil Spillage Detection': {
    description: 'Set the trigger for oil spillage detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Sensitivity (%)', value: '82', unit: '%' }],
  },
  'Conveyor Belt Status Detection': {
    description:
      'Set the trigger for conveyor belt status detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Stopped Longer Than (Sec)', value: '15', unit: 'sec' }],
  },
  'Crusher Status Detection': {
    description:
      'Set the trigger for crusher status detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Fault After (Sec)', value: '10', unit: 'sec' }],
  },
  'Light Detection': {
    description: 'Set the trigger for light detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Lux Threshold (Lux)', value: '120', unit: 'lux' }],
  },
};

function FieldLabel({ children, required = false }) {
  return (
    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--tx3)]">
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );
}

function TextInput({ label, placeholder, value, unit, required = false, select = false, readOnly = false, onChange, type = 'text' }) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type={type}
            readOnly={readOnly}
            {...(value !== undefined ? { value } : {})}
            onChange={onChange}
            placeholder={placeholder}
            className="h-11 w-full rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 pr-9 text-sm text-[var(--tx)] outline-none"
          />
          {select && <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tx3)]" />}
        </div>
        {unit && <span className="min-w-[42px] text-xs font-semibold text-[var(--tx3)]">{unit}</span>}
      </div>
    </div>
  );
}

function ConfidenceControl({ confidence, setConfidence }) {
  return (
    <div className="mt-4 border-t border-[var(--bd)] pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--tx3)]">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Min Confidence
        </span>
        <span className="text-xs font-bold text-[var(--blue)]">{confidence}%</span>
      </div>
      <input
        type="range"
        min="40"
        max="99"
        value={confidence}
        onChange={(event) => setConfidence(event.target.value)}
        className="w-full cursor-pointer accent-[var(--violet)]"
      />
      <div className="mt-2 text-[11px] text-[var(--tx3)]">
        Matches below this score are ignored. Lower it if your clip is low-light or far from the camera.
      </div>
    </div>
  );
}

function GeometryHint({ geometry }) {
  if (!geometry) return null;

  return (
    <div className="mt-4">
      <div className="rounded-lg border border-dashed border-fuchsia-300 bg-fuchsia-50/60 px-4 py-3 text-xs leading-5 text-[var(--tx2)]">
        <span className="mr-3 inline-block h-3 w-3 border-b-2 border-l-2 border-fuchsia-500 align-middle" />
        {geometry.text}
      </div>
      <span className="mt-3 inline-flex rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-orange-500">
        {geometry.badge}
      </span>
    </div>
  );
}

function AnprConfig() {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <FieldLabel>Watchlist Plates</FieldLabel>
        <div className="flex gap-2">
          <input
            readOnly
            placeholder="E.G. KA02 MP9657"
            className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--tx3)] outline-none"
          />
          <button className="inline-flex h-11 cursor-pointer items-center gap-1 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-4 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
      <div>
        <FieldLabel>Match Direction</FieldLabel>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-1 text-xs font-bold text-[var(--tx2)]">
          {['Entry only', 'Exit only', 'Both ways'].map((option) => (
            <button
              key={option}
              className={`h-8 cursor-pointer rounded-md ${option === 'Both ways' ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white' : ''}`}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoZoneSettingsPanel({
  settingType,
  zones,
  zoneSettings,
  saving,
  onChange,
  onDelete,
  onSave,
}) {
  const [collapsed, setCollapsed] = useState({});

  if (!zones.length) return null;

  const extraFields = ZONE_EXTRA_FIELDS[settingType] || [];
  const isLineCrossing = settingType === 'lineCrossingSettings';
  const inputClass = 'h-10 w-full rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 text-xs font-semibold text-[var(--tx)] outline-none focus:border-[var(--blue)]';
  const labelClass = 'mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--tx3)]';

  const toggleCollapsed = (index) => {
    setCollapsed((current) => ({ ...current, [index]: !current[index] }));
  };

  return (
    <div className="mt-4 rounded-xl border border-[var(--bd)] bg-[var(--bg2)] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-[var(--tx)]">{isLineCrossing ? 'Line Settings' : 'Zone Settings'}</div>
          <div className="mt-1 text-[11px] text-[var(--tx3)]">
            {isLineCrossing
              ? `${zones.length} line${zones.length === 1 ? '' : 's'} drawn for this detection type.`
              : `${zones.length} zone${zones.length === 1 ? '' : 's'} drawn for this detection type.`}
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-3 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>

      <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
        {zones.map((_, index) => {
          const zone = zoneSettings[index] || defaultZoneSetting(index);
          const isCollapsed = !!collapsed[index];
          return (
            <div key={`config-zone-${index}`} className="rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)]">
              <button
                type="button"
                onClick={() => toggleCollapsed(index)}
                className="flex w-full cursor-pointer items-center justify-between border-b border-[var(--bd)] px-3 py-2 text-left"
                aria-expanded={!isCollapsed}
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--tx)]">
                  {isCollapsed ? <ChevronDown className="h-3.5 w-3.5 text-[var(--tx3)]" /> : <ChevronUp className="h-3.5 w-3.5 text-[var(--tx3)]" />}
                  {zone.name || `Zone ${index + 1}`}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!saving) onDelete(index);
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !saving) {
                      event.preventDefault();
                      onDelete(index);
                    }
                  }}
                  aria-disabled={saving}
                  aria-label={`Delete zone ${index + 1}`}
                  className={`grid h-7 w-7 place-items-center rounded-md text-red-500 hover:bg-red-50 ${saving ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </button>
              {!isCollapsed && (
                <div className="space-y-3 p-3">
                  <div>
                    <label className={labelClass}>{isLineCrossing ? 'Line' : 'Zone'} Name *</label>
                    <input
                      value={zone.name}
                      onChange={(event) => onChange(index, 'name', event.target.value)}
                      className={inputClass}
                      placeholder={isLineCrossing ? 'Enter line name' : 'Enter zone name'}
                    />
                  </div>
                  {isLineCrossing && (
                    <div>
                      <label className={labelClass}>Mode</label>
                      <select
                        value={zone.countMode || 'entry'}
                        onChange={(event) => onChange(index, 'countMode', event.target.value)}
                        className={inputClass}
                      >
                        <option value="entry">Entry</option>
                        <option value="exit">Exit</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  )}
                  {extraFields.includes('capacity') && (
                    <div>
                      <label className={labelClass}>Capacity *</label>
                      <input
                        type="number"
                        value={zone.capacity}
                        onChange={(event) => onChange(index, 'capacity', event.target.value)}
                        className={inputClass}
                        placeholder="e.g. 10"
                      />
                    </div>
                  )}
                  {extraFields.includes('threshold') && (
                    <div>
                      <label className={labelClass}>Threshold (sec) *</label>
                      <input
                        type="number"
                        value={zone.threshold}
                        onChange={(event) => onChange(index, 'threshold', event.target.value)}
                        className={inputClass}
                        placeholder="e.g. 30"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetectionConfigPanel({
  detectionName,
  config,
  confidence,
  setConfidence,
  settingType,
  zones,
  zoneSettings,
  savingArea,
  onZoneSettingChange,
  onZoneDelete,
  onZoneSettingsSave,
}) {
  return (
    <section data-tour="demo-config" className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <h2 className="text-[15px] font-bold text-[var(--tx)]">3. Configure {detectionName}</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--tx2)]">{config.description}</p>

      <GeometryHint geometry={config.geometry} />

      {config.anpr ? (
        <AnprConfig />
      ) : null}

      <DemoZoneSettingsPanel
        settingType={settingType}
        zones={zones}
        zoneSettings={zoneSettings}
        saving={savingArea}
        onChange={onZoneSettingChange}
        onDelete={onZoneDelete}
        onSave={onZoneSettingsSave}
      />

      <ConfidenceControl confidence={confidence} setConfidence={setConfidence} />
    </section>
  );
}

// A snapshot thumbnail that opens the image in a centred modal popup on click
// (like the Car Logs image preview) -- the thumbnail itself never changes size,
// so the surrounding layout stays put. Shared by the Matched Alerts list and
// the Attendance Log table.
function ExpandableSnap({ src, alt, size = 'h-10 w-10' }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!src) {
    return (
      <span className={`grid ${size} shrink-0 place-items-center rounded-md border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx3)]`}>
        <User className="h-4 w-4" />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`block shrink-0 cursor-pointer overflow-hidden rounded-md border border-[var(--bd)] transition-colors hover:border-[var(--blue)] ${size}`}
        aria-label="View snapshot"
        title="Click to enlarge"
      >
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
        />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -right-3 -top-3 z-20 grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx)] shadow-lg transition-colors hover:bg-[var(--bg2)]"
              aria-label="Close"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={src}
              alt={alt}
              className="h-[80vh] max-h-[900px] w-auto min-w-[320px] max-w-[92vw] rounded-xl bg-[var(--bg2)] object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

function MatchedAlertsPanel({ alerts }) {
  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-bold text-[var(--tx)]">
          4 · Matched alerts
          {alerts.length > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
              {alerts.length}
            </span>
          )}
        </h2>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-6 text-center text-xs text-[var(--tx3)]">
          No matches yet — process a clip to see face matches here.
        </div>
      ) : (
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {alerts.map((alert) => {
            const photo = alert.images?.face || alert.profilePics?.[0];
            const time = alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString([], { hour12: false }) : '--';
            return (
              <div key={alert.key} className="flex items-center gap-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-2.5">
                <ExpandableSnap src={photo ? dsVideoSrc(photo) : ''} alt={alert.personName} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[var(--tx)]">Face match — {alert.personName}</div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--tx3)]">
                    {time}{alert.cameraName ? ` · ${alert.cameraName}` : ''}{alert.department ? ` · ${alert.department}` : ''}
                  </div>
                </div>
                <span className="shrink-0 rounded-md border border-[var(--blue)]/40 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--blue)]">
                  Info
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Event log for every non-face detection. Rows come from the same
// /incidents feed the real Incidents page uses (scoped to liveDemoData), so the
// field names here mirror IncidentLogsPage's mapping rather than inventing new
// ones. Face Recognition keeps its own Attendance Log instead.
const SEVERITY_STYLES = {
  high: 'border-red-400/40 bg-red-500/10 text-red-500',
  moderate: 'border-amber-400/40 bg-amber-500/10 text-amber-500',
  medium: 'border-amber-400/40 bg-amber-500/10 text-amber-500',
  low: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-500',
};

function incidentStatus(item) {
  if (item?.resolved) return { label: 'Resolved', className: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-500' };
  if (item?.report?.status) return { label: 'Reported', className: 'border-red-400/40 bg-red-500/10 text-red-500' };
  return { label: 'New', className: 'border-[var(--blue)]/40 bg-[var(--blue)]/10 text-[var(--blue)]' };
}

// ConfidenceScoreInPercentage is already 0-100; the legacy fallbacks are 0-1
// ratios, so only those get scaled.
function incidentConfidence(item) {
  const pct = item?.ConfidenceScoreInPercentage ?? item?.confidenceScoreInPercentage;
  if (Number.isFinite(Number(pct))) return `${Math.round(Number(pct))}%`;
  const raw = item?.confidence ?? item?.accuracy ?? item?.score;
  if (Number.isFinite(Number(raw))) return `${Math.round(Number(raw) * 100)}%`;
  return '--';
}

function incidentTime(item) {
  const value = item?.timeOfIncident || item?.createdAt;
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '--'
    : parsed.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

function DemoEventLogPanel({ incidents, detectionName, loading }) {
  const items = Array.isArray(incidents?.items) ? incidents.items : [];
  const total = incidents?.totalCount ?? items.length;

  return (
    <section data-tour="demo-config" className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-[var(--tx)]">Event Log</h2>
          <span className="rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--tx3)]">
            {detectionName}
          </span>
        </div>
        <span className="text-[11px] text-[var(--tx3)]">{total} {total === 1 ? 'event' : 'events'}</span>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-6 text-center text-xs text-[var(--tx3)]">
          Loading events...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-6 text-center text-xs text-[var(--tx3)]">
          No events detected in this clip.
        </div>
      ) : (
        <div className="max-h-[360px] overflow-auto rounded-lg border border-[var(--bd)]">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--bg2)] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--tx3)]">
              <tr>
                <th className="px-3 py-2">Snap</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Camera</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const severity = String(item?.severity || '').toLowerCase();
                const status = incidentStatus(item);
                return (
                  <tr key={item?._id || item?.id || index} className="border-t border-[var(--bd)] align-middle">
                    <td className="px-3 py-2">
                      <ExpandableSnap src={mediaUrl(item?.Image)} alt={item?.incidentName || 'Event snapshot'} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-bold text-[var(--tx)]">{item?.incidentName || detectionName}</div>
                      {item?.zone && <div className="mt-0.5 text-[11px] text-[var(--tx3)]">{item.zone}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--tx2)]">{incidentTime(item)}</td>
                    <td className="px-3 py-2 text-[var(--tx2)]">
                      {item?.channelData?.name || item?.channelName || '--'}
                    </td>
                    <td className="px-3 py-2">
                      {severity ? (
                        <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${SEVERITY_STYLES[severity] || 'border-[var(--bd)] text-[var(--tx3)]'}`}>
                          {severity}
                        </span>
                      ) : (
                        <span className="text-[var(--tx3)]">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--tx2)]">{incidentConfidence(item)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FaceRecognitionConfig({ confidence, setConfidence }) {
  const frontInputRef = useRef(null);
  const rightInputRef = useRef(null);
  const leftInputRef = useRef(null);
  const [showGuide, setShowGuide] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [activeCaptureAngle, setActiveCaptureAngle] = useState('Front');
  const [captureMode, setCaptureMode] = useState('camera');
  const [registeredFace, setRegisteredFace] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredUser, setRegisteredUser] = useState(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    vehicleNumber: '',
  });
  const [errors, setErrors] = useState({});
  const [imageFiles, setImageFiles] = useState([null, null, null]);
  const [imageUrls, setImageUrls] = useState(['', '', '']);
  const photoInputs = [
    { label: 'Front face', angle: 'Front', ref: frontInputRef, index: 0 },
    { label: 'Right profile', angle: 'Right', ref: rightInputRef, index: 1 },
    { label: 'Left profile', angle: 'Left', ref: leftInputRef, index: 2 },
  ];
  const uploadedCount = imageFiles.filter(Boolean).length;

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handlePhotoUpload = (file, index) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Please upload only JPG or PNG images', COMPACT_TOAST);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImageFiles((current) => {
      const next = [...current];
      next[index] = file;
      return next;
    });
    setImageUrls((current) => {
      const next = [...current];
      next[index] = previewUrl;
      return next;
    });
    setErrors((current) => ({ ...current, photos: undefined }));
  };

  const openCaptureWizard = (angle, mode = 'camera') => {
    setActiveCaptureAngle(angle);
    setCaptureMode(mode === 'upload' ? 'upload' : 'camera');
    setIsWizardOpen(true);
  };

  const handleWizardComplete = (files) => {
    (Array.isArray(files) ? files : []).forEach((file, index) => {
      if (file instanceof File) handlePhotoUpload(file, index);
    });
    setIsWizardOpen(false);
  };

  const removePhoto = (index) => {
    setImageFiles((current) => {
      const next = [...current];
      next[index] = null;
      return next;
    });
    setImageUrls((current) => {
      const next = [...current];
      next[index] = '';
      return next;
    });
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.firstName.trim()) nextErrors.firstName = 'First name is required';
    else if (form.firstName.trim().length < 2) nextErrors.firstName = 'First name must be at least 2 characters';
    if (!form.lastName.trim()) nextErrors.lastName = 'Last name is required';
    if (!form.email.trim()) nextErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.(com|net|org|in|co|io|edu|gov)$/.test(form.email.trim())) {
      nextErrors.email = 'Invalid email format';
    }
    if (uploadedCount < 3) nextErrors.photos = 'Please upload 3 face images';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRegisterFace = async () => {
    if (!validate()) {
      toast.error('Please fill all required fields', COMPACT_TOAST);
      return;
    }

    setIsSubmitting(true);
    try {
      const emailCheck = await isEmailExist(form.email.trim());
      if (emailCheck?.data?.body?.data?.exists === true) {
        setErrors((current) => ({ ...current, email: 'Email already exists' }));
        toast.error('Email already exists', COMPACT_TOAST);
        return;
      }

      const payload = new FormData();
      payload.append('firstName', form.firstName.trim());
      payload.append('lastName', form.lastName.trim());
      payload.append('email', form.email.trim());
      payload.append('vehicleNumber', form.vehicleNumber.trim());
      payload.append('liveDemo', 'true');
      imageFiles.forEach((file) => {
        if (file instanceof File) payload.append('file', file);
      });

      const data = await createAuthorizedUser(payload);
      if (data?.body?.status !== 'success') {
        toast.error(data?.body?.message || data?.body?.error || 'Failed to register face', COMPACT_TOAST);
        return;
      }

      setRegisteredUser({ ...form, photo: imageUrls.find(Boolean) || howToTakeFacePhotos });
      setRegisteredFace(true);
      toast.success('Face registered successfully', COMPACT_TOAST);
    } catch (error) {
      console.error('Failed to register face', error);
      const message =
        error?.response?.data?.body?.message ||
        error?.response?.data?.body?.error ||
        error?.message ||
        'Failed to register face';
      toast.error(message, COMPACT_TOAST);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section data-tour="demo-config" className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <h2 className="text-[15px] font-bold text-[var(--tx)]">3. Configure Face Recognition</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--tx2)]">
        Register the people to find in your clip. VideorAIQ matches every frame against the registered faces and builds an attendance log with check-in / check-out times.
      </p>

      <div className="mt-4 rounded-xl border border-[var(--bd)] bg-[var(--bg2)] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <TextInput label="First Name" placeholder="Enter First Name" value={form.firstName} onChange={(event) => setField('firstName', event.target.value)} required />
            {errors.firstName && <div className="mt-1 text-[11px] text-[var(--crit)]">{errors.firstName}</div>}
          </div>
          <div>
            <TextInput label="Last Name" placeholder="Enter Last Name" value={form.lastName} onChange={(event) => setField('lastName', event.target.value)} required />
            {errors.lastName && <div className="mt-1 text-[11px] text-[var(--crit)]">{errors.lastName}</div>}
          </div>
          <div>
            <TextInput label="Email" placeholder="name@org.com" value={form.email} onChange={(event) => setField('email', event.target.value)} type="email" required />
            {errors.email && <div className="mt-1 text-[11px] text-[var(--crit)]">{errors.email}</div>}
          </div>
          <TextInput label="Vehicle Number" placeholder="e.g. KA01AB1234" value={form.vehicleNumber} onChange={(event) => setField('vehicleNumber', event.target.value)} />
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg1solid)] p-3">
          <img
            src={howToTakeFacePhotos}
            alt="How to take front, right and left face photos"
            className="h-12 w-16 shrink-0 rounded-md border border-[var(--bd)] object-cover"
          />
          <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[var(--blue)]">How to take the 3 photos</div>
            <div className="mt-1 truncate text-[11px] text-[var(--tx3)]">See sample front, left & right shots with instructions</div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-[var(--bd)] text-[var(--tx3)] transition-colors hover:border-[var(--blue)] hover:text-[var(--blue)]"
            aria-label="Open face photo guide"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {photoInputs.map(({ label, angle, ref, index }) => (
            <div key={label} className="overflow-hidden rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg1solid)]">
              {imageUrls[index] ? (
                <div className="grid h-[144px] place-items-center">
                  <div className="relative h-full w-full">
                    <img src={imageUrls[index]} alt={label} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute right-2 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-black/55 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openCaptureWizard(angle, 'camera')}
                  className="grid h-[144px] w-full cursor-pointer place-items-center text-[var(--tx3)] transition-colors hover:bg-[var(--bg2)] hover:text-[var(--blue)]"
                  aria-label={`Capture ${label}`}
                >
                  <User className="h-5 w-5 text-[var(--tx3)]" />
                </button>
              )}
              <div className="border-t border-[var(--bd)] px-3 py-2">
                <div className="mb-2 text-center text-[10px] font-semibold text-[var(--tx3)]">{label}</div>
                <input
                  ref={ref}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(event) => {
                    handlePhotoUpload(event.target.files?.[0], index);
                    event.target.value = '';
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openCaptureWizard(angle, 'camera')}
                    className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--blue)] px-2 text-[10px] font-bold text-white transition-opacity hover:opacity-95"
                  >
                    <Camera className="h-3 w-3" />
                    Capture
                  </button>
                  <button
                    type="button"
                    onClick={() => openCaptureWizard(angle, 'upload')}
                    className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2 text-[10px] font-bold text-[var(--tx2)] transition-colors hover:bg-[var(--bg3)]"
                  >
                    <ImagePlus className="h-3 w-3" />
                    Upload
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleRegisterFace}
          disabled={isSubmitting}
          className="mt-3 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting && <Loader className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Registering...' : 'Register face'}
        </button>
        {errors.photos && <div className="mt-2 text-center text-[11px] text-[var(--crit)]">{errors.photos}</div>}

        {registeredFace && registeredUser && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--tx3)]">Registered Faces - 1</div>
              <div className="flex items-center gap-3 rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] p-2.5">
                <img
                  src={registeredUser.photo}
                  alt="Registered face"
                  className="h-10 w-10 shrink-0 rounded-md border border-[var(--bd)] object-cover object-left"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[var(--tx)]">
                    {registeredUser.firstName} {registeredUser.lastName}
                  </div>
                  <div className="truncate text-[11px] text-[var(--tx3)]">{registeredUser.email}</div>
                </div>
                <span className="rounded-md border border-emerald-400 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-500">
                  {uploadedCount} Shots
                </span>
                <button type="button" onClick={() => setRegisteredFace(false)} className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-[var(--tx3)] hover:bg-[var(--bg2)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white">
                <Check className="h-4 w-4" />
              </span>
              Face registered - ready to detect in your clip.
            </div>
          </div>
        )}
      </div>

      <ConfidenceControl confidence={confidence} setConfidence={setConfidence} />

      {showGuide && (
        <div
          className="fixed inset-0 z-[1000] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--bd)] px-4 py-3">
              <h3 className="text-sm font-bold text-[var(--tx)]">How to take your face photos</h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-[var(--bd)] text-[var(--tx2)] hover:border-[var(--blue)] hover:text-[var(--blue)]"
                aria-label="Close face photo guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-white p-3">
              <img
                src={howToTakeFacePhotos}
                alt="How to take front, right and left face photos"
                className="mx-auto max-h-[72vh] w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <FaceCaptureWizard
        open={isWizardOpen}
        angles={['Front', 'Right', 'Left']}
        namePrefix={(form.firstName.trim() || 'demo-user').replace(/\s+/g, '')}
        initial={imageFiles}
        startAngle={activeCaptureAngle}
        initialMode={captureMode}
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleWizardComplete}
      />
    </section>
  );
}

function AttendanceLogPanel({ usersLogs, onDelete }) {
  const rows = useMemo(() => buildAttendanceRows(usersLogs), [usersLogs]);
  const [selected, setSelected] = useState(() => new Set());

  // Drop selections that no longer exist after an external refresh.
  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(rows.map((row) => row.id));
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rows]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleOne = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));

  const deleteIds = (ids) => {
    if (!ids.length) return;
    onDelete?.(ids);
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-[var(--tx)]">Attendance Log</h2>
          <span className="rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--tx3)]">
            Generated from your clip
          </span>
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => deleteIds([...selected])}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 text-[11px] font-bold text-red-500 transition-colors hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size} selected
            </button>
          )}
          <span className="text-[11px] text-[var(--tx3)]">
            {rows.length} registered · {rows.length} events
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-6 text-center text-xs text-[var(--tx3)]">
          No attendance events yet — process a clip to populate this log.
        </div>
      ) : (
        <div className="max-h-[360px] overflow-auto rounded-lg border border-[var(--bd)]">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--bg2)] text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--tx3)]">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--blue)]"
                    aria-label="Select all rows"
                  />
                </th>
                <th className="px-3 py-2">Snap</th>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Check-in</th>
                <th className="px-3 py-2">Check-out</th>
                <th className="px-3 py-2">Timestamp</th>
                <th className="w-12 px-3 py-2 text-right">Del</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = selected.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-[var(--bd)] align-top ${isSelected ? 'bg-[var(--blue)]/5' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(row.id)}
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--blue)]"
                        aria-label={`Select ${row.name}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <ExpandableSnap
                        src={row.photo ? dsVideoSrc(row.photo) : ''}
                        alt={row.name}
                        size="h-9 w-9"
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold text-[var(--tx)]">{row.name}</td>
                    <td className="px-3 py-2 text-[var(--tx2)]">{row.checkIn}</td>
                    <td className="px-3 py-2 text-[var(--tx2)]">{row.checkOut}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-[var(--tx)]">{row.timestamp}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => deleteIds([row.id])}
                        className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-red-500 transition-colors hover:bg-red-50"
                        aria-label={`Delete ${row.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// One Demo report per processed Face Recognition run. The demo attendance log
// accumulates every run's sessions into per-person documents, so a run's own
// events can't be fetched in isolation — instead we pull the full log once and
// slice its sessions into each run's time window [record.createdAt, nextRun).
function useDemoReports({ history, currentUsersLogs, minConfidence, currentClipName }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

  // Processed Face Recognition records, oldest -> newest so windows are easy to
  // bound; the list is reversed to newest-first before returning.
  const faceRecords = useMemo(
    () =>
      (Array.isArray(history) ? history : [])
        .filter(
          (record) =>
            record?.detections?.faceAuthenticationSettings &&
            (record?.videos || []).some((video) => video?.dsVideoUrl) &&
            record?.createdAt,
        )
        .slice()
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [history],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!faceRecords.length) {
        // No processed history — show the current session's log as one report.
        const rows = buildAttendanceRows(currentUsersLogs);
        if (!cancelled) {
          setReports(
            rows.length
              ? [{
                  id: 'current-session',
                  title: 'Face Recognition — Attendance Log',
                  detectionName: 'Face Recognition',
                  clipName: currentClipName || 'Demo clip',
                  minConfidence,
                  generatedAt: null,
                  rows,
                }]
              : [],
          );
        }
        return;
      }

      setLoading(true);
      // Span the earliest run's day to the latest run's day.
      const first = new Date(faceRecords[0].createdAt);
      const last = new Date(faceRecords[faceRecords.length - 1].createdAt);
      const data = await getDemoAttendanceLogs({
        limit: 500,
        isExport: false,
        removeUnknown: true,
        startDate: first.toISOString().slice(0, 10),
        endDate: last.toISOString().slice(0, 10),
      }).catch(() => null);

      const allSessions = buildSessionRows(data?.usersLogs || []);

      const built = faceRecords.map((record, index) => {
        const startMs = new Date(record.createdAt).getTime();
        // A run "owns" sessions from its createdAt until the next run started;
        // the last run keeps everything after it (+ a small grace so a session
        // logged a beat before the record row still lands in the right window).
        const nextMs = faceRecords[index + 1]
          ? new Date(faceRecords[index + 1].createdAt).getTime()
          : Infinity;
        const GRACE = 5 * 60 * 1000;
        const rows = allSessions.filter(
          (session) => session._at >= startMs - GRACE && session._at < nextMs - GRACE,
        );
        const video = firstVideoOf(record);
        return {
          id: recordIdOf(record) || `run-${index}`,
          title: 'Face Recognition — Attendance Log',
          detectionName: 'Face Recognition',
          clipName: video?.videoUrl?.split('/').pop() || currentClipName || 'Demo clip',
          minConfidence,
          generatedAt: record.createdAt,
          rows,
        };
      });

      if (!cancelled) {
        // Newest run first; keep runs even with zero matched sessions so the
        // list mirrors Recent Demos.
        setReports(built.reverse());
        setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [faceRecords, currentUsersLogs, minConfidence, currentClipName]);

  return { reports, loading };
}

function DemoReportsPanel({ usersLogs, clipName, minConfidence, history }) {
  const { reports, loading } = useDemoReports({
    history,
    currentUsersLogs: usersLogs,
    minConfidence,
    currentClipName: clipName,
  });
  const hasData = reports.some((report) => report.rows.length > 0);

  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="text-sm font-bold text-[var(--tx)]">Demo reports</div>
          {hasData && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-1.5 text-[11px] font-bold text-white">
              {reports.length}
            </span>
          )}
          <span className="truncate text-[11px] text-[var(--tx3)]">
            A separate attendance report for every processed Face Recognition demo.
          </span>
          {loading && <Loader className="h-3.5 w-3.5 animate-spin text-[var(--blue)]" />}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={!hasData}
            onClick={() => handleLiveDemoExportAll('excel', reports)}
            title="Export every demo report into one Excel file"
            className="inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-[9px] bg-gradient-to-br from-[#14b8a6] to-[#22c55e] px-[15px] text-xs font-semibold text-white shadow-[0_6px_16px_rgba(34,197,94,0.28)] transition-shadow hover:shadow-[0_8px_22px_rgba(34,197,94,0.45)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <Download className="h-3.5 w-3.5" />
            All · Excel
          </button>
          <button
            type="button"
            disabled={!hasData}
            onClick={() => handleLiveDemoExportAll('pdf', reports)}
            title="Export every demo report into one PDF file"
            className="inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-[9px] bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-[15px] text-xs font-semibold text-white shadow-[0_6px_16px_rgba(99,102,241,0.3)] transition-shadow hover:shadow-[0_8px_22px_rgba(124,92,255,0.45)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <Download className="h-3.5 w-3.5" />
            All · PDF
          </button>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-6 text-center text-xs text-[var(--tx3)]">
          {loading ? 'Loading reports…' : 'No reports yet — process a clip to generate one.'}
        </div>
      ) : (
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {reports.map((report) => {
            const events = report.rows.length;
            const meta = [
              report.generatedAt
                ? new Date(report.generatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                : 'This session',
              report.clipName,
              report.minConfidence != null ? `min conf ${report.minConfidence}%` : null,
            ]
              .filter(Boolean)
              .join('  ·  ');
            return (
            <div
              key={report.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-3"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--blue)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[var(--tx)]">{report.title}</div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--tx3)]">{meta}</div>
              </div>
              <span className="shrink-0 rounded-md border border-[var(--bd)] bg-[var(--bg1solid)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--tx3)]">
                {events} event{events === 1 ? '' : 's'}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={events === 0}
                  onClick={() => handleLiveDemoExport('excel', report)}
                  title="Export this report as Excel"
                  className="inline-flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(34,197,94,0.45)] px-3 text-[11.5px] font-semibold text-[var(--ok)] transition-colors hover:bg-[rgba(34,197,94,0.1)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-3 w-3" />
                  Excel
                </button>
                <button
                  type="button"
                  disabled={events === 0}
                  onClick={() => handleLiveDemoExport('pdf', report)}
                  title="Export this report as PDF"
                  className="inline-flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(59,130,246,0.4)] px-3 text-[11.5px] font-semibold text-[var(--blue)] transition-colors hover:bg-[rgba(59,130,246,0.1)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-3 w-3" />
                  PDF
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DemoHistoryPanel({ history, loading, activeRecordId, onSelect }) {
  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-bold text-[var(--tx)]">Recent Demos</div>
        <div className="mt-1 text-[11px] text-[var(--tx3)]">Demos you've run before, most recent first. Click one to load it.</div>
      </div>

      {loading ? (
        <div className="grid h-20 place-items-center text-[var(--tx3)]">
          <Loader className="h-4 w-4 animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-4 text-center text-xs text-[var(--tx3)]">
          No processed demos yet.
        </div>
      ) : (
        <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
          {history.map((record) => {
            const id = recordIdOf(record);
            const settingType = Object.entries(record?.detections || {}).find(([, enabled]) => enabled)?.[0];
            const name = detections.find((item) => item.settingType === settingType)?.name || 'Live Demo';
            const ranAt = record?.createdAt ? new Date(record.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
            const ready = (record?.videos || []).some((video) => video?.dsVideoUrl);
            const isActive = id === activeRecordId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(record)}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                  isActive ? 'border-[var(--blue)] bg-[var(--bg2)]' : 'border-[var(--bd)] hover:border-[var(--bd2)] hover:bg-[var(--bg2)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-[var(--tx)]">{name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--tx3)]">{ranAt}</div>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                    ready ? 'border border-emerald-400 text-emerald-500' : 'border border-orange-300 text-orange-500'
                  }`}
                >
                  {ready ? 'Processed' : 'Pending'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function LiveDemo({ active = true }) {
  const [selectedDetection, setSelectedDetection] = useState('Face Recognition');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showList, setShowList] = useState(true);
  const [search, setSearch] = useState('');
  const [confidence, setConfidence] = useState(82);
  const [clipFile, setClipFile] = useState(null);
  const [clipPreviewUrl, setClipPreviewUrl] = useState('');
  const [uploadedVideoPath, setUploadedVideoPath] = useState('');
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState('');
  const [videoRecord, setVideoRecord] = useState(null);
  const [recordVideos, setRecordVideos] = useState([]);
  const [sessionAnalytics, setSessionAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [processJob, setProcessJob] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(null);
  const [demoIncidents, setDemoIncidents] = useState({ items: [], totalCount: 0 });
  const [demoIncidentsLoading, setDemoIncidentsLoading] = useState(false);
  const [demoAttendanceLogs, setDemoAttendanceLogs] = useState(null);
  const [clipStatus, setClipStatus] = useState('idle');
  const [clipProgress, setClipProgress] = useState(0);
  const clipInputRef = useRef(null);
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
  const [videoRect, setVideoRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [drawing, setDrawing] = useState(false);
  const [maxPoints, setMaxPoints] = useState(4);
  const [points, setPoints] = useState([]);
  const [draftZones, setDraftZones] = useState([]);
  const [savedZones, setSavedZones] = useState([]);
  const pointsRef = useRef([]);
  const draftZonesRef = useRef([]);
  const savedZonesRef = useRef([]);
  const [isClipFullscreen, setIsClipFullscreen] = useState(false);
  const [showDrawingActions, setShowDrawingActions] = useState(false);
  const [savingArea, setSavingArea] = useState(false);
  const [showSaveAreaModal, setShowSaveAreaModal] = useState(false);
  const [zoneSettings, setZoneSettings] = useState([]);
  // Zone names shown on the video overlay — set only from a confirmed save
  // response, never from live edits in the Zone Settings panel, so the label
  // on screen never gets ahead of what the server actually has.
  const [confirmedZoneNames, setConfirmedZoneNames] = useState([]);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null);
  const [zoneActionBusy, setZoneActionBusy] = useState(false);
  // Which settingType the in-flight /process job was submitted for — read by
  // the socket handler instead of the live `selected` detection, since the
  // user could switch detections while a job is still processing.
  const processingSettingTypeRef = useRef('');
  // Absolute timestamp (ms) after which an in-flight processing job is treated
  // as timed out — estimated_completion_seconds + 20%. Set once the /process
  // call returns (never during upload); cleared on finish, error, or reset.
  const processingDeadlineRef = useRef(null);

  const { socket } = useSocket();
  const { user } = useAuth();
  const [matchedAlerts, setMatchedAlerts] = useState([]);
  const [demoHistory, setDemoHistory] = useState([]);
  const [demoHistoryLoading, setDemoHistoryLoading] = useState(false);

  const selected = detections.find((item) => item.name === selectedDetection) || detections[0];
  const selectedConfig = detectionConfigs[selectedDetection];
  // Line Crossing draws a single straight tripwire, not a closed area: clicks 1
  // and 2 are the line endpoints and click 3 is the inside reference point that
  // tells DS which side counts as "in". Mirrors DetectionZoneMarking.jsx's
  // isLineCrossing branch so both editors save the same shape.
  const isLineCrossing = selected?.settingType === 'lineCrossingSettings';
  const zoneNoun = isLineCrossing ? 'Line' : 'Zone';
  const effectiveMaxPoints = isLineCrossing ? 3 : maxPoints;
  const configurationAvailable = selectedDetection === 'Face Recognition' || selectedConfig;
  const isClipBusy = clipStatus === 'uploading' || clipStatus === 'processing' || clipStatus === 'awaiting-ds';
  const currentVideoId = firstVideoOf(videoRecord)?._id || firstVideoOf(videoRecord)?.id || '';
  const processedVideo = recordVideos.find((video) => video?.dsVideoUrl)?.dsVideoUrl;
  const playerVideoUrl = processedVideo
    ? dsVideoSrc(processedVideo)
    : mediaSrc(clipPreviewUrl || uploadedVideoUrl || uploadedVideoPath);
  const statusLabel = clipStatus === 'uploading'
    ? `Uploading - ${clipProgress}%`
    : clipStatus === 'processing'
      ? `Processing - ${clipProgress}%`
      : clipStatus === 'awaiting-ds'
        ? secondsRemaining != null
          ? `Analyzing your clip - about ${secondsRemaining}s remaining`
          : 'Analyzing your clip - this can take a moment'
      : clipStatus === 'ready'
        ? 'Processed'
        : clipStatus === 'uploaded'
          ? 'Uploaded - ready to process'
        : 'Waiting for clip';
  const filteredDetections = useMemo(() => {
    const query = search.trim().toLowerCase();
    return detections.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (query && !`${item.name} ${item.subtitle}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [activeCategory, search]);

  useEffect(() => {
    let cancelled = false;
    const settingType = analyticsSettingType(selected.settingType);

    setAnalyticsLoading(true);
    getLiveDemoAnalytics({ detectionTypes: settingType ? [settingType] : undefined })
      .then((analyticsData) => {
        if (!cancelled) setSessionAnalytics(analyticsData || null);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load live demo detection analytics', error);
          toast.error('Failed to load detection analytics', COMPACT_TOAST);
        }
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });

    return () => { cancelled = true; };
  }, [selected.settingType]);

  useEffect(() => {
    return () => {
      if (clipPreviewUrl) URL.revokeObjectURL(clipPreviewUrl);
    };
  }, [clipPreviewUrl]);

  useEffect(() => {
    const syncFullscreen = () => setIsClipFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useEffect(() => {
    if (!isClipFullscreen) setShowDrawingActions(false);
  }, [isClipFullscreen]);

  useEffect(() => {
    if (!active) videoRef.current?.pause();
  }, [active]);

  // Loads one Live Demo record into every component on the page: video player,
  // zones, session analytics, and (scoped to that record's video) the matched
  // alerts / attendance log / incidents panels. Shared by the mount-restore
  // effect below and by clicking a row in the Recent Demos history list —
  // both cases are "make this record the active demo", they just start from
  // a different source (sessionStorage vs. a list click).
  const loadDemoRecord = async (recordId, { fallbackRecord = null, fallbackStatus, fallbackVideos } = {}) => {
    const [{ records }, videosData] = await Promise.all([
      getVideoRecords({ id: recordId, limit: 1 }),
      getVideoRecordVideos(recordId),
    ]);

    const record = records?.[0] || fallbackRecord;
    const serverVideos = videosData?.videos || record?.videos || [];
    const latestSaved = readLiveDemoSession();
    const videos = serverVideos.some((video) => video?.dsVideoUrl)
      ? serverVideos
      : fallbackVideos?.some((video) => video?.dsVideoUrl)
        ? fallbackVideos
        : latestSaved?.videos?.some((video) => video?.dsVideoUrl)
          ? latestSaved.videos
          : serverVideos;
    const ready = videos.some((video) => video?.dsVideoUrl);
    const video = firstVideoOf(videos);
    // A not-yet-processed ("pending") record must never show the processing
    // loader on load. Only keep waiting when the caller is restoring an
    // in-flight session from this same tab (fallbackStatus === 'awaiting-ds').
    // Otherwise fall back to the user's original clip if we have its URL, else
    // the upload state.
    const hasOriginalVideo = Boolean(video?.videoUrl || latestSaved?.uploadedVideoPath);
    const nextStatus = ready
      ? 'ready'
      : fallbackStatus === 'awaiting-ds'
        ? 'awaiting-ds'
        : hasOriginalVideo
          ? 'uploaded'
          : 'idle';
    const restoredZones = Array.isArray(video?.zones)
      ? video.zones.map((zone) => zone.map(([x, y]) => ({ x, y })))
      : [];
    const restoredConfigs = Array.isArray(video?.zone_configs)
      ? video.zone_configs.map((config, index) => ({
          name: config.name || `${isLineCrossing ? 'Line' : 'Zone'} ${index + 1}`,
          capacity: config.capacity ?? '',
          threshold: config.threshold_sec ?? '',
          countMode: config.count_mode === 'all' ? 'both' : config.count_mode || 'entry',
        }))
      : [];
    const settingType = Object.entries(record?.detections || {}).find(([, enabled]) => enabled)?.[0];
    const videoId = video?._id || video?.id;

    setVideoRecord(record);
    setRecordVideos(videos);
    setClipStatus(nextStatus);
    setClipProgress(ready || nextStatus === 'uploaded' ? 100 : 75);
    savedZonesRef.current = restoredZones;
    setSavedZones(restoredZones);
    setZoneSettings(syncZoneSettings(restoredConfigs, restoredZones.length, isLineCrossing ? 'Line' : 'Zone'));
    setConfirmedZoneNames(restoredConfigs.map((config, index) => config.name || `${isLineCrossing ? 'Line' : 'Zone'} ${index + 1}`));
    if (settingType) processingSettingTypeRef.current = settingType;
    updateLiveDemoSession({
      adminId: user?.adminId,
      recordId,
      videoRecord: record,
      videos,
      status: nextStatus,
      settingType,
      uploadedVideoPath: video?.videoUrl || readLiveDemoSession()?.uploadedVideoPath || '',
    });

    // Rebuild the event panels the same way handleVideoRecordUpdated does after
    // a fresh process — derived analytics (populated as soon as events land, not
    // the DS-pushed sessionAnalytics counters which stay zero), plus incidents
    // and the attendance log. Attendance/incidents are scoped to this record's
    // video where possible, but fall back to the admin-wide demo data so a
    // reloaded / re-opened run never shows empty panels.
    const isFaceRecognition = settingType === 'faceAuthenticationSettings';
    const [analyticsData, incidentsData, attendanceScoped] = await Promise.all([
      getLiveDemoAnalytics({
        detectionTypes: settingType ? [analyticsSettingType(settingType)] : undefined,
      }).catch(() => null),
      videoId
        ? getDemoIncidents({ limit: 50, videoId, ...(settingType ? { incidentTypeFilter: [settingType] } : {}) }).catch(() => null)
        : Promise.resolve(null),
      isFaceRecognition && videoId
        ? getDemoAttendanceLogs({ limit: 10, isExport: false, removeUnknown: true, videoId }).catch(() => null)
        : Promise.resolve(null),
    ]);

    setSessionAnalytics(analyticsData || null);

    let attendanceData = attendanceScoped;
    if (isFaceRecognition && !(attendanceScoped?.usersLogs?.length)) {
      attendanceData = await getDemoAttendanceLogs({ limit: 10, isExport: false, removeUnknown: true }).catch(() => attendanceScoped);
    }
    let resolvedIncidents = incidentsData;
    if (!isFaceRecognition && !(resolvedIncidents?.items?.length)) {
      resolvedIncidents = await getDemoIncidents({
        limit: 50,
        ...(settingType ? { incidentTypeFilter: [settingType] } : {}),
      }).catch(() => resolvedIncidents);
    }
    setDemoIncidents(resolvedIncidents || { items: [], totalCount: 0 });
    setDemoAttendanceLogs(attendanceData);
    // Matched Alerts is a live socket feed (accessLogs_${adminId}), not a
    // fetch — for a re-opened past run it seeds from the attendance sessions so
    // the panel isn't empty, then live matches append on top.
    setMatchedAlerts(alertsFromAttendance(attendanceData));

    return record;
  };

  // Route changes unmount this page. Restore the active record from the small
  // session snapshot, then ask the server whether DS finished while we were away.
  useEffect(() => {
    const saved = readLiveDemoSession();
    if (!user?.adminId || !saved) return;
    // Only reject a snapshot that was explicitly stamped for a different admin;
    // older snapshots without an adminId are still ours to restore.
    if (saved.adminId && String(saved.adminId) !== String(user.adminId)) {
      clearLiveDemoSession();
      return;
    }

    const recordId = saved.recordId || recordIdOf(saved.videoRecord);
    if (!recordId || !saved.uploadedVideoPath) {
      clearLiveDemoSession();
      return;
    }
    updateLiveDemoSession({ adminId: user.adminId });

    let cancelled = false;
    const restoredDetection = detections.find((item) => item.settingType === saved.settingType)?.name
      || saved.selectedDetection
      || 'Face Recognition';
    // Landing on the page never resumes the processing loader for a pending
    // demo — show the original uploaded clip if we have it, otherwise the
    // upload state. loadDemoRecord flips to 'ready' if DS has since finished,
    // and the videoRecord_updated socket event covers a job that finishes
    // while the page is open.
    const restoredStatus = saved.status === 'ready'
      ? 'ready'
      : saved.uploadedVideoPath
        ? 'uploaded'
        : 'idle';

    setSelectedDetection(restoredDetection);
    processingSettingTypeRef.current = saved.settingType || '';
    setClipFile({ name: saved.clipName || 'Demo clip', size: saved.clipSize || 0 });
    setUploadedVideoPath(saved.uploadedVideoPath);
    setUploadedVideoUrl(saved.uploadedVideoUrl || '');
    setVideoRecord(saved.videoRecord || null);
    setRecordVideos(saved.videos || saved.videoRecord?.videos || []);
    setMatchedAlerts(Array.isArray(saved.matchedAlerts) ? saved.matchedAlerts : []);
    setClipStatus(restoredStatus);
    setClipProgress(restoredStatus === 'ready' || restoredStatus === 'uploaded' ? 100 : 0);

    loadDemoRecord(recordId, { fallbackRecord: saved.videoRecord, fallbackStatus: restoredStatus, fallbackVideos: saved.videos })
      .catch((error) => { if (!cancelled) console.error('Failed to restore active live demo', error); });

    return () => { cancelled = true; };
  }, [user?.adminId]);

  // Recent Demos history list — every record this admin has run, newest
  // first. GET /video-records already sorts { createdAt: -1 } and scopes to
  // the session admin, so this is a straight list call with no client sort.
  const loadDemoHistory = async () => {
    setDemoHistoryLoading(true);
    try {
      const { records } = await getVideoRecords({ limit: 20 });
      // Only completed runs belong here — a record whose videos all have a null
      // dsVideoUrl hasn't come back from DS yet, so there's nothing to load if
      // it were clicked. Same dsVideoUrl test the "Processed" badge uses.
      const processed = (Array.isArray(records) ? records : []).filter((record) =>
        (record?.videos || []).some((video) => video?.dsVideoUrl)
      );
      setDemoHistory(processed);
    } catch (error) {
      console.error('Failed to load live demo history', error);
    } finally {
      setDemoHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.adminId) return;
    loadDemoHistory();
  }, [user?.adminId]);

  // First paint, no in-progress session to restore: if the default detection
  // (Face Recognition) already has a past run, open it instead of the empty
  // upload state — same "click a tile with history" behavior as
  // handleSelectDetection, just for the tile that's selected before any click.
  useEffect(() => {
    if (demoHistoryLoading || recordIdOf(videoRecord) || readLiveDemoSession()) return;
    const item = detections.find((d) => d.name === selectedDetection);
    const pastRecord = demoHistory.find((record) => record?.detections?.[item?.settingType]);
    if (pastRecord) openDemoRecord(pastRecord).catch((error) => console.error('Failed to open last demo on load', error));
    // Only run once history first finishes loading, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoHistoryLoading]);

  // Loads a past record's clip/zones/results into the player and panels
  // without touching selectedDetection — callers that already know (or are
  // about to set) the detection name do that themselves.
  const openDemoRecord = async (record) => {
    const recordId = recordIdOf(record);
    if (!recordId || recordId === recordIdOf(videoRecord)) return;
    const video = firstVideoOf(record);
    setClipFile({ name: 'Demo clip', size: 0 });
    setUploadedVideoPath(video?.videoUrl || '');
    setUploadedVideoUrl('');
    await loadDemoRecord(recordId, { fallbackRecord: record });
  };

  const handleSelectDemoHistory = async (record) => {
    try {
      const restoredDetection = Object.entries(record?.detections || {}).find(([, enabled]) => enabled)?.[0];
      const detectionName = detections.find((item) => item.settingType === restoredDetection)?.name || 'Face Recognition';
      setSelectedDetection(detectionName);
      await openDemoRecord(record);
    } catch (error) {
      console.error('Failed to load selected live demo', error);
      toast.error('Failed to load this demo', COMPACT_TOAST);
    }
  };

  // Picking a detection tile: if this admin already ran that detection before,
  // load its most recent demo (video, zones, incidents, attendance) instead of
  // showing the empty upload state. Newest-first, same order as demoHistory.
  const handleSelectDetection = async (item) => {
    setSelectedDetection(item.name);
    if (item.name === selectedDetection) return;

    const pastRecord = demoHistory.find((record) => record?.detections?.[item.settingType]);
    try {
      if (pastRecord) {
        await openDemoRecord(pastRecord);
      } else {
        await resetClipState();
        setSelectedDetection(item.name);
      }
    } catch (error) {
      console.error('Failed to load last demo for detection', error);
      toast.error('Failed to load the last demo for this detection', COMPACT_TOAST);
    }
  };

  // The DS/video-process pipeline runs after the /process call returns and
  // attaches the finished clip asynchronously via this per-record socket
  // event — the processing loader stays up until it arrives.
  useEffect(() => {
    const recordId = recordIdOf(videoRecord);
    if (!socket || !recordId) return;

    const eventName = `videoRecord_updated_${recordId}`;
    const handleVideoRecordUpdated = async (payload) => {
      const videos = Array.isArray(payload?.videos) ? payload.videos : [];
      setRecordVideos(videos);
      if (!videos.some((video) => video?.dsVideoUrl)) return;

      setClipProgress(100);
      setClipStatus('ready');
      if (processingSettingTypeRef.current !== 'faceAuthenticationSettings') setDemoIncidentsLoading(true);
      setSecondsRemaining(null);
      processingDeadlineRef.current = null;
      updateLiveDemoSession({
        videoRecord: { ...videoRecord, videos },
        videos,
        status: 'ready',
      });
      toast.success('Demo clip processed', COMPACT_TOAST);
      loadDemoHistory();

      // Now that processing is actually finished, pull the real numbers —
      // attendance log only applies to Face Recognition's detector.
      try {
        const isFaceRecognition = processingSettingTypeRef.current === 'faceAuthenticationSettings';
        // Incidents are also fetched when processing is kicked off, but DS
        // hasn't emitted any events by then -- this is the refetch that
        // actually fills the Event Log.
        const settingType = processingSettingTypeRef.current;
        const [analyticsData, attendanceData, incidentsData] = await Promise.all([
          getLiveDemoAnalytics({ detectionTypes: [analyticsSettingType(settingType)] }),
          isFaceRecognition ? getDemoAttendanceLogs({ limit: 10, isExport: false, removeUnknown: true }) : Promise.resolve(null),
          isFaceRecognition
            ? Promise.resolve(null)
            : getDemoIncidents({
                limit: 50,
                ...(currentVideoId ? { videoId: currentVideoId } : {}),
                ...(settingType ? { incidentTypeFilter: [settingType] } : {}),
              }).catch(() => null),
        ]);
        setSessionAnalytics(analyticsData || null);
        if (isFaceRecognition) setDemoAttendanceLogs(attendanceData);
        if (!isFaceRecognition) {
          // DS doesn't always stamp events with our videoId, so a scoped query
          // can come back empty for a clip that did produce events. Fall back to
          // the admin-wide demo feed rather than showing an empty log.
          let resolved = incidentsData;
          if (!resolved?.items?.length) {
            resolved = await getDemoIncidents({
              limit: 50,
              ...(settingType ? { incidentTypeFilter: [settingType] } : {}),
            }).catch(() => resolved);
          }
          setDemoIncidents(resolved || { items: [], totalCount: 0 });
          setDemoIncidentsLoading(false);
        }
      } catch (error) {
        console.error('Failed to refresh live demo results after processing', error);
        setDemoIncidentsLoading(false);
      }
    };

    socket.on(eventName, handleVideoRecordUpdated);
    return () => socket.off(eventName, handleVideoRecordUpdated);
  }, [socket, videoRecord]);

  // Face-match alerts (same accessLogs_${adminId} channel the real app uses —
  // there's no Live Demo-specific event yet). Unrecognized/"Unknown" matches
  // are dropped; only named matches are worth showing here.
  useEffect(() => {
    if (!socket || !user?.adminId || !currentVideoId) return;

    const eventName = `accessLogs_${user.adminId}`;
    const handleAccessLogMatch = (data) => {
      if (data?.liveDemoData !== true || String(data?.videoId || '') !== String(currentVideoId)) return;
      const name = String(data?.personName || '').trim();
      if (!name || name.toLowerCase() === 'unknown') return;
      setMatchedAlerts((current) => {
        const next = [{ ...data, key: `${data?.userId || name}-${data?.timestamp || Date.now()}` }, ...current].slice(0, 20);
        updateLiveDemoSession({ matchedAlerts: next });
        return next;
      });
    };

    socket.on(eventName, handleAccessLogMatch);
    return () => socket.off(eventName, handleAccessLogMatch);
  }, [socket, user?.adminId, currentVideoId]);

  // Ticks the estimate down toward 0 while waiting — a guide for the user,
  // not a guarantee; the socket event above is what actually ends the wait.
  useEffect(() => {
    if (clipStatus !== 'awaiting-ds' || secondsRemaining == null) return;
    if (secondsRemaining <= 0) return;
    const timer = setTimeout(() => setSecondsRemaining((value) => (value != null ? value - 1 : value)), 1000);
    return () => clearTimeout(timer);
  }, [clipStatus, secondsRemaining]);

  // Safety net: once processing has been submitted, if it runs past
  // estimated_completion_seconds + 20% with no completion socket event, stop
  // waiting and surface a timeout. Only active after /process returns
  // (processing / awaiting-ds) — never during upload.
  useEffect(() => {
    const waiting = clipStatus === 'processing' || clipStatus === 'awaiting-ds';
    if (!waiting || processingDeadlineRef.current == null) return;
    const stopProcessing = () => {
      processingDeadlineRef.current = null;
      setSecondsRemaining(null);
      setClipStatus('error');
      updateLiveDemoSession({ status: 'error' });
      toast.error('Video processing timed out — please try again', COMPACT_TOAST);
    };
    const msLeft = processingDeadlineRef.current - Date.now();
    if (msLeft <= 0) {
      stopProcessing();
      return;
    }
    const timer = setTimeout(stopProcessing, msLeft);
    return () => clearTimeout(timer);
  }, [clipStatus, secondsRemaining]);

  useEffect(() => {
    const timers = [];
    const updateVideoRect = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setVideoRect(containRect(rect.width, rect.height, videoSize.w || 1000, videoSize.h || 562));
    };
    // rAF catches the first paint; the timeouts re-measure after the browser
    // fullscreen transition settles (the stage only reaches its final
    // h-screen/w-screen size a frame or two later, which is why the drawing
    // overlay was mis-sized in fullscreen).
    timers.push(requestAnimationFrame(updateVideoRect));
    [60, 160, 320].forEach((delay) => timers.push(setTimeout(updateVideoRect, delay)));
    window.addEventListener('resize', updateVideoRect);
    document.addEventListener('fullscreenchange', updateVideoRect);
    return () => {
      cancelAnimationFrame(timers[0]);
      timers.slice(1).forEach(clearTimeout);
      window.removeEventListener('resize', updateVideoRect);
      document.removeEventListener('fullscreenchange', updateVideoRect);
    };
  }, [playerVideoUrl, videoSize, isClipFullscreen]);

  // Demo attendance rows have no delete endpoint — they regenerate on the next
  // process — so removal here just prunes the locally-held list.
  const handleDeleteAttendanceRows = (ids) => {
    const drop = new Set(ids);
    setDemoAttendanceLogs((current) => {
      if (!current?.usersLogs?.length) return current;
      const usersLogs = current.usersLogs.filter((log, index) => {
        const id = log.logId || log._id || log.userId || `row-${index}`;
        return !drop.has(id);
      });
      return { ...current, usersLogs };
    });
  };

  const resetClipState = async ({ deleteRemote = false } = {}) => {
    if (deleteRemote && uploadedVideoPath) {
      try {
        await deleteDemoMedia(uploadedVideoPath);
      } catch (error) {
        console.error('Failed to remove demo clip', error);
      }
    }
    if (clipPreviewUrl) URL.revokeObjectURL(clipPreviewUrl);
    setClipFile(null);
    setClipPreviewUrl('');
    setUploadedVideoPath('');
    setUploadedVideoUrl('');
    setVideoRecord(null);
    setRecordVideos([]);
    setSessionAnalytics(null);
    setProcessJob(null);
    setSecondsRemaining(null);
    processingDeadlineRef.current = null;
    setDemoIncidents({ items: [], totalCount: 0 });
    setDemoAttendanceLogs(null);
    setMatchedAlerts([]);
    setClipStatus('idle');
    setClipProgress(0);
    setDrawing(false);
    setShowDrawingActions(false);
    setShowSaveAreaModal(false);
    pointsRef.current = [];
    draftZonesRef.current = [];
    savedZonesRef.current = [];
    setPoints([]);
    setDraftZones([]);
    setSavedZones([]);
    setZoneSettings([]);
    clearLiveDemoSession();
  };

  const handleVideoMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoSize({
      w: video.videoWidth || 1000,
      h: video.videoHeight || 562,
    });
  };

  const drawingPoint = (event) => {
    const targetBox = event.currentTarget.getBoundingClientRect();
    if (!targetBox.width || !targetBox.height) return null;
    const w = videoSize.w || 1000;
    const h = videoSize.h || 562;
    const xInVideo = event.clientX - targetBox.left;
    const yInVideo = event.clientY - targetBox.top;
    if (xInVideo < 0 || yInVideo < 0 || xInVideo > targetBox.width || yInVideo > targetBox.height) return null;
    return {
      x: Math.round((xInVideo / targetBox.width) * w),
      y: Math.round((yInVideo / targetBox.height) * h),
    };
  };

  // Map a pointer position to video-space coordinates against the visible video
  // box (videoRect), clamped inside it. Used by the corner-drag handles.
  const pointerToVideoSpace = (event) => {
    const stage = stageRef.current;
    if (!stage || !videoRect.width || !videoRect.height) return null;
    const stageBox = stage.getBoundingClientRect();
    const w = videoSize.w || 1000;
    const h = videoSize.h || 562;
    const relX = event.clientX - stageBox.left - videoRect.left;
    const relY = event.clientY - stageBox.top - videoRect.top;
    const clampedX = Math.min(Math.max(relX, 0), videoRect.width);
    const clampedY = Math.min(Math.max(relY, 0), videoRect.height);
    return {
      x: Math.round((clampedX / videoRect.width) * w),
      y: Math.round((clampedY / videoRect.height) * h),
    };
  };

  // Drag a single corner of the in-progress polygon (`points`) — the zone drawn
  // via Start Drawing / Min Area / Max Area, before it is saved. Works with a
  // full polygon, so users can reshape after placing all points.
  const handlePointDragStart = (pointIndex) => (event) => {
    if (drawing) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const move = (moveEvent) => {
      const next = pointerToVideoSpace(moveEvent);
      if (!next) return;
      const updated = pointsRef.current.map((point, index) => (index === pointIndex ? next : point));
      pointsRef.current = updated;
      setPoints(updated);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleDrawingClick = (event) => {
    if (!drawing || !playerVideoUrl) return;
    event.preventDefault();
    event.stopPropagation();
    const nextPoint = drawingPoint(event);
    if (!nextPoint) return;
    // Read/derive everything from the current ref (not the setPoints updater)
    // so this handler stays a plain event handler with no in-updater side
    // effects — React 18 StrictMode double-invokes updater functions in dev,
    // which was pushing a completed zone into draftZonesRef twice per click.
    const current = pointsRef.current;
    if (current.length >= effectiveMaxPoints) return;
    const updated = [...current, nextPoint];

    // A line stays in `points` until the user saves it — unlike a polygon it
    // must not auto-commit on the 3rd click, because that 3rd click is the
    // reference point rather than the close of a shape.
    if (isLineCrossing) {
      pointsRef.current = updated;
      setPoints(updated);
      return;
    }

    if (updated.length >= effectiveMaxPoints) {
      const nextDraftZones = [...draftZonesRef.current, updated];
      draftZonesRef.current = nextDraftZones;
      pointsRef.current = [];
      setDraftZones(nextDraftZones);
      setZoneSettings((prev) => syncZoneSettings(prev, savedZonesRef.current.length + nextDraftZones.length, zoneNoun));
      setPoints([]);
      return;
    }

    pointsRef.current = updated;
    setPoints(updated);
  };

  const handleMaxArea = () => {
    const w = videoSize.w || 1000;
    const h = videoSize.h || 562;
    const nextPoints = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
    setDrawing(false);
  };

  const handleMinArea = () => {
    const w = videoSize.w || 1000;
    const h = videoSize.h || 562;
    const nextPoints = [
      { x: Math.round(w * 0.28), y: Math.round(h * 0.28) },
      { x: Math.round(w * 0.72), y: Math.round(h * 0.28) },
      { x: Math.round(w * 0.72), y: Math.round(h * 0.72) },
      { x: Math.round(w * 0.28), y: Math.round(h * 0.72) },
    ];
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
    setDrawing(false);
  };

  const buildPendingZones = () => {
    const latestPoints = pointsRef.current;
    const latestDraftZones = draftZonesRef.current;
    const latestSavedZones = savedZonesRef.current;
    return latestPoints.length >= 3 ? [...latestSavedZones, ...latestDraftZones, latestPoints] : [...latestSavedZones, ...latestDraftZones];  // 3 pts = polygon, or line + ref point
  };

  // Zones drawn since the last save — draft zones plus the in-progress one,
  // excluding anything already saved on the server (that's savedZones).
  const buildNewZones = () => {
    const latestPoints = pointsRef.current;
    const latestDraftZones = draftZonesRef.current;
    const built = latestPoints.length >= 3 ? [...latestDraftZones, latestPoints] : [...latestDraftZones];
    // Re-saving an already-saved tripwire (to change its Mode or name) leaves
    // nothing in points/draftZones, so fall back to the saved line rather than
    // rejecting the save. Line Crossing only ever has one line.
    if (!built.length && isLineCrossing && savedZonesRef.current.length) {
      return [savedZonesRef.current[0]];
    }
    return built;
  };

  const pendingZones = buildPendingZones();
  const newZones = buildNewZones();
  const visibleZoneSettings = syncZoneSettings(zoneSettings, pendingZones.length, zoneNoun);
  const savedZoneSettings = syncZoneSettings(zoneSettings, savedZones.length, zoneNoun);
  // Re-saving a tripwire edits the existing line, so the modal must open on the
  // saved line's own name/Mode and number it "Line 1" -- not offset past it.
  const isLineResaveUI = isLineCrossing && savedZones.length > 0 && newZones.length > 0 && draftZones.length === 0 && points.length === 0;
  const newZoneSettings = isLineResaveUI
    ? savedZoneSettings.slice(0, 1)
    : visibleZoneSettings.slice(savedZones.length);
  const saveModalZoneOffset = isLineResaveUI ? 0 : savedZones.length;

  const handleZoneSettingChange = (index, field, value) => {
    setZoneSettings((current) => {
      const updated = syncZoneSettings(current, pendingZones.length, zoneNoun);
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Shared by delete-zone / clear-all / zone-settings-save: pushes the given
  // zones + configs to the server (update the existing record if we have one,
  // otherwise create it), then re-fetches so the screen only ever shows what
  // the server actually confirms is stored — never a local guess.
  const persistZones = async ({ zones, zoneConfigs, detectionName, severity = 'moderate' }) => {
    const detectionKey = selected.name === 'Zone Intrusion Detection'
      ? 'zoneIntrusionSettings'
      : selected.settingType;
    const extraFields = ZONE_EXTRA_FIELDS[selected.settingType] || [];
    // A tripwire is stored as its 2 endpoints; the 3rd drawn point is the
    // inside reference point, sent alongside as inside_reference_point /
    // count_mode — the same field names DetectionZoneMarking.jsx persists.
    const zonesPayload = zones.map((zone) =>
      (isLineCrossing ? zone.slice(0, 2) : zone).map((point) => [point.x, point.y])
    );
    const insideReferencePoint = isLineCrossing && zones[0]?.[2]
      ? [Number(zones[0][2].x), Number(zones[0][2].y)]
      : null;
    const lineExtras = isLineCrossing
      ? {
          ...(insideReferencePoint ? { inside_reference_point: insideReferencePoint } : {}),
          count_mode: (() => {
            const mode = zoneConfigs?.[0]?.countMode || 'entry';
            return mode === 'both' ? 'all' : mode;
          })(),
          videoResolution: [videoSize.w, videoSize.h],
        }
      : {};
    const zoneConfigsPayload = zonesPayload.map((_, index) => {
      const zone = zoneConfigs[index] || {};
      return {
        name: zone.name || `${isLineCrossing ? 'Line' : 'Zone'} ${index + 1}`,
        detection_name: detectionName || selected.name,
        levelOfImportance: zone.severity || severity,
        ...(extraFields.includes('capacity') && String(zone.capacity ?? '').trim() !== ''
          ? { capacity: valueForPayload(zone.capacity) }
          : {}),
        ...(extraFields.includes('threshold') && String(zone.threshold ?? '').trim() !== ''
          ? { threshold_sec: valueForPayload(zone.threshold) }
          : {}),
        camera_type: 'hikvision',
      };
    });

    const existingRecordId = recordIdOf(videoRecord);
    const existingVideoId = firstVideoOf(videoRecord)?._id;

    let record;
    if (existingRecordId && existingVideoId) {
      record = await updateVideoRecord(existingRecordId, {
        videoId: existingVideoId,
        zones: zonesPayload,
        zone_configs: zoneConfigsPayload,
        ...lineExtras,
      });
    } else {
      record = await createVideoRecord({
        videos: [{ videoUrl: uploadedVideoPath, zones: zonesPayload, zone_configs: zoneConfigsPayload, ...lineExtras }],
        detections: { [detectionKey]: true },
      });
    }
    setVideoRecord(record);

    const recordId = recordIdOf(record);
    const videosData = recordId ? await getVideoRecordVideos(recordId) : null;
    const savedVideo = firstVideoOf(videosData) || firstVideoOf(record);
    // The server echoes a tripwire back as its 2 endpoints only, so re-attach
    // the reference point locally — otherwise it vanishes from the overlay the
    // moment the line is saved.
    const confirmedZones = Array.isArray(savedVideo?.zones)
      ? savedVideo.zones.map((zone, index) => {
          const echoed = zone.map(([x, y]) => ({ x, y }));
          const refPoint = isLineCrossing ? zones[index]?.[2] : null;
          return refPoint ? [...echoed.slice(0, 2), refPoint] : echoed;
        })
      : zones;
    const confirmedConfigs = Array.isArray(savedVideo?.zone_configs)
      ? savedVideo.zone_configs.map((config, index) => ({
          name: config.name || `Zone ${index + 1}`,
          capacity: config.capacity ?? '',
          threshold: config.threshold_sec ?? '',
        }))
      : zoneConfigs;

    savedZonesRef.current = confirmedZones;
    pointsRef.current = [];
    draftZonesRef.current = [];
    setSavedZones(confirmedZones);
    setDraftZones([]);
    setPoints([]);
    setZoneSettings(syncZoneSettings(confirmedConfigs, confirmedZones.length, zoneNoun));
    setConfirmedZoneNames(confirmedConfigs.map((config, index) => config.name || `Zone ${index + 1}`));
    setDrawing(false);
  };

  const handleDeleteZone = (index) => {
    // Zone Settings only ever lists saved zones, so any delete here targets
    // something already on the server — confirm before touching it.
    if (index < savedZonesRef.current.length) {
      setConfirmDeleteIndex(index);
      return;
    }

    const savedCount = savedZonesRef.current.length;
    const draftCount = draftZonesRef.current.length;
    if (index < savedCount + draftCount) {
      const draftIndex = index - savedCount;
      const nextDraft = draftZonesRef.current.filter((_, zoneIndex) => zoneIndex !== draftIndex);
      draftZonesRef.current = nextDraft;
      setDraftZones(nextDraft);
    } else {
      pointsRef.current = [];
      setPoints([]);
    }

    setZoneSettings((current) => current.filter((_, zoneIndex) => zoneIndex !== index));
  };

  const confirmDeleteZone = async () => {
    const index = confirmDeleteIndex;
    if (index === null) return;

    const remainingZones = savedZonesRef.current.filter((_, zoneIndex) => zoneIndex !== index);
    const remainingConfigs = zoneSettings.filter((_, zoneIndex) => zoneIndex !== index);

    setZoneActionBusy(true);
    try {
      await persistZones({ zones: remainingZones, zoneConfigs: remainingConfigs, detectionName: selectedDetection });
      toast.success('Zone deleted', COMPACT_TOAST);
      setConfirmDeleteIndex(null);
    } catch (error) {
      console.error('Live demo zone delete failed', error);
      const message =
        error?.response?.data?.body?.message ||
        error?.response?.data?.body?.error ||
        error?.message ||
        'Failed to delete zone';
      toast.error(message, COMPACT_TOAST);
    } finally {
      setZoneActionBusy(false);
    }
  };

  const handleSaveArea = async () => {
    const nextNewZones = buildNewZones();
    if (nextNewZones.length === 0) {
      toast.error(
        isLineCrossing
          ? 'Draw the line and place the inside reference point before saving'
          : 'Place at least 3 points before saving area',
        COMPACT_TOAST,
      );
      return;
    }
    if (!uploadedVideoPath) {
      toast.error('Upload a clip before saving area', COMPACT_TOAST);
      return;
    }
    if (!selected.settingType) {
      toast.error(`${selected.name} is not available in the Live Demo API yet`, COMPACT_TOAST);
      return;
    }
    // DS can't decide crossing direction without the inside reference point, so
    // a line that hasn't got all 3 points placed and saved isn't processable.
    if (isLineCrossing) {
      const line = savedZonesRef.current[0] || draftZonesRef.current[0] || pointsRef.current;
      if (!line || line.length < 3) {
        toast.error('Draw the line and place the inside reference point first', COMPACT_TOAST);
        return;
      }
    }
    if (document.fullscreenElement === stageRef.current) {
      setShowDrawingActions(false);
      await document.exitFullscreen?.();
    }
    setShowSaveAreaModal(true);
  };

  const handleSubmitSaveArea = async ({ detectionName, severity, zoneDrafts: submittedZones = [] }) => {
    const nextNewZones = buildNewZones();
    if (nextNewZones.length === 0) {
      toast.error(
        isLineCrossing
          ? 'Draw the line and place the inside reference point before saving'
          : 'Place at least 3 points before saving area',
        COMPACT_TOAST,
      );
      return;
    }
    if (!uploadedVideoPath) {
      toast.error('Upload a clip before saving area', COMPACT_TOAST);
      return;
    }
    if (!selected.settingType) {
      toast.error(`${selected.name} is not available in the Live Demo API yet`, COMPACT_TOAST);
      return;
    }

    // Merge the newly drawn zones (from the modal) with what's already saved,
    // so submitting doesn't wipe out zones saved earlier in this session.
    // A re-saved tripwire is the SAME line, not an extra one -- merging it in
    // would duplicate it, so it replaces the saved line instead.
    const isLineResave = isLineCrossing && savedZonesRef.current.length > 0;
    const allZones = isLineResave ? nextNewZones : [...savedZonesRef.current, ...nextNewZones];
    const allZoneConfigs = isLineResave
      ? submittedZones.map((zone) => ({ ...zone, severity }))
      : [...savedZoneSettings, ...submittedZones.map((zone) => ({ ...zone, severity }))];

    setSavingArea(true);
    try {
      await persistZones({
        zones: allZones,
        zoneConfigs: allZoneConfigs,
        detectionName,
        severity,
      });
      setShowSaveAreaModal(false);
      toast.success('Area saved for this demo clip', COMPACT_TOAST);
    } catch (error) {
      console.error('Live demo area save failed', error);
      const message =
        error?.response?.data?.body?.message ||
        error?.response?.data?.body?.error ||
        error?.message ||
        'Failed to save area';
      toast.error(message, COMPACT_TOAST);
    } finally {
      setSavingArea(false);
    }
  };

  // Zone Settings panel's own Save button — persists edits (name/capacity/
  // threshold) made to zones that are already saved, no drawing involved.
  const handleZoneSettingsPanelSave = async () => {
    if (savedZones.length === 0) return;

    setSavingArea(true);
    try {
      await persistZones({
        zones: savedZones,
        zoneConfigs: savedZoneSettings,
        detectionName: selectedDetection,
      });
      toast.success('Zone settings saved', COMPACT_TOAST);
    } catch (error) {
      console.error('Live demo zone settings save failed', error);
      const message =
        error?.response?.data?.body?.message ||
        error?.response?.data?.body?.error ||
        error?.message ||
        'Failed to save zone settings';
      toast.error(message, COMPACT_TOAST);
    } finally {
      setSavingArea(false);
    }
  };

  const toggleClipFullscreen = async () => {
    if (!stageRef.current) return;
    if (document.fullscreenElement === stageRef.current) {
      setShowDrawingActions(false);
      await document.exitFullscreen?.();
      return;
    }
    await stageRef.current.requestFullscreen?.();
  };

  const drawingToolbarProps = {
    drawing,
    pointCount: points.length + draftZones.reduce((sum, zone) => sum + zone.length, 0) + savedZones.reduce((sum, zone) => sum + zone.length, 0),
    maxPoints,
    isLineCrossing,
    disabled: !playerVideoUrl || isClipBusy || savingArea,
    onDraw: () => setDrawing((value) => !value),
    onMaxArea: handleMaxArea,
    onMinArea: handleMinArea,
    onDecrease: () => setMaxPoints((value) => Math.max(3, value - 1)),
    onIncrease: () => setMaxPoints((value) => value + 1),
    onUndo: () => {
      if (pointsRef.current.length > 0) {
        const updated = pointsRef.current.slice(0, -1);
        pointsRef.current = updated;
        setPoints(updated);
        return;
      }
      if (draftZonesRef.current.length > 0) {
        const updated = draftZonesRef.current.slice(0, -1);
        draftZonesRef.current = updated;
        setDraftZones(updated);
        return;
      }
      const updated = savedZonesRef.current.slice(0, -1);
      savedZonesRef.current = updated;
      setSavedZones(updated);
    },
    onClear: () => {
      // Only the drawing-in-progress (never saved) — clear locally, nothing to tell the server.
      if (savedZonesRef.current.length === 0) {
        pointsRef.current = [];
        draftZonesRef.current = [];
        setPoints([]);
        setDraftZones([]);
        return;
      }
      // Zones already saved on the server — clear them there too, no confirmation.
      handleClearAll();
    },
    onSave: handleSaveArea,
  };

  const handleClearAll = async () => {
    setZoneActionBusy(true);
    try {
      pointsRef.current = [];
      draftZonesRef.current = [];
      setPoints([]);
      setDraftZones([]);
      await persistZones({ zones: [], zoneConfigs: [], detectionName: selectedDetection });
      toast.success('All zones cleared', COMPACT_TOAST);
    } catch (error) {
      console.error('Live demo clear zones failed', error);
      const message =
        error?.response?.data?.body?.message ||
        error?.response?.data?.body?.error ||
        error?.message ||
        'Failed to clear zones';
      toast.error(message, COMPACT_TOAST);
    } finally {
      setZoneActionBusy(false);
    }
  };

  const handleClipFile = async (file) => {
    if (!file) return;
    if (!selected.settingType) {
      toast.error(`${selected.name} is not available in the Live Demo API yet`, COMPACT_TOAST);
      return;
    }
    if (!['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'].includes(file.type)) {
      toast.error('Please upload MP4, MOV, AVI, or MKV clips', COMPACT_TOAST);
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      toast.error('Clip must be 30 MB or smaller', COMPACT_TOAST);
      return;
    }

    await resetClipState();
    const localUrl = URL.createObjectURL(file);
    setClipFile(file);
    setClipPreviewUrl(localUrl);
    setClipStatus('uploading');
    setClipProgress(1);

    try {
      const uploaded = await uploadDemoClip(file, {
        onUploadProgress: (event) => {
          if (!event.total) return;
          setClipProgress(Math.min(95, Math.round((event.loaded / event.total) * 100)));
        },
      });

      if (!uploaded.videoUrl) throw new Error('Upload did not return a video path');
      setUploadedVideoPath(uploaded.videoUrl);
      setUploadedVideoUrl(uploaded.fullUrl || '');

      const record = await createVideoRecord({
        videos: [{ videoUrl: uploaded.videoUrl }],
        detections: { [selected.settingType]: true },
      });
      setVideoRecord(record);
      setClipProgress(100);
      setClipStatus('uploaded');
      updateLiveDemoSession({
        adminId: user?.adminId,
        recordId: recordIdOf(record),
        videoRecord: record,
        videos: record?.videos || [],
        uploadedVideoPath: uploaded.videoUrl,
        uploadedVideoUrl: uploaded.fullUrl || '',
        clipName: file.name,
        clipSize: file.size,
        selectedDetection,
        settingType: selected.settingType,
        status: 'uploaded',
        matchedAlerts: [],
      });
      toast.success('Demo clip uploaded. Click Process clip to run detection.', COMPACT_TOAST);
    } catch (error) {
      console.error('Live demo clip upload failed', error);
      const message =
        error?.response?.data?.body?.message ||
        error?.response?.data?.body?.error ||
        error?.message ||
        'Failed to upload demo clip';
      setClipStatus('error');
      toast.error(message, COMPACT_TOAST);
    }
  };

  const handleProcessClip = async () => {
    if (!clipFile && !uploadedVideoPath) {
      toast.error('Select a clip before processing', COMPACT_TOAST);
      return;
    }
    if (!selected.settingType) {
      toast.error(`${selected.name} is not available in the Live Demo API yet`, COMPACT_TOAST);
      return;
    }

    setClipStatus('processing');
    setClipProgress(10);
    setProcessJob(null);
    setSecondsRemaining(null);
    processingDeadlineRef.current = null;
    setRecordVideos([]);
    setSessionAnalytics(null);
    setDemoIncidents({ items: [], totalCount: 0 });
    setDemoAttendanceLogs(null);
    setMatchedAlerts([]);

    let videoPath = uploadedVideoPath;
    try {
      let record = videoRecord;

      if (!videoPath && clipFile) {
        setClipStatus('uploading');
        const uploaded = await uploadDemoClip(clipFile, {
          onUploadProgress: (event) => {
            if (!event.total) return;
            setClipProgress(Math.min(80, Math.round((event.loaded / event.total) * 80)));
          },
        });
        if (!uploaded.videoUrl) throw new Error('Upload did not return a video path');
        videoPath = uploaded.videoUrl;
        setUploadedVideoPath(videoPath);
        setUploadedVideoUrl(uploaded.fullUrl || '');
      }

      if (!recordIdOf(record)) {
        record = await createVideoRecord({
          videos: [{ videoUrl: videoPath }],
          detections: { [selected.settingType]: true },
        });
        setVideoRecord(record);
      }

      const recordId = recordIdOf(record);
      const video = firstVideoOf(record);
      if (!recordId || !video?._id) throw new Error('Demo record did not return a video id');
      setClipStatus('processing');
      setClipProgress(10);
      processingSettingTypeRef.current = selected.settingType;
      updateLiveDemoSession({
        adminId: user?.adminId,
        recordId,
        videoRecord: record,
        videos: record?.videos || [],
        uploadedVideoPath: videoPath,
        uploadedVideoUrl,
        clipName: clipFile?.name,
        clipSize: clipFile?.size,
        selectedDetection,
        settingType: selected.settingType,
        status: 'processing',
        matchedAlerts: [],
      });

      const job = await processVideoRecord(recordId, {
        videoId: video._id || video.id,
        detectors: [{ name: selected.settingType }],
      });
      setProcessJob(job?.job || job);
      const estimate = Number(job?.job?.estimated_completion_seconds);
      // Budget = estimated_completion_seconds + 20%. The loader counts down from
      // this same value and the job is aborted once it elapses.
      const budgetSeconds = Number.isFinite(estimate) && estimate > 0 ? Math.round(estimate * 1.2) : null;
      setSecondsRemaining(budgetSeconds);
      processingDeadlineRef.current = budgetSeconds != null ? Date.now() + budgetSeconds * 1000 : null;
      setClipProgress(60);

      const [analyticsData, incidentsData, attendanceData] = await Promise.all([
        getLiveDemoAnalytics({ detectionTypes: [analyticsSettingType(selected.settingType)] }),
        getDemoIncidents({ limit: 10, incidentTypeFilter: [selected.settingType] }),
        selected.settingType === 'faceAuthenticationSettings'
          ? getDemoAttendanceLogs({ limit: 10, isExport: false })
          : Promise.resolve(null),
      ]);

      setSessionAnalytics(analyticsData || null);
      setDemoIncidents(incidentsData || { items: [], totalCount: 0 });
      setDemoAttendanceLogs(attendanceData);
      // The DS pipeline processes the clip asynchronously — the processed
      // video isn't ready yet. Keep the loader up until the
      // videoRecord_updated_${recordId} socket event delivers dsVideoUrl.
      setClipProgress((current) => Math.max(current, 75));
      setClipStatus((current) => {
        const nextStatus = current === 'ready' ? 'ready' : 'awaiting-ds';
        updateLiveDemoSession({ status: nextStatus });
        return nextStatus;
      });
      toast.success('Demo processing started', COMPACT_TOAST);
      loadDemoHistory();
    } catch (error) {
      console.error('Live demo clip processing failed', error);
      const message =
        error?.response?.data?.body?.message ||
        error?.response?.data?.body?.error ||
        error?.message ||
        'Failed to process demo clip';
      setClipStatus(videoPath ? 'uploaded' : 'error');
      setSecondsRemaining(null);
      processingDeadlineRef.current = null;
      updateLiveDemoSession({ status: videoPath ? 'uploaded' : 'error' });
      toast.error(message, COMPACT_TOAST);
    }
  };

  return (
    <div className="min-h-full bg-[var(--bg2)] p-3 sm:p-4 lg:p-[22px]">
      <div className="overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bd)] px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-bold text-[var(--tx)]">Live Demo</h1>
              <span className="inline-flex h-6 items-center gap-1 rounded-full border border-red-300 bg-red-50 px-3 text-[10px] font-bold tracking-[0.18em] text-red-500">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                LIVE
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--tx3)]">Upload a clip, pick a detection, and watch VideoraIQ work.</p>
          </div>

          <div data-tour="demo-steps" className="flex items-center gap-4">
            {steps.map(([number, label], index) => {
              const active = index <= 1;
              return (
                <div key={label} className="flex items-center gap-2 text-xs font-semibold text-[var(--tx3)]">
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
                      active ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white' : 'border border-[var(--bd2)] text-[var(--tx3)]'
                    }`}
                  >
                    {number}
                  </span>
                  <span className={active ? 'text-[var(--tx)]' : ''}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <section data-tour="demo-detection" className="min-w-0 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-bold text-[var(--tx)]">1. Detection</h2>
              <span
                className="inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold text-[var(--tx)]"
                style={{
                  borderColor: colorWithAlpha(selected.color, 0.45),
                  background: colorWithAlpha(selected.color, 0.1),
                  boxShadow: `0 0 14px ${colorWithAlpha(selected.color, 0.16)}`,
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: selected.color }} />
                {selectedDetection}
                <span className="text-[10px] font-medium text-[var(--tx3)]">{selected.subtitle}</span>
              </span>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex h-9 w-[260px] max-w-full items-center gap-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 text-[var(--tx3)]">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-xs text-[var(--tx)] outline-none"
                  placeholder="Search detections..."
                />
              </div>
              <button
                type="button"
                onClick={() => setShowList((value) => !value)}
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 text-xs font-semibold text-[var(--blue)] hover:border-[var(--blue)]"
              >
                {showList ? 'Hide list' : 'Show list'}
                <ChevronUp className={`h-4 w-4 transition-transform ${showList ? '' : 'rotate-180'}`} />
              </button>
            </div>
          </div>

          {showList && (
            <>
              <div data-tour="demo-categories" className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--tx3)]">
                  23 Models
                </span>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() => setActiveCategory(category.key)}
                      className={`h-8 cursor-pointer rounded-lg border px-3 text-xs font-semibold transition-colors ${
                        activeCategory === category.key
                          ? 'border-transparent bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white'
                          : 'border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:border-[var(--bd2)]'
                      }`}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              </div>

              <div data-tour="demo-models" className="grid max-h-[258px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredDetections.map((item) => {
                  const selectedCard = selectedDetection === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleSelectDetection(item)}
                      className="flex min-h-[58px] cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-[var(--bd2)]"
                      style={
                        selectedCard
                          ? {
                              borderColor: item.color,
                              background: colorWithAlpha(item.color, 0.1),
                              boxShadow: `inset 0 0 0 1px ${colorWithAlpha(item.color, 0.26)}, 0 0 12px ${colorWithAlpha(item.color, 0.12)}`,
                            }
                          : {
                              borderColor: 'var(--bd)',
                              background: 'var(--bg2)',
                            }
                      }
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold text-[var(--tx)]">{item.name}</span>
                        <span className="mt-1 block truncate text-[10px] text-[var(--tx3)]">{item.subtitle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <div className={`mt-4 grid gap-4 ${configurationAvailable ? 'xl:grid-cols-[minmax(0,1fr)_minmax(360px,580px)]' : ''}`}>
        <section data-tour="demo-upload" className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold text-[var(--tx)]">2. Upload a test clip</h2>
            <span className="inline-flex h-7 items-center gap-2 rounded-lg border border-[var(--blue)]/35 bg-[var(--blue)]/10 px-3 text-[10px] font-semibold tracking-[0.08em] text-[var(--blue)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue)]" />
              {selectedDetection}
            </span>
          </div>
          <input
            ref={clipInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.mov,.avi,.mkv"
            className="hidden"
            onChange={(event) => {
              handleClipFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {clipFile ? (
            <div className="overflow-hidden rounded-xl border border-[var(--bd)] bg-[var(--bg2)]">
              <div
                ref={stageRef}
                className={`relative grid min-h-[260px] place-items-center overflow-hidden bg-black ${drawing ? 'cursor-crosshair' : ''} ${isClipFullscreen ? 'h-screen w-screen' : ''}`}
              >
                {playerVideoUrl ? (
                  <>
                    {/* Keep every native control (including the ⋮ overflow menu)
                        but drop the fullscreen button — only the custom expand
                        button drives the drawing overlay, so two fullscreen
                        affordances don't confuse users. */}
                    <style>{`
                      .live-demo-video::-webkit-media-controls-fullscreen-button { display: none !important; }
                    `}</style>
                    <video
                      ref={videoRef}
                      src={playerVideoUrl}
                      className={`live-demo-video ${isClipFullscreen ? 'h-screen w-screen max-h-none' : 'h-full max-h-[420px] w-full'} object-contain`}
                      controls
                      muted
                      controlsList="nofullscreen"
                      onLoadedMetadata={handleVideoMetadata}
                      onClick={(event) => {
                        if (!drawing) event.preventDefault();
                      }}
                      onDoubleClick={(event) => {
                        // Double-click toggles the custom expand/collapse
                        // (never the browser's native fullscreen).
                        event.preventDefault();
                        if (!drawing) toggleClipFullscreen();
                      }}
                    />
                  </>
                ) : (
                  <FileVideo className="h-10 w-10 text-white/70" />
                )}
                {playerVideoUrl && (
                  <>
                    <svg
                      className="pointer-events-none absolute z-[3]"
                      style={{
                        left: videoRect.left,
                        top: videoRect.top,
                        width: videoRect.width,
                        height: videoRect.height,
                      }}
                      viewBox={`0 0 ${videoSize.w || 1000} ${videoSize.h || 562}`}
                      preserveAspectRatio="none"
                    >
                      {savedZones.map((zone, index) => (
                        <g key={`zone-${index}`}>
                          {isLineCrossing ? (
                            <polyline
                              points={pointsToAttr(zone.slice(0, 2))}
                              fill="none"
                              stroke="rgba(245,166,35,.95)"
                              strokeWidth="4"
                            />
                          ) : (
                            <polygon
                              points={pointsToAttr(zone)}
                              fill="rgba(245,166,35,.18)"
                              stroke="rgba(245,166,35,.95)"
                              strokeWidth="3"
                            />
                          )}
                          {zone.map((point, pointIndex) => {
                            const isRefPoint = isLineCrossing && pointIndex === 2;
                            return (
                              <g key={`zone-${index}-point-${pointIndex}`}>
                                <circle
                                  cx={point.x}
                                  cy={point.y}
                                  r={isRefPoint ? 7 : 6}
                                  fill={isRefPoint ? '#22c55e' : '#fff'}
                                  stroke={isRefPoint ? '#fff' : 'rgba(245,166,35,.95)'}
                                  strokeWidth="3"
                                />
                                {isRefPoint && (
                                  <text
                                    x={point.x + 14}
                                    y={point.y + 5}
                                    fill="#22c55e"
                                    fontSize="16"
                                    fontWeight="bold"
                                  >
                                    Inside Reference Point
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </g>
                      ))}
                      {draftZones.map((zone, index) => (
                        <g key={`draft-zone-${index}`}>
                          {isLineCrossing ? (
                            <polyline
                              points={pointsToAttr(zone.slice(0, 2))}
                              fill="none"
                              stroke="rgba(59,130,246,.95)"
                              strokeWidth="4"
                            />
                          ) : (
                            <polygon
                              points={pointsToAttr(zone)}
                              fill="rgba(59,130,246,.14)"
                              stroke="rgba(59,130,246,.95)"
                              strokeWidth="3"
                            />
                          )}
                          {zone.map((point, pointIndex) => (
                            <circle key={`draft-zone-${index}-point-${pointIndex}`} cx={point.x} cy={point.y} r="6" fill="#fff" stroke="rgba(59,130,246,.95)" strokeWidth="3" />
                          ))}
                        </g>
                      ))}
                      {/* A tripwire is only ever the first 2 points; the 3rd is
                          the inside reference point and must not join the line. */}
                      {points.length >= 2 && (
                        <polyline
                          points={pointsToAttr(isLineCrossing ? points.slice(0, 2) : points)}
                          fill="none"
                          stroke="rgba(59,130,246,.95)"
                          strokeWidth={isLineCrossing ? 4 : 3}
                        />
                      )}
                      {!isLineCrossing && points.length >= 3 && (
                        <polygon
                          points={pointsToAttr(points)}
                          fill="rgba(59,130,246,.14)"
                          stroke="rgba(59,130,246,.95)"
                          strokeWidth="3"
                        />
                      )}
                      {points.map((point, index) => {
                        const isRefPoint = isLineCrossing && index === 2;
                        return (
                          <g key={`point-${index}`}>
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r={drawing ? 7 : 10}
                              fill={isRefPoint ? '#22c55e' : '#fff'}
                              stroke={isRefPoint ? '#fff' : 'rgba(59,130,246,.95)'}
                              strokeWidth="3"
                              style={{ pointerEvents: drawing ? 'none' : 'auto', cursor: drawing ? 'default' : 'grab', touchAction: 'none' }}
                              onPointerDown={handlePointDragStart(index)}
                            />
                            {isRefPoint && (
                              <text
                                x={point.x + 14}
                                y={point.y + 5}
                                fill="#22c55e"
                                fontSize="16"
                                fontWeight="bold"
                                style={{ pointerEvents: 'none' }}
                              >
                                Inside Reference Point
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                    <div
                      className="pointer-events-none absolute z-[3]"
                      style={{ left: videoRect.left, top: videoRect.top, width: videoRect.width, height: videoRect.height }}
                    >
                      {savedZones.map((zone, index) => {
                        const w = videoSize.w || 1000;
                        const h = videoSize.h || 562;
                        const topPoint = zone.reduce((top, point) => (point.y < top.y ? point : top), zone[0]);
                        const label = confirmedZoneNames[index] || `${isLineCrossing ? 'Line' : 'Zone'} ${index + 1}`;
                        return (
                          <div
                            key={`zone-label-${index}`}
                            className="absolute -translate-x-1/2 -translate-y-full"
                            style={{ left: `${(topPoint.x / w) * 100}%`, top: `${(topPoint.y / h) * 100}%`, marginTop: '-8px' }}
                          >
                            <span className="block rounded-md bg-[#e6395c] px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-white shadow-md">
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {drawing && (
                      <button
                        type="button"
                        className="absolute z-[4] cursor-crosshair border-0 bg-transparent p-0"
                        style={{
                          left: videoRect.left,
                          top: videoRect.top,
                          width: videoRect.width,
                          height: videoRect.height,
                        }}
                        onClick={handleDrawingClick}
                        aria-label="Place zone point"
                      />
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleClipFullscreen();
                      }}
                      className="absolute right-3 top-3 z-20 grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-white/15 bg-black/60 text-white backdrop-blur"
                      aria-label={isClipFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    >
                      {isClipFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                    {isClipFullscreen && (
                      <>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowDrawingActions((value) => !value);
                          }}
                          className={`absolute right-14 top-3 z-30 grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-white/15 bg-black/60 text-white backdrop-blur ${showDrawingActions ? 'border-white/40 bg-black/80' : ''}`}
                          aria-label="Drawing actions"
                          title="Drawing actions"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {showDrawingActions && (
                          <div
                            className="absolute right-3 top-14 z-30"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <FullscreenDrawingMenu {...drawingToolbarProps} />
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                {isClipBusy && (
                  <VideoProcessingLoader
                    title={
                      clipStatus === 'uploading'
                        ? 'Uploading Video…'
                        : 'Processing Video…'
                    }
                    subtitle={
                      clipStatus === 'uploading'
                        ? 'Uploading your clip, please wait'
                        : clipStatus === 'awaiting-ds'
                          ? (secondsRemaining != null
                              ? `Analyzing video content — about ${secondsRemaining}s remaining`
                              : 'Analyzing video content, please wait')
                          : 'Analyzing video content, please wait'
                    }
                    progress={clipStatus === 'awaiting-ds' ? null : clipProgress}
                  />
                )}
              </div>

              {!isClipFullscreen && (
                <div className="border-t border-[var(--bd)] bg-[var(--bg1solid)] p-3">
                  <DemoDrawingToolbar {...drawingToolbarProps} />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bd)] p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--blue)]/10 text-[var(--blue)]">
                    <FileVideo className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[var(--tx)]">{clipFile.name}</div>
                    <div className="mt-1 text-[11px] font-semibold text-[var(--tx3)]">
                      {statusLabel}
                      {fileSizeLabel(clipFile.size) ? ` - ${fileSizeLabel(clipFile.size)}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-tour="demo-process"
                    onClick={handleProcessClip}
                    disabled={isClipBusy || (!clipFile && !uploadedVideoPath) || clipStatus === 'ready'}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-3 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {clipStatus === 'processing' || clipStatus === 'awaiting-ds' ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {clipStatus === 'ready' ? 'Processed' : 'Process clip'}
                  </button>
                  <button
                    type="button"
                    onClick={() => clipInputRef.current?.click()}
                    disabled={isClipBusy}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[var(--blue)]/35 bg-[var(--blue)]/10 px-3 text-xs font-bold text-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    Replace clip
                  </button>
                  <button
                    type="button"
                    onClick={() => resetClipState({ deleteRemote: true })}
                    disabled={isClipBusy}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove clip
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <button
              type="button"
              data-tour="demo-dropzone"
              onClick={() => clipInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleClipFile(event.dataTransfer.files?.[0]);
              }}
              className="grid min-h-[216px] w-full cursor-pointer place-items-center rounded-xl border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-6 text-center transition-colors hover:border-[var(--blue)]"
            >
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[var(--violet)]/25 bg-gradient-to-br from-[var(--blue)]/15 to-[var(--violet)]/20 text-[var(--blue)]">
                  <Upload className="h-6 w-6" />
                </span>
                <div className="mt-4 text-base font-bold text-[var(--tx)]">Drop your clip here, or click to browse</div>
                <div className="mt-2 text-xs text-[var(--tx2)]">Use a short, clear clip from the camera angle you want to test.</div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['MP4', 'MOV', 'AVI', 'MKV', '10-60 SEC CLIP', 'MAX 30 MB'].map((tag) => (
                    <span key={tag} className="rounded-md border border-[var(--bd)] bg-[var(--bg1solid)] px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-[var(--tx3)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          )}
        </section>

        <DemoHistoryPanel
          history={demoHistory}
          loading={demoHistoryLoading}
          activeRecordId={recordIdOf(videoRecord)}
          onSelect={handleSelectDemoHistory}
        />

        {selectedDetection === 'Face Recognition' && clipStatus === 'ready' ? (
          <MatchedAlertsPanel alerts={matchedAlerts} />
        ) : (
          selectedDetection === 'Face Recognition' && <FaceRecognitionConfig confidence={confidence} setConfidence={setConfidence} />
        )}
        {selectedDetection !== 'Face Recognition' && clipStatus === 'ready' && (
          <DemoEventLogPanel
            incidents={demoIncidents}
            detectionName={selectedDetection}
            loading={demoIncidentsLoading}
          />
        )}
        {selectedDetection !== 'Face Recognition' && clipStatus !== 'ready' && selectedConfig && (
          <DetectionConfigPanel
            detectionName={selectedDetection}
            config={selectedConfig}
            confidence={confidence}
            setConfidence={setConfidence}
            settingType={selected.settingType}
            zones={savedZones}
            zoneSettings={savedZoneSettings}
            savingArea={savingArea}
            onZoneSettingChange={handleZoneSettingChange}
            onZoneDelete={handleDeleteZone}
            onZoneSettingsSave={handleZoneSettingsPanelSave}
          />
        )}
      </div>

      <div className="mt-4 space-y-4">
        {selectedDetection === 'Face Recognition' && (
          <AttendanceLogPanel
            usersLogs={demoAttendanceLogs?.usersLogs || []}
            onDelete={handleDeleteAttendanceRows}
          />
        )}
        <SessionAnalyticsPanel
          analytics={sessionAnalytics}
          loading={analyticsLoading}
          selectedDetectionName={selectedDetection}
        />
        {selectedDetection === 'Face Recognition' && (
          <DemoReportsPanel
            usersLogs={demoAttendanceLogs?.usersLogs || []}
            clipName={clipFile?.name}
            minConfidence={confidence}
            history={demoHistory}
          />
        )}
      </div>

      <SaveDemoAreaModal
        open={showSaveAreaModal}
        detectionName={selectedDetection}
        settingType={selected.settingType}
        zoneCount={newZones.length}
        zoneOffset={saveModalZoneOffset}
        initialZoneSettings={newZoneSettings}
        saving={savingArea}
        onClose={() => !savingArea && setShowSaveAreaModal(false)}
        onSubmit={handleSubmitSaveArea}
      />
      <ConfirmModal
        open={confirmDeleteIndex !== null}
        title="Delete this zone?"
        message={`This removes ${savedZoneSettings[confirmDeleteIndex]?.name || `Zone ${(confirmDeleteIndex ?? 0) + 1}`} zone. This cannot be undone.`}
        confirmLabel="Delete Zone"
        busy={zoneActionBusy}
        onCancel={() => !zoneActionBusy && setConfirmDeleteIndex(null)}
        onConfirm={confirmDeleteZone}
      />
    </div>
  );
}
