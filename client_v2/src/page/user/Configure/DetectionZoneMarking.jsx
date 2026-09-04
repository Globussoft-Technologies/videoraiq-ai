import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Video, Pencil, Maximize2, Minimize2, X, Minus, Plus, CheckCircle2, ChevronDown, RotateCcw, MoreVertical, Trash2, Undo2 } from 'lucide-react';
import BufferingIndicator from '../../../components/BufferingIndicator';
import { toast } from 'sonner';
import useHlsPlayer from '../../../hooks/useHlsPlayer';
import { streamUrl } from '../../../lib/stream';
import { useApi } from '../../../hooks/useApi';
import { emptySchedule, buildScheduleFields, formatTime, scheduleError } from './ZoneScheduleFields';
import { usePermissions } from '@/context/PermissionContext';
import {
  ATTENDANCE_DETECTION_NAME,
  ATTENDANCE_DETECTION_SETTING_TYPE,
  DEFAULT_MAX_POINTS,
  MIN_POINTS_TO_CLOSE,
  isAttendanceDetectionType,
  isVehicleCheckInOutType,
} from './DetectionZoneMarking/constants';
import { allTypesFor, extraFieldsFor, lineFor, polygonPointsAttr, zonesFor } from './DetectionZoneMarking/utils';
import DetectionTypeDropdown from './DetectionZoneMarking/components/DetectionTypeDropdown';
import ZoneToolbar from './DetectionZoneMarking/components/ZoneToolbar';
import ZoneSettingsPanel from './DetectionZoneMarking/components/ZoneSettingsPanel';
import SaveDetectionAreaModal from './DetectionZoneMarking/dialogs/SaveDetectionAreaModal';
import ConfirmDialog from './DetectionZoneMarking/dialogs/ConfirmDialog';
import { getTelegramLinkCode } from '../../../helpers/telegram';
import {
  createZoneDetectionSetting,
  deleteZoneDetectionSetting,
  fetchAlertRecipients,
  fetchDetectionTypes,
  updateDetectionAlerts,
  updateZoneDetectionSetting,
} from './DetectionZoneMarking/api/detectionZoneApi';

export default function DetectionZoneMarking({
  camera,
  onBack,
  onSaved,
  embedded = false,
  selectedSettingType = null,
  zoneSettingsOpen = false,
  onZoneSettingsClose,
}) {
  // Zone/detection-setting deletion (per-zone trash, Clear All, Reset
  // Detection UI) is gated on detectionSettings.delete â€” a write-only role
  // (view+create+edit) can still draw/edit zones but never remove them, and
  // the delete controls are hidden entirely rather than disabled.
  const { permissions } = usePermissions();
  const canDeleteDetection = !!permissions?.detectionSettings?.delete;

  const videoRef = useRef(null);
  const stageRef = useRef(null);
  // Single state machine (mirrors PlaybackTimeline.jsx) instead of two
  // independent booleans â€” those could disagree mid-retry (onStarted firing
  // after onError already fired) and leave neither overlay condition true,
  // rendering a blank box instead of buffering/error UI.
  const [videoState, setVideoState] = useState('loading'); // loading | ready | error
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenActionsOpen, setFullscreenActionsOpen] = useState(false);

  const typesApi = useApi(() => fetchDetectionTypes(), []);
  const typeLabels = typesApi.data || {};
  const telegramApi = useApi(() => getTelegramLinkCode(), []);
  const telegramChannels = useMemo(
    () =>
      (telegramApi.data?.linkedChannels || []).filter(
        channel => channel?.chatId && channel?.active !== false,
      ),
    [telegramApi.data],
  );
  const defaultTelegramChatId = telegramChannels.length === 1
    ? String(telegramChannels[0].chatId)
    : '';

  const allTypes = useMemo(() => allTypesFor(camera, typeLabels), [camera, typeLabels]);
  // No auto-select â€” the dropdown starts on its "Select Detection Type"
  // placeholder so the user explicitly picks one, instead of silently
  // defaulting to whichever type happens to be first in the list.
  const [selectedType, setSelectedType] = useState(selectedSettingType || null);

  useEffect(() => {
    if (selectedSettingType) setSelectedType(selectedSettingType);
  }, [selectedSettingType, camera?._id]);

  const activeType = allTypes.find(t => t.settingType === selectedType) || null;
  const isAttendanceDetection = isAttendanceDetectionType(activeType?.settingType || activeType?.label);
  // Line Crossing draws a single straight line (exactly 2 points), not a
  // closed area â€” V1 gives it its own toolbar/shape entirely (see
  // AreaMarkingControls.jsx's isLineCrossing), unlike every other type here
  // which draws a filled polygon zone.
  const isLineCrossing = activeType?.settingType === 'lineCrossingSettings';
  // Vehicle Check-In / Check-Out draws polygon zones like every other area
  // type, PLUS one crossing line (+ inside reference point) via a dedicated
  // line sub-tool. So it keeps the full polygon toolbar and adds "Draw Line".
  const isCheckInOut = isVehicleCheckInOutType(activeType?.settingType);
  // A line only needs its 2 endpoints (+ inside reference point) to be savable;
  // every other type still needs MIN_POINTS_TO_CLOSE (3) to form a closed polygon.
  const minPointsToSave = isLineCrossing ? 3 : MIN_POINTS_TO_CLOSE;

  // Saved/committed zones for this camera+type â€” each { name, points }. Points
  // are native video pixel coordinates, matching V1's saved shape.
  const [zones, setZones] = useState([]);
  // The polygon currently being drawn, not yet committed to `zones`.
  const [points, setPoints] = useState([]);
  const [draftZones, setDraftZones] = useState([]);
  const presetAreaRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maxPoints, setMaxPoints] = useState(DEFAULT_MAX_POINTS);
  // Line Crossing is always exactly 2 points â€” not adjustable via the +/- stepper.
  const effectiveMaxPoints = isLineCrossing ? 3 : maxPoints;
  const decreaseMaxPoints = () => setMaxPoints(p => Math.max(MIN_POINTS_TO_CLOSE, p - 1));
  const increaseMaxPoints = () => setMaxPoints(p => p + 1);
  const [activeZoneIndex, setActiveZoneIndex] = useState(null); // which saved zone is highlighted/being renamed

  // Check-In / Check-Out's single crossing line, kept apart from the polygon
  // `zones`. `points` holds its 2 endpoints + 1 inside reference point while
  // being drawn; `lineZone` is the committed line.
  const [lineZone, setLineZone] = useState({ points: [], insideReferencePoint: null });
  const [lineDrawing, setLineDrawing] = useState(false);
  const [linePoints, setLinePoints] = useState([]);
  // Check-In / Check-Out's Line Name, tracked here (not just read from the saved
  // setting) so Clear All can blank it out for a fresh line instead of the Save
  // modal reopening pre-filled with whatever was saved last time.
  const [laneNameDraft, setLaneNameDraft] = useState('');

  // Load this type's saved zones whenever the selected detection type changes.
  useEffect(() => {
    setZones(zonesFor(activeType?.setting, camera._id, activeType?.settingType));
    setDraftZones([]);
    setPoints([]);
    presetAreaRef.current = false;
    setDrawing(false);
    setActiveZoneIndex(null);
    setLineDrawing(false);
    setLinePoints([]);
    setLineZone(
      isVehicleCheckInOutType(activeType?.settingType)
        ? lineFor(activeType?.setting)
        : { points: [], insideReferencePoint: null },
    );
    setLaneNameDraft(activeType?.setting?.settings?.zone_name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, activeType?.setting, camera._id]);

  // Trim an in-progress polygon if the max-points cap is lowered below what's already placed.
  useEffect(() => {
    setPoints(prev => (prev.length > effectiveMaxPoints ? prev.slice(0, effectiveMaxPoints) : prev));
  }, [effectiveMaxPoints]);

  const cameraNvrId = camera?.nvrId?._id || camera?.nvrId || camera?.NVRId || camera?.nvr?._id || camera?.nvr;
  const cameraId = camera?._id || camera?.id || camera?.channelId;
  const streamPath =
    camera?.streamingUrl ||
    camera?.StreamingUrl ||
    camera?.config?.StreamingUrl ||
    (camera?.localChannelId ? `stream/${camera.localChannelId}/playlist.m3u8` : '') ||
    (cameraNvrId && cameraId ? `stream/${cameraNvrId}-${cameraId}/playlist.m3u8` : '');
  const url = streamUrl({ ...camera, streamingUrl: streamPath });
  useEffect(() => {
    setVideoState(url ? 'loading' : 'error');
  }, [url]);

  useHlsPlayer(videoRef, url, {
    enabled: !!url,
    onError: () => setVideoState('error'),
    onStarted: () => setVideoState(s => (s === 'ready' ? s : 'loading')), // retrying after a 404 â€” stay in loading, don't clear a real error into limbo
  });

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v?.videoWidth) setVideoSize({ w: v.videoWidth, h: v.videoHeight });
  };
  const handleVideoReady = () => setVideoState('ready');

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useEffect(() => {
    if (!isFullscreen) setFullscreenActionsOpen(false);
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenShortcut = async (event) => {
      const target = event.target;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (isTyping || event.key?.toLowerCase() !== 'f' || document.fullscreenElement) return;

      event.preventDefault();
      try {
        await stageRef.current?.requestFullscreen?.();
      } catch {
        toast.error('Fullscreen is not available for this browser.');
      }
    };

    window.addEventListener('keydown', handleFullscreenShortcut);
    return () => window.removeEventListener('keydown', handleFullscreenShortcut);
  }, []);

  useEffect(() => {
    const handleMaxPointsShortcut = (event) => {
      const target = event.target;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (isTyping || isLineCrossing || event.ctrlKey || event.metaKey || event.altKey) return;

      const isIncrease = event.key === '+' || event.code === 'NumpadAdd';
      const isDecrease = event.key === '-' || event.code === 'NumpadSubtract';
      if (!isIncrease && !isDecrease) return;

      event.preventDefault();
      if (isIncrease) {
        increaseMaxPoints();
      } else {
        decreaseMaxPoints();
      }
    };

    window.addEventListener('keydown', handleMaxPointsShortcut);
    return () => window.removeEventListener('keydown', handleMaxPointsShortcut);
  }, [isLineCrossing]);

  const handleToggleFullscreen = async (e) => {
    e.stopPropagation();
    try {
      if (document.fullscreenElement === stageRef.current) {
        await document.exitFullscreen?.();
      } else {
        await stageRef.current?.requestFullscreen?.();
      }
    } catch {
      toast.error('Fullscreen is not available for this browser.');
    }
  };

  // Every shape (polygon zones â€” including the Max/Min Area presets â€” and
  // Line Crossing) lets you grab any already-placed point and drag it to
  // reposition/resize (V1 parity: CameraStreamWithArea.jsx's corner-drag).
  // Previously this only worked for Line Crossing, so a Min/Max Area
  // rectangle (or any polygon) had no way to be resized after being placed â€”
  // Undo/Clear All only removed points, they couldn't be repositioned.
  // Kept in a ref (not state) so mousemove doesn't re-render on every pixel;
  // only the resulting point update does.
  const draggingPointIndex = useRef(null);
  const HIT_RADIUS_PX = 14; // on-screen px, independent of video resolution

  const stageEventToVideoXY = (e) => {
    const rect = stageRef.current.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - rect.left) / rect.width * videoSize.w),
      y: Math.round((e.clientY - rect.top) / rect.height * videoSize.h),
    };
  };

  // A pointerup that ends a drag also fires a native click right after â€”
  // without this guard that click would immediately place a new point.
  const justDraggedRef = useRef(false);

  const handleStagePointerDown = (e) => {
    if (!videoSize.w || points.length === 0) return;
    const rect = stageRef.current.getBoundingClientRect();
    const hitRadiusVideoPx = HIT_RADIUS_PX * (videoSize.w / rect.width);
    const { x, y } = stageEventToVideoXY(e);
    const idx = points.findIndex(p => Math.hypot(p.x - x, p.y - y) <= hitRadiusVideoPx);
    if (idx !== -1) {
      draggingPointIndex.current = idx;
      // Keep receiving move/up events even if the cursor leaves the stage
      // mid-drag (fast drags can outrun the element's bounds otherwise).
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.stopPropagation();
    }
  };

  const handleStagePointerMove = (e) => {
    if (draggingPointIndex.current === null || !videoSize.w) return;
    justDraggedRef.current = true;
    const { x, y } = stageEventToVideoXY(e);
    const clampedX = Math.max(0, Math.min(videoSize.w, x));
    const clampedY = Math.max(0, Math.min(videoSize.h, y));
    const idx = draggingPointIndex.current;
    setPoints(prev => prev.map((p, i) => (i === idx ? { x: clampedX, y: clampedY } : p)));
  };

  const handleStagePointerUp = () => {
    draggingPointIndex.current = null;
  };

  const makeZoneFromPoints = (zonePoints, index = zones.length) => ({
    name: `Zone ${index + 1}`,
    capacity: '',
    threshold: '',
    company: '',
    telegramChatIds: [],
    telegramChatId: '',
    countMode: (isLineCrossing || isCheckInOut) ? 'entry' : '',
    schedule: emptySchedule(),
    insideReferencePoint: isLineCrossing && zonePoints[2] ? zonePoints[2] : null,
    points: isLineCrossing ? zonePoints.slice(0, 2) : zonePoints,
  });

  // â”€â”€ Check-In / Check-Out crossing line â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Two clicks place the endpoints, a third places the inside reference point,
  // then the line commits and drawing stops.
  const handleLineClick = ({ x, y }) => {
    setLinePoints(prev => {
      if (prev.length >= 3) return prev;
      const next = [...prev, { x, y }];
      if (next.length === 3) {
        setLineZone({ points: next.slice(0, 2), insideReferencePoint: next[2] });
        setLineDrawing(false);
        return [];
      }
      return next;
    });
  };
  const handleLineUndo = () => {
    if (linePoints.length > 0) {
      setLinePoints(prev => prev.slice(0, -1));
      return;
    }
    setLineZone({ points: [], insideReferencePoint: null });
  };
  const startLineDrawing = () => {
    setDrawing(false);
    presetAreaRef.current = false;
    setLinePoints([]);
    setLineDrawing(d => !d);
  };

  const handleStageClick = (e) => {
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    if (!videoSize.w) return;

    const { x, y } = stageEventToVideoXY(e);

    if (lineDrawing) {
      handleLineClick({ x, y });
      return;
    }
    if (!drawing) return;

    if (presetAreaRef.current) {
      presetAreaRef.current = false;
      setPoints([{ x, y }]);
      return;
    }

    // Reaching the point cap completes the draft only. It should not move into
    // the saved-zone state or right-side Zone Settings until Save Area is used.
    if (points.length >= effectiveMaxPoints) return;

    const next = [...points, { x, y }];
    setPoints(next);

    if (!isLineCrossing && next.length >= effectiveMaxPoints) {
      setDraftZones(prev => [...prev, makeZoneFromPoints(next, zones.length + prev.length)]);
      setPoints([]);
    }
  };

  const handleUndo = () => {
    if (lineDrawing) { handleLineUndo(); return; }
    if (!drawing) return;
    presetAreaRef.current = false;
    if (points.length > 0) {
      setPoints(prev => prev.slice(0, -1));
      return;
    }
    setDraftZones(prev => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setPoints(last.points.slice(0, -1));
      return prev.slice(0, -1);
    });
  };
  const handleClear = () => {
    presetAreaRef.current = false;
    setPoints([]);
  };

  // Clear All only resets the editor canvas; Reset Setting deletes saved config.
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const hasLineContent = linePoints.length > 0 || lineZone.points.length > 0;

  const handleClearAllClick = () => {
    if (points.length === 0 && draftZones.length === 0 && zones.length === 0 && !hasLineContent) return;
    setShowClearConfirm(true);
  };

  const handleConfirmClearAll = () => {
    setZones([]);
    setDraftZones([]);
    setPoints([]);
    setActiveZoneIndex(null);
    presetAreaRef.current = false;
    setDrawing(false);
    setLineDrawing(false);
    setLinePoints([]);
    setLineZone({ points: [], insideReferencePoint: null });
    setLaneNameDraft('');
    setShowClearConfirm(false);
    toast.success('Drawing cleared.');
  };

  // Quick-start rectangle presets (V1 parity) â€” full-frame / a small fixed
  // box â€” the user then drags points to adjust; these aren't size limits.
  const handleMaxArea = () => {
    if (!videoSize.w) return;
    const { w, h } = videoSize;
    presetAreaRef.current = true;
    setPoints([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
    setDrawing(false);
    setLineDrawing(false);
  };
  const handleMinArea = () => {
    if (!videoSize.w) return;
    presetAreaRef.current = true;
    setPoints([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }]);
    setDrawing(false);
    setLineDrawing(false);
  };

  const hasDrawableContent = points.length > 0 || draftZones.length > 0 || zones.length > 0 || hasLineContent;
  const canUseAreaPreset = !!activeType && !!videoSize.w && !isLineCrossing;
  const canUseDrawing = !!activeType;
  const canUseUndo = (drawing && (points.length > 0 || draftZones.length > 0)) || (lineDrawing && hasLineContent);
  const canUseClearAll = hasDrawableContent;

  const runFullscreenAction = (event, action) => {
    event.stopPropagation();
    action();
  };

  const handleUpdateZoneField = (index, field, value) => {
    setZones(prev => prev.map((z, i) => {
      if (i !== index) return z;
      if (field === 'telegramChatIds') {
        const selectedChatIds = Array.isArray(value)
          ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
          : [];
        return {
          ...z,
          telegramChatIds: selectedChatIds,
          telegramChatId: selectedChatIds[0] || '',
          schedule: selectedChatIds.length ? z.schedule : emptySchedule(),
        };
      }
      if (field === 'telegramChatId' && !String(value || '').trim()) {
        return { ...z, telegramChatId: value, telegramChatIds: [], schedule: emptySchedule() };
      }
      return { ...z, [field]: value };
    }));
    setZoneFieldErrors(prev => ({ ...prev, [`zone-${index}-${field}`]: '' }));
  };

  const validateZoneRequiredFields = (zone, index) => {
    const nextErrors = {};
    const fields = extraFieldsFor(activeType?.settingType);
    const nameLabel = activeType?.settingType === 'lineCrossingSettings' ? 'Line Name' : 'Zone Name';
    const selectedTelegramChatIds = Array.isArray(zone?.telegramChatIds)
      ? zone.telegramChatIds.map((chatId) => String(chatId || '').trim()).filter(Boolean)
      : (String(zone?.telegramChatId || '').trim() ? [String(zone.telegramChatId).trim()] : []);
    const hasTelegramChannel = selectedTelegramChatIds.length > 0;
    const hasSchedule =
      Boolean(formatTime(zone?.schedule?.from)) && Boolean(formatTime(zone?.schedule?.to));
    if (!String(zone?.name || '').trim()) nextErrors[`zone-${index}-name`] = `${nameLabel} is required.`;
    if (fields.includes('capacity') && String(zone?.capacity ?? '').trim() === '') nextErrors[`zone-${index}-capacity`] = 'Capacity is required.';
    if (fields.includes('threshold') && String(zone?.threshold ?? '').trim() === '') nextErrors[`zone-${index}-threshold`] = 'Threshold is required.';
    if (fields.includes('company') && String(zone?.company ?? '').trim() === '') nextErrors[`zone-${index}-company`] = 'Company is required.';
    if (!isCheckInOut && hasSchedule && !hasTelegramChannel) {
      nextErrors[`zone-${index}-telegramChatId`] = 'Please select at least one Telegram channel when a schedule is configured.';
    }
    if (!isCheckInOut && hasTelegramChannel && !hasSchedule) {
      nextErrors[`zone-${index}-schedule`] = 'Please select a schedule when a Telegram channel is selected.';
    }
    return nextErrors;
  };

  const persistZones = async ({ detectionName, priority, nextZones, lineOverride, laneName }) => {
    const polygons = nextZones.map(z => z.points.map(p => [p.x, p.y]));
    const fields = extraFieldsFor(activeType.settingType);
    const usesLineMode = activeType.settingType === 'lineCrossingSettings' || isCheckInOut;
    const toApiMode = (mode) => ((mode || 'entry') === 'both' ? 'all' : (mode || 'entry'));
    const lineInsideReferencePoint = activeType.settingType === 'lineCrossingSettings' && nextZones[0]?.insideReferencePoint
      ? [Number(nextZones[0].insideReferencePoint.x), Number(nextZones[0].insideReferencePoint.y)]
      : null;
    const lineCountMode = usesLineMode ? toApiMode(nextZones[0]?.countMode) : null;
    // Check-In / Check-Out: the polygon zones above are saved as usual; a single
    // crossing line + inside reference point ride alongside in their own keys.
    const line = lineOverride || lineZone;
    const checkInOutExtras = isCheckInOut
      ? {
          line_coordinates: (line.points || []).slice(0, 2).map(p => [p.x, p.y]),
          ...(line.insideReferencePoint
            ? { inside_reference_point: [
                Number(line.insideReferencePoint.x),
                Number(line.insideReferencePoint.y),
              ] }
            : {}),
          camType: ['checkin', 'checkout'],
          zone_name: laneName || activeType.setting?.settings?.zone_name || detectionName || undefined,
        }
      : null;
    const zoneConfigs = nextZones.map(z => ({
      telegramChatIds: Array.isArray(z.telegramChatIds)
        ? z.telegramChatIds.map(chatId => String(chatId || '').trim()).filter(Boolean)
        : (String(z.telegramChatId || '').trim() ? [String(z.telegramChatId).trim()] : []),
      name: z.name,
      telegramChatId: z.telegramChatId || undefined,
      ...(usesLineMode ? { count_mode: toApiMode(z.countMode) } : {}),
      ...(fields.includes('capacity') ? { capacity: z.capacity === '' ? undefined : Number(z.capacity) } : {}),
      ...(fields.includes('threshold') ? { threshold_sec: z.threshold === '' ? undefined : Number(z.threshold) } : {}),
      ...(fields.includes('company') && String(z.company ?? '').trim() !== '' ? { company: z.company } : {}),
      // startTime/endTime added only when fully selected in the schedule picker.
      ...buildScheduleFields(z.schedule),
    }));
    const savedDetectionName = isAttendanceDetection ? ATTENDANCE_DETECTION_NAME : detectionName;
    const savedSettingType = isAttendanceDetection ? ATTENDANCE_DETECTION_SETTING_TYPE : activeType.settingType;
    if (activeType.settingId) {
      const setting = activeType.setting;
      const fallbackTelegramChatId =
        nextZones.find(zone => Array.isArray(zone?.telegramChatIds) && zone.telegramChatIds.length)?.telegramChatIds?.[0] ||
        nextZones.find(zone => String(zone?.telegramChatId || '').trim())?.telegramChatId ||
        defaultTelegramChatId ||
        setting?.settings?.telegramChatId ||
        undefined;
      const fallbackTelegramChatIds = [
        ...new Set(
          nextZones.flatMap((zone) =>
            Array.isArray(zone?.telegramChatIds)
              ? zone.telegramChatIds.map((chatId) => String(chatId || '').trim()).filter(Boolean)
              : (String(zone?.telegramChatId || '').trim() ? [String(zone.telegramChatId).trim()] : []),
          ),
        ),
      ];
      await updateZoneDetectionSetting(activeType.settingId, {
        name: savedDetectionName ?? setting.name,
        settingType: savedSettingType,
        NVRId: cameraNvrId,
        enabled: setting.enabled,
        channelId: [camera._id],
        settings: {
          ...setting.settings,
          levelOfImportance: priority ?? setting.settings?.levelOfImportance,
          referencePoints: { ...setting.settings?.referencePoints, [camera._id]: polygons },
          zone_configs: zoneConfigs,
          telegramChatIds: fallbackTelegramChatIds,
          telegramChatId: fallbackTelegramChatId,
          ...(lineInsideReferencePoint ? { inside_reference_point: lineInsideReferencePoint } : {}),
          ...(lineCountMode ? { count_mode: lineCountMode } : {}),
          ...(checkInOutExtras || {}),
          videoResolution: [videoSize.w, videoSize.h],
        },
      });
    } else {
      const fallbackTelegramChatId =
        nextZones.find(zone => Array.isArray(zone?.telegramChatIds) && zone.telegramChatIds.length)?.telegramChatIds?.[0] ||
        nextZones.find(zone => String(zone?.telegramChatId || '').trim())?.telegramChatId ||
        defaultTelegramChatId ||
        undefined;
      const fallbackTelegramChatIds = [
        ...new Set(
          nextZones.flatMap((zone) =>
            Array.isArray(zone?.telegramChatIds)
              ? zone.telegramChatIds.map((chatId) => String(chatId || '').trim()).filter(Boolean)
              : (String(zone?.telegramChatId || '').trim() ? [String(zone.telegramChatId).trim()] : []),
          ),
        ),
      ];
      await createZoneDetectionSetting({
        name: savedDetectionName,
        settingType: savedSettingType,
        NVRId: cameraNvrId,
        channelId: [camera._id],
        enabled: true,
        settings: {
          levelOfImportance: priority,
          referencePoints: { [camera._id]: polygons },
          zone_configs: zoneConfigs,
          telegramChatIds: fallbackTelegramChatIds,
          telegramChatId: fallbackTelegramChatId,
          ...(lineInsideReferencePoint ? { inside_reference_point: lineInsideReferencePoint } : {}),
          ...(lineCountMode ? { count_mode: lineCountMode } : {}),
          ...(checkInOutExtras || {}),
          videoResolution: [videoSize.w, videoSize.h],
        },
        alerts: [],
      });
    }
  };

  // V1 always collects Detection Name / Priority in a modal before saving,
  // for both create and update â€” never a silent save. The zone(s) about to be
  // saved (including the in-progress polygon currently on the canvas) are
  // captured here too, so the modal can collect Capacity/Threshold for types
  // that need them right away, instead of requiring a second trip through the
  // Zone Settings panel after the zone already exists.
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingZones, setPendingZones] = useState([]);

  const effectiveLine = linePoints.length >= 3
    ? { points: linePoints.slice(0, 2), insideReferencePoint: linePoints[2] }
    : lineZone;
  const hasLine = effectiveLine.points.length >= 2 && !!effectiveLine.insideReferencePoint;

  const handleOpenSaveModal = () => {
    if (!activeType) return;
    // The in-progress polygon on the canvas is folded straight into the save,
    // so drawing once and hitting Save works without a separate commit step.
    if (zones.length === 0 && draftZones.length === 0 && points.length < minPointsToSave) return;
    if (isCheckInOut && !hasLine) {
      toast.error('Draw the crossing line and its inside reference point before saving.');
      return;
    }
    const nextZones = points.length >= minPointsToSave
      ? [...zones, ...draftZones, makeZoneFromPoints(points, zones.length + draftZones.length)]
      : [...zones, ...draftZones];
    setPendingZones(nextZones);
    setShowSaveModal(true);
  };

  const handleSubmitSave = async ({ detectionName, priority, zones: editedZones, laneName }) => {
    setSaving(true);
    try {
      await persistZones({ detectionName, priority, nextZones: editedZones, lineOverride: effectiveLine, laneName });
      setZones(editedZones);
      setDraftZones([]);
      setPoints([]);
      if (isCheckInOut) setLaneNameDraft(laneName || '');
      if (linePoints.length >= 3) {
        setLineZone(effectiveLine);
        setLinePoints([]);
      }
      setLineDrawing(false);
      presetAreaRef.current = false;
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

  // Rename/delete a single already-saved zone â€” a full save through the same
  // update path (V1's ZoneSettingsPanel does the same: it's a full PUT with
  // that one zone's entry filtered out or edited, not a separate endpoint).
  const [savingZoneIndex, setSavingZoneIndex] = useState(null);
  const [zoneFieldErrors, setZoneFieldErrors] = useState({});

  const handleSaveZoneName = async (index) => {
    if (!activeType?.settingId) return;
    const requiredErrors = validateZoneRequiredFields(zones[index], index);
    if (Object.keys(requiredErrors).length) {
      setZoneFieldErrors(prev => ({ ...prev, ...requiredErrors }));
      return;
    }
    const err = scheduleError(zones[index]?.schedule);
    if (err) { toast.error(err); return; }
    setSavingZoneIndex(index);
    try {
      await persistZones({ nextZones: zones, lineOverride: effectiveLine });
      toast.success('Zone updated.');
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to update zone.');
    } finally {
      setSavingZoneIndex(null);
    }
  };

  // Check-In / Check-Out's Line Name + Mode are edited together in the Zone
  // Settings panel behind one Save button — typing/selecting only updates
  // local drafts; nothing persists until Save is clicked.
  const [savingMode, setSavingMode] = useState(false);
  const [modeDraft, setModeDraft] = useState('entry');
  const [laneNameError, setLaneNameError] = useState('');

  useEffect(() => {
    setModeDraft(zones[0]?.countMode || 'entry');
  }, [zones]);

  const handleLaneNameDraftChange = (value) => {
    setLaneNameDraft(value);
    if (value.trim()) setLaneNameError('');
  };

  const handleSaveCheckInOutHeader = async () => {
    const trimmed = laneNameDraft.trim();
    if (!trimmed) {
      setLaneNameError('Line Name is required.');
      return;
    }
    const nextZones = zones.map(z => ({ ...z, countMode: modeDraft }));
    setZones(nextZones);
    if (!activeType?.settingId) return;
    setSavingMode(true);
    try {
      await persistZones({ nextZones, lineOverride: effectiveLine, laneName: trimmed });
      toast.success('Line settings updated.');
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to update line settings.');
    } finally {
      setSavingMode(false);
    }
  };

  // Deleting a zone is destructive and can't be undone, so it goes through
  // the same confirm-modal pattern as the area reset / clear-all below
  // instead of firing straight off the trash icon click.
  const [zoneDeleteIndex, setZoneDeleteIndex] = useState(null);
  const requestDeleteZone = (index) => {
    if (!canDeleteDetection) {
      toast.error("You don't have permission to delete zones.");
      return;
    }
    setZoneDeleteIndex(index);
  };

  const handleDeleteZone = async () => {
    const index = zoneDeleteIndex;
    if (index === null) return;
    const nextZones = zones.filter((_, i) => i !== index);
    if (!activeType?.settingId) {
      setZones(nextZones); // never saved â€” just drop it locally
      if (isCheckInOut && nextZones.length === 0) {
        setLineZone({ points: [], insideReferencePoint: null });
        setLaneNameDraft('');
      }
      setZoneDeleteIndex(null);
      return;
    }
    setSavingZoneIndex(index);
    try {
      // Check-In / Check-Out needs at least one zone to mean anything â€” deleting
      // the last one removes the whole detection setting (line included)
      // instead of leaving an orphaned line with zero zones behind it.
      if (isCheckInOut && nextZones.length === 0) {
        await deleteZoneDetectionSetting(activeType.settingId);
        setZones([]);
        setLineZone({ points: [], insideReferencePoint: null });
        setLaneNameDraft('');
        toast.success('Detection settings reset successfully.');
      } else {
        await persistZones({ nextZones, lineOverride: effectiveLine });
        setZones(nextZones);
        toast.success('Zone deleted.');
      }
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to delete zone.');
    } finally {
      setSavingZoneIndex(null);
      setZoneDeleteIndex(null);
    }
  };

  // "Reset Detection UI" â€” same DELETE /detection-settings/:id V1 uses
  // under that label (Innersettings.jsx â†’ ResetConfirmationDialog). Removes the
  // whole DetectionSetting doc and unlinks it from every camera referencing it,
  // not just this one.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteArea = async () => {
    if (!activeType?.settingId || !canDeleteDetection) return;
    setDeleting(true);
    try {
      await deleteZoneDetectionSetting(activeType.settingId);
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

  // â”€â”€ Alert Recipients (scoped to the selected detection type) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const recipientsApi = useApi(() => fetchAlertRecipients({ limit: 200 }), []);
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
      await updateDetectionAlerts(activeType.settingId, nextIds);
    } catch {
      // Keep the optimistic local state â€” a retry (add/remove again) will resend the full list.
    } finally {
      setSavingAlerts(false);
    }
  };

  const addRecipient = (id) => { if (id) persistAlerts([...alertIds, id]); };
  const removeRecipient = (id) => persistAlerts(alertIds.filter(x => x !== id));

  return (
    <div style={{ padding: embedded ? 0 : 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!embedded && (
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
              {camera.ipAddress || 'â€”'} Â· Zone Marking
            </div>
          </div>
          {canDeleteDetection && (
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
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: embedded ? '1fr' : '1fr 320px', gap: 18, alignItems: 'start' }}>
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
              {selectedSettingType ? (
                <div style={{
                  height: 42, display: 'flex', alignItems: 'center', padding: '0 13px',
                  borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--blue)',
                  fontSize: 12.5, color: 'var(--tx2)',
                  boxShadow: '0 0 0 3px rgba(59,130,246,.14)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {typeLabels[selectedSettingType] || activeType?.label || selectedSettingType}
                </div>
              ) : allTypes.length === 0 ? (
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

            {/* Detection Name â€” read-only, populated once a zone has been saved (V1 parity). Zone names now live per-zone in the Zone Settings panel. */}
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
                  {activeType.setting?.name || 'â€”'}
                </div>
              </div>
            )}
          </div>

          {activeType && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: -6, marginBottom: 14, fontSize: 10.5, color: activeType.configured ? 'var(--ok)' : 'var(--tx3)' }}>
              {activeType.configured
                ? <><CheckCircle2 size={12} /> Already configured for this camera</>
                : 'Not configured yet saving a zone will create it'}
            </div>
          )}

          <div
            ref={stageRef}
            onClick={handleStageClick}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onPointerLeave={handleStagePointerUp}
            style={{
              position: 'relative', borderRadius: isFullscreen ? 0 : 12, overflow: 'hidden', aspectRatio: isFullscreen ? 'auto' : '16/9',
              width: isFullscreen ? '100vw' : undefined, height: isFullscreen ? '100vh' : undefined,
              background: '#0a0e15',
              cursor: (drawing || lineDrawing) ? 'crosshair' : points.length > 0 ? 'grab' : 'default',
              border: '1px solid var(--bd)',
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

            {/* Buffering overlay â€” shown while the stream connects, instead of a blank box.
                Same look as PlaybackTimeline.jsx's buffering state (Wifi icon + blink). */}
            {url && videoState === 'loading' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.82)', zIndex: 2 }}>
                <BufferingIndicator />
              </div>
            )}

            {(!url || videoState === 'error') && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.35)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                {!url ? 'No stream configured' : 'Stream unavailable'}
              </div>
            )}

            {/* Points cap + fullscreen pill ? top-right, matching V1. Line
                Crossing is always exactly 2 points, so the +/- stepper (which
                adjusts a polygon's point cap) doesn't apply and is hidden. */}
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 6, zIndex: 3 }}>
              {!isLineCrossing && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); decreaseMaxPoints(); }}
                    title="Decrease max points (-)"
                    style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={13} />
                  </button>
                  <span style={{ padding: '4px 9px', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, fontFamily: 'var(--mono)', borderRadius: 6 }}>
                    {maxPoints}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); increaseMaxPoints(); }}
                    title="Increase max points (+)"
                    style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={13} />
                  </button>
                </>
              )}
              <button
                onClick={handleToggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen (F)'}
                style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            </div>

            {/* Zone overlay â€” points are native video pixels, scaled into a 1000x1000 box.
                Committed zones render in amber (matching V1's saved-zone labels); the in-progress
                shape renders in blue so it's visually distinct while drawing. Line Crossing draws
                an open line (polyline, no fill) instead of a closed filled polygon â€” it's a
                crossing line, not an area. */}
            {isFullscreen && (
              <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 8 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullscreenActionsOpen(open => !open);
                  }}
                  title="Drawing actions"
                  aria-label="Drawing actions"
                  aria-expanded={fullscreenActionsOpen}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,.18)',
                    background: 'rgba(5,8,13,.72)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 12px 34px rgba(0,0,0,.35)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <MoreVertical size={18} />
                </button>

                {fullscreenActionsOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: 44,
                      width: 178,
                      padding: 6,
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,.16)',
                      background: 'rgba(5,8,13,.9)',
                      boxShadow: '0 18px 48px rgba(0,0,0,.45)',
                      backdropFilter: 'blur(10px)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    {[
                      { label: 'Max Area', icon: Maximize2, disabled: !canUseAreaPreset, onClick: handleMaxArea },
                      { label: 'Min Area', icon: Minimize2, disabled: !canUseAreaPreset, onClick: handleMinArea },
                      {
                        label: drawing ? 'Stop Drawing' : 'Start Drawing',
                        icon: Pencil,
                        disabled: !canUseDrawing,
                        onClick: () => setDrawing(d => !d),
                      },
                      { label: 'Undo', icon: Undo2, disabled: !canUseUndo, onClick: handleUndo },
                      { label: 'Clear All', icon: Trash2, disabled: !canUseClearAll, onClick: handleConfirmClearAll },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          disabled={item.disabled}
                          onClick={(event) => {
                            if (item.disabled) return;
                            runFullscreenAction(event, item.onClick);
                          }}
                          style={{
                            height: 34,
                            width: '100%',
                            border: 0,
                            borderRadius: 7,
                            padding: '0 9px',
                            background: item.disabled ? 'transparent' : 'rgba(255,255,255,.06)',
                            color: item.disabled ? 'rgba(255,255,255,.34)' : '#fff',
                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'left',
                          }}
                        >
                          <Icon size={14} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            >
              {videoSize.w > 0 && zones.map((z, zi) => (
                <g key={zi} opacity={1}>
                  {z.points.length > 1 && (
                    isLineCrossing ? (
                      <polyline
                        points={polygonPointsAttr(z.points.slice(0, 2), videoSize.w, videoSize.h, 1000, 1000)}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    ) : (
                      <polygon
                        points={polygonPointsAttr(z.points, videoSize.w, videoSize.h, 1000, 1000)}
                        fill="rgba(245,158,11,.18)"
                        stroke="#f59e0b"
                        strokeWidth="3.5"
                      />
                    )
                  )}
                  {z.points.map((p, i) => (
                    <circle key={i} cx={(p.x / videoSize.w) * 1000} cy={(p.y / videoSize.h) * 1000} r="6" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
                  ))}
                  {isLineCrossing && z.insideReferencePoint && (
                    <>
                      <circle
                        cx={(z.insideReferencePoint.x / videoSize.w) * 1000}
                        cy={(z.insideReferencePoint.y / videoSize.h) * 1000}
                        r="9"
                        fill="#22c55e"
                        stroke="#fff"
                        strokeWidth="2.5"
                      />
                      <text
                        x={(z.insideReferencePoint.x / videoSize.w) * 1000 + 12}
                        y={(z.insideReferencePoint.y / videoSize.h) * 1000 - 12}
                        fill="#22c55e"
                        fontSize="24"
                        fontWeight="700"
                      >
                        Inside Reference Point
                      </text>
                    </>
                  )}
                </g>
              ))}

              {/* Check-In / Check-Out crossing line + inside reference point */}
              {isCheckInOut && videoSize.w > 0 && (() => {
                const committed = lineZone.points.length >= 2;
                const linePts = committed ? lineZone.points : linePoints.slice(0, 2);
                const refPt = committed
                  ? lineZone.insideReferencePoint
                  : (linePoints.length >= 3 ? linePoints[2] : null);
                const stroke = committed ? '#f59e0b' : 'var(--blue)';
                return (
                  <g>
                    {linePts.length > 1 && (
                      <polyline
                        points={polygonPointsAttr(linePts, videoSize.w, videoSize.h, 1000, 1000)}
                        fill="none"
                        stroke={stroke}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                      />
                    )}
                    {linePts.map((p, i) => (
                      <circle key={`ln-${i}`} cx={(p.x / videoSize.w) * 1000} cy={(p.y / videoSize.h) * 1000} r="11" fill={stroke} stroke="#fff" strokeWidth="3" />
                    ))}
                    {refPt && (
                      <>
                        <circle cx={(refPt.x / videoSize.w) * 1000} cy={(refPt.y / videoSize.h) * 1000} r="10" fill="#22c55e" stroke="#fff" strokeWidth="2.5" />
                        <text x={(refPt.x / videoSize.w) * 1000 + 12} y={(refPt.y / videoSize.h) * 1000 - 12} fill="#22c55e" fontSize="24" fontWeight="700">
                          Inside Reference Point
                        </text>
                      </>
                    )}
                  </g>
                );
              })()}

              {draftZones.map((z, zi) => (
                <g key={`draft-${zi}`} opacity={1}>
                  {z.points.length > 1 && (
                    <polygon
                      points={polygonPointsAttr(z.points, videoSize.w, videoSize.h, 1000, 1000)}
                      fill="rgba(59,130,246,.16)"
                      stroke="var(--blue)"
                      strokeWidth="3.5"
                    />
                  )}
                  {z.points.map((p, i) => (
                    <circle key={i} cx={(p.x / videoSize.w) * 1000} cy={(p.y / videoSize.h) * 1000} r="6" fill="var(--blue)" stroke="#fff" strokeWidth="2" />
                  ))}
                </g>
              ))}
              {points.length > 1 && (
                isLineCrossing ? (
                  <polyline
                    points={polygonPointsAttr(points.slice(0, 2), videoSize.w, videoSize.h, 1000, 1000)}
                    fill="none"
                    stroke="var(--blue)"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                ) : (
                  <polygon
                    points={polygonPointsAttr(points, videoSize.w, videoSize.h, 1000, 1000)}
                    fill="rgba(59,130,246,.22)"
                    stroke="var(--blue)"
                    strokeWidth="4"
                  />
                )
              )}
              {videoSize.w > 0 && points.map((p, i) => (
                // Line Crossing's endpoints are draggable, so they render larger
                // than a regular in-progress polygon vertex â€” bigger = "grab me".
                <g key={i}>
                  <circle
                    cx={(p.x / videoSize.w) * 1000}
                    cy={(p.y / videoSize.h) * 1000}
                    r={isLineCrossing ? (i === 2 ? 10 : 12) : 8}
                    fill={isLineCrossing && i === 2 ? '#22c55e' : 'var(--blue)'}
                    stroke="#fff"
                    strokeWidth={isLineCrossing ? 3 : 2.5}
                  />
                  {isLineCrossing && i === 2 && (
                    <text
                      x={(p.x / videoSize.w) * 1000 + 12}
                      y={(p.y / videoSize.h) * 1000 - 12}
                      fill="#22c55e"
                      fontSize="24"
                      fontWeight="700"
                    >
                      Inside Reference Point
                    </text>
                  )}
                </g>
              ))}
            </svg>

            {/* Zone name labels â€” plain HTML pills positioned over each committed zone's first point, matching V1's on-canvas labels */}
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
                  opacity: 1,
                }}
              >
                {z.name}
              </span>
            ))}

            {/* Line name pill — sits over the crossing line's first point, same
                treatment as the zone-name pills above. */}
            {isCheckInOut && videoSize.w > 0 && lineZone.points[0] && laneNameDraft && (
              <span
                style={{
                  position: 'absolute',
                  left: `${(lineZone.points[0].x / videoSize.w) * 100}%`,
                  top: `${(lineZone.points[0].y / videoSize.h) * 100}%`,
                  transform: 'translate(-4px, -130%)',
                  background: '#f59e0b', color: '#111', fontSize: 10.5, fontWeight: 700,
                  padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 3,
                }}
              >
                {laneNameDraft}
              </span>
            )}

            {zones.length === 0 && draftZones.length === 0 && points.length === 0 && !hasLineContent && videoState !== 'loading' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(220,232,255,.85)',
                  background: 'rgba(8,11,17,.6)', border: '1px solid rgba(255,255,255,.15)',
                  borderRadius: 20, padding: '6px 14px',
                }}>
                  {isCheckInOut
                    ? 'click "Draw Line" for the crossing line + inside reference point, then "Start Drawing" for the gate zones'
                    : isLineCrossing
                    ? 'click "Draw Line", then click two line endpoints and one inside reference point'
                    : 'click "Start Drawing", then click to place zone points'}
                </span>
              </div>
            )}
          </div>

          <ZoneToolbar
            activeType={activeType}
            isLineCrossing={isLineCrossing}
            isCheckInOut={isCheckInOut}
            lineDrawing={lineDrawing}
            onDrawLine={startLineDrawing}
            drawing={drawing}
            setDrawing={(updater) => {
              setLineDrawing(false);
              setDrawing(updater);
            }}
            videoSize={videoSize}
            points={points}
            draftZones={draftZones}
            zones={zones}
            hasLineContent={hasLineContent}
            minPointsToSave={minPointsToSave}
            saving={saving}
            onMaxArea={handleMaxArea}
            onMinArea={handleMinArea}
            onUndo={handleUndo}
            onClearAll={handleClearAllClick}
            onSave={handleOpenSaveModal}
          />
        </div>

        {/* Right rail */}
        {!embedded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, padding: 16 }}>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Device Detail</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>MODEL</span>
                  <span style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right' }}>{camera.model || 'â€”'}</span>
                </div>
                <div style={{ height: 1, background: 'var(--bd)' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>NVR</span>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{camera.nvrId?.nvrName || 'â€”'}</span>
                </div>
                <div style={{ height: 1, background: 'var(--bd)' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>IP ADDRESS</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500, color: 'var(--cyan)' }}>{camera.ipAddress || 'â€”'}</span>
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
                onDelete={requestDeleteZone}
                savingIndex={savingZoneIndex}
                canDelete={canDeleteDetection}
                errors={zoneFieldErrors}
                isLineCrossing={isLineCrossing}
                isCheckInOut={isCheckInOut}
                laneName={laneNameDraft}
                onLaneNameChange={handleLaneNameDraftChange}
                laneNameError={laneNameError}
                detectionMode={modeDraft}
                onDetectionModeChange={setModeDraft}
                onSaveHeader={handleSaveCheckInOutHeader}
                detectionModeSaving={savingMode}
                telegramChannels={telegramChannels}
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
                      <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Loading recipientsâ€¦</div>
                    ) : recipientsApi.error ? (
                      <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Couldn't load recipients.</div>
                    ) : addableRecipients.length === 0 && allRecipients.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>No verified recipients yet â€” add one under Alert Recipients.</div>
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
                          <option value="__add">+ Add recipientâ€¦</option>
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
        )}
      </div>

      {embedded && zoneSettingsOpen && activeType && createPortal(
        <div
          onClick={onZoneSettingsClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(6,9,15,.62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 720, maxHeight: '85vh', overflowY: 'auto',
              background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 16,
              padding: 18, boxShadow: '0 24px 64px rgba(0,0,0,.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15.5, color: 'var(--tx)' }}>
                  {isLineCrossing ? 'Line Settings' : 'Zone Settings'}
                </div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeType.label}
                </div>
              </div>
              <button
                type="button"
                onClick={onZoneSettingsClose}
                style={{
                  marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--bd)',
                  background: 'var(--bg2)', color: 'var(--tx2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>

            {zones.length > 0 ? (
              <ZoneSettingsPanel
                zones={zones}
                extraFields={extraFieldsFor(activeType.settingType)}
                activeIndex={activeZoneIndex}
                onSetActive={setActiveZoneIndex}
                onUpdateField={handleUpdateZoneField}
                onSave={handleSaveZoneName}
                onDelete={requestDeleteZone}
                savingIndex={savingZoneIndex}
                canDelete={canDeleteDetection}
                errors={zoneFieldErrors}
                isLineCrossing={isLineCrossing}
                isCheckInOut={isCheckInOut}
                laneName={laneNameDraft}
                onLaneNameChange={handleLaneNameDraftChange}
                laneNameError={laneNameError}
                detectionMode={modeDraft}
                onDetectionModeChange={setModeDraft}
                onSaveHeader={handleSaveCheckInOutHeader}
                detectionModeSaving={savingMode}
                telegramChannels={telegramChannels}
              />
            ) : (
              <div style={{ border: '1px solid var(--bd)', borderRadius: 12, padding: '30px 18px', textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>
                No zones saved for this camera and detection type.
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {showSaveModal && activeType && (
        <SaveDetectionAreaModal
          initialName={isAttendanceDetection ? ATTENDANCE_DETECTION_NAME : (activeType.setting?.name || `${activeType.label} for ${camera.customName || camera.name}`)}
          initialPriority={activeType.setting?.settings?.levelOfImportance || 'moderate'}
          initialLaneName={laneNameDraft}
          zones={pendingZones}
          extraFields={extraFieldsFor(activeType.settingType)}
          isLineCrossing={isLineCrossing}
          isCheckInOut={isCheckInOut}
          saving={saving}
      onCancel={() => setShowSaveModal(false)}
      onSubmit={handleSubmitSave}
      telegramChannels={telegramChannels}
    />
      )}

      <ConfirmDialog
        open={showDeleteConfirm && !!activeType}
        title="Reset Detection UI?"
        busy={deleting}
        busyLabel="Resetting..."
        confirmLabel="Reset Anyway"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteArea}
      >
        <strong>Warning:</strong> This will reset all detection settings to their default values. This action cannot be undone.
      </ConfirmDialog>

      <ConfirmDialog
        open={showClearConfirm && !!activeType}
        title="Clear Detection Area"
        confirmLabel="Clear All"
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClearAll}
      >
        This will clear the current drawing from the editor only. Saved detection settings, schedules, and recipients will stay unchanged.
      </ConfirmDialog>

      <ConfirmDialog
        open={zoneDeleteIndex !== null}
        title="Delete Zone?"
        busy={savingZoneIndex === zoneDeleteIndex}
        busyLabel="Deleting..."
        confirmLabel="Delete Zone"
        onCancel={() => setZoneDeleteIndex(null)}
        onConfirm={handleDeleteZone}
      >
        Are you sure you want to delete <strong>{zones[zoneDeleteIndex]?.name || 'this zone'}</strong>? <strong>This action cannot be undone.</strong>
      </ConfirmDialog>
    </div>
  );
}

