import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Video, ChevronRight, ChevronDown, Play, X, Loader2, ListRestart } from 'lucide-react';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import ConfirmationModal from '../../../components/DeleteConfirmation';
import { useApi } from '../../../hooks/useApi';
import { usePermissions } from '@/context/PermissionContext';
import { getChannels, getNvrs, getDetectionTypes, toggleChannelDetection, updateChannel, getCamerasByNvr, resetDetectionThresholdsBatch } from '../../../helpers/configure';
import { Popover, PopoverTrigger, PopoverContent } from '../../../pages/AttendanceLogs/components/Popover';
import MultiSelect from '../../../components/MultiSelect';
import CameraStream from '../../../components/CameraStream';
import DetectionLimitDialog from '../../../components/DetectionLimitDialog';
import NoDetectionLicense from '../../../components/NoDetectionLicense';
import { licenseErrorFrom } from '../../../helpers/license';
import DetectionZoneMarking from './DetectionZoneMarking';
import { ATTENDANCE_DETECTION_NAME, isAttendanceDetectionType } from './DetectionZoneMarking/constants';

const CHECK_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'checkout', label: 'Check-out' },
];

const CAM_TYPE_FILTERS = [
  { value: '', label: 'All Camera Types' },
  ...CHECK_TYPES,
];

// Applied Types popover shows its search box only once the type list is long
// enough to scroll — matches the ~5 rows the popover fits at its 220px cap.
const TYPE_SEARCH_MIN = 6;
const TYPE_SEARCH_DEBOUNCE_MS = 300;

function mergeCameraStreamFields(nextCamera, previousCamera) {
  if (!nextCamera || !previousCamera) return nextCamera;
  return {
    ...nextCamera,
    streamingUrl: nextCamera.streamingUrl || previousCamera.streamingUrl,
    StreamingUrl: nextCamera.StreamingUrl || previousCamera.StreamingUrl,
    localChannelId: nextCamera.localChannelId || previousCamera.localChannelId,
    config: {
      ...(previousCamera.config || {}),
      ...(nextCamera.config || {}),
      StreamingUrl: nextCamera.config?.StreamingUrl || previousCamera.config?.StreamingUrl,
    },
  };
}

function nvrIdOf(camera) {
  return camera?.nvrId?._id || camera?.nvrId || camera?.NVRId || camera?.nvr?._id || camera?.nvr;
}

function streamableCamera(camera) {
  const nvrId = nvrIdOf(camera);
  const channelId = camera?._id || camera?.id || camera?.channelId;
  return {
    ...camera,
    streamingUrl: camera?.streamingUrl || camera?.StreamingUrl || (nvrId && channelId ? `stream/${nvrId}-${channelId}/playlist.m3u8` : ''),
  };
}

function isTypeEnabled(camera, key) {
  return !!camera?.detections?.[key]?.enabled;
}

function detectionSettingFromEntry(entry) {
  return entry?.id && typeof entry.id === 'object' ? entry.id : null;
}

function detectionSettingIdFromEntry(entry) {
  const setting = detectionSettingFromEntry(entry);
  return setting?._id || setting?.id || entry?.detectionSettingId || (typeof entry?.id === 'string' ? entry.id : '');
}

function detectionTypeLabel(value, fallback) {
  if (isAttendanceDetectionType(fallback) || isAttendanceDetectionType(value?.settingType || value?.detectionType || value?.key || value?.id || value?.name || value)) {
    return ATTENDANCE_DETECTION_NAME;
  }
  if (typeof value === 'string') return value;
  return value?.displayName || value?.label || value?.name || value?.id?.displayName || value?.id?.name || fallback;
}

/**
 * `search` is only for the camera-only fallback tail below — the catalogue
 * itself arrives already filtered from GET /detection-settings/types?search=.
 * Those tail entries come from camera.detections, which the types endpoint
 * knows nothing about, so without this a narrowed catalogue would push every
 * non-matching camera key into the tail and defeat the search.
 */
function appliedTypesFor(camera, typeLabels, search = '') {
  const entries = Array.isArray(typeLabels)
    ? typeLabels.map((type, index) => [
        type?.settingType || type?.detectionType || type?.key || type?.id || `type-${index}`,
        type,
      ])
    : Object.entries(typeLabels || {});

  const knownKeys = new Set(entries.map(([key]) => key));
  const normalizedSearch = search.trim().toLowerCase();
  // Keep camera-configured types visible even if the catalogue endpoint is
  // temporarily incomplete or the backend has a newer type than the catalogue.
  const cameraEntries = Object.entries(camera?.detections || {})
    .filter(([key]) => key && !knownKeys.has(key))
    .filter(([key, value]) => !normalizedSearch
      || key.toLowerCase().includes(normalizedSearch)
      || String(detectionTypeLabel(value, key)).toLowerCase().includes(normalizedSearch))
    .map(([key, value], index) => [key, value, entries.length + index]);

  const masterList = [
    ...entries.map(([key, value], index) => [key, value, index]),
    ...cameraEntries,
  ].map(([key, value, order]) => ({
    key,
    label: detectionTypeLabel(value, key),
    enabled: isTypeEnabled(camera, key),
    // Set server-side (channels.service.js getAllChannels) alongside `enabled`:
    // true when a camera-specific or NVR-level global schedule governs this
    // detector, regardless of whether it happens to be active right now.
    isScheduled: !!camera?.detections?.[key]?.isScheduled,
    settingId: detectionSettingIdFromEntry(camera?.detections?.[key]),
    order,
  }))
    .filter(type => type.key && type.label);

  return masterList.filter(type => !isAttendanceDetectionType(type.key || type.label)).sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.order - b.order;
  });
}

function enabledTypesFor(camera, typeLabels) {
  return appliedTypesFor(camera, typeLabels).filter(type => type.enabled);
}

// Every type with a zone (a saved DetectionSetting) configured, whether or not
// it's currently enabled — the Engines column shows one chip per zone that
// exists, colour-coded by zoneStatusOf, instead of only the running ones.
// Named distinctly from DetectionZoneMarking/utils.js's zonesFor(), which
// returns a setting's drawn polygon areas — a different "zone".
function configuredZoneTypesFor(camera, typeLabels) {
  return appliedTypesFor(camera, typeLabels).filter(type => !!type.settingId);
}

/**
 * running   — the detector is on right now.
 * scheduled — a zone exists and a schedule governs it, but it isn't running
 *             at this instant (outside its window, or an override paused it).
 * idle      — a zone exists but nothing is running or scheduled for it.
 */
function zoneStatusOf(type) {
  if (type.enabled) return 'running';
  if (type.isScheduled) return 'scheduled';
  return 'idle';
}

function resettableTypesFor(camera, typeLabels) {
  return enabledTypesFor(camera, typeLabels).filter(type => type.settingId);
}

function resetBatchEntries(result) {
  const data = result?.data || result?.body?.data || result || {};
  const entries = data.resetSettings || data.results || data.resetResults || data.detectionSettings || data.settings || data.items || [];
  return Array.isArray(entries) ? entries : [];
}

function resetThresholdsFromEntry(entry) {
  const detectionSetting = entry?.detectionSetting || entry?.setting || entry;
  return entry?.resetThresholds || entry?.thresholds || detectionSetting?.modelThresholds || detectionSetting?.settings || {};
}

function patchCameraWithResetThresholds(camera, result) {
  const entries = resetBatchEntries(result);
  if (!entries.length) return camera;

  const nextDetections = { ...(camera?.detections || {}) };
  let changed = false;

  entries.forEach((entry) => {
    const detectionSetting = entry?.detectionSetting || entry?.setting || entry;
    const settingId = detectionSetting?._id || detectionSetting?.id || entry?.detectionSettingId || entry?.id;
    const settingType = detectionSetting?.settingType || entry?.settingType;
    if (!settingId && !settingType) return;

    const match = Object.entries(nextDetections).find(([key, value]) => {
      if (settingType && key === settingType) return true;
      return String(detectionSettingIdFromEntry(value)) === String(settingId);
    });
    if (!match) return;

    const [key, currentEntry] = match;
    const currentSetting = detectionSettingFromEntry(currentEntry);
    const resetThresholds = resetThresholdsFromEntry(entry);
    const nextSetting = currentSetting || detectionSetting
      ? {
          ...(currentSetting || {}),
          ...(detectionSetting || {}),
          settings: {
            ...(currentSetting?.settings || {}),
            ...(detectionSetting?.settings || {}),
            ...(resetThresholds || {}),
          },
          modelThresholds: {
            ...(currentSetting?.modelThresholds || {}),
            ...(detectionSetting?.modelThresholds || {}),
            ...(resetThresholds || {}),
          },
          uiData: {
            ...(currentSetting?.uiData || {}),
            ...(detectionSetting?.uiData || {}),
            settings: {
              ...(currentSetting?.uiData?.settings || {}),
              ...(detectionSetting?.uiData?.settings || {}),
              ...(detectionSetting?.settings || {}),
              ...(resetThresholds || {}),
            },
          },
        }
      : currentEntry?.id;

    nextDetections[key] = {
      ...(typeof currentEntry === 'object' ? currentEntry : {}),
      id: nextSetting,
    };
    changed = true;
  });

  return changed ? { ...camera, detections: nextDetections } : camera;
}

function detectionInitials(label) {
  if (!label || typeof label !== 'string') return '';
  return label
    .split(/[\s&/-]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

// Background/border are fixed rgba tints (not theme-scoped) matching every
// other tinted badge in this file (e.g. the Applied Types trigger below);
// the text/icon colour is the theme-aware "-ink" token so each stays legible
// on both a near-white and a near-black row.
const ZONE_STATUS_STYLE = {
  running: {
    border: '1px solid rgba(34,197,94,.32)',
    background: 'rgba(34,197,94,.1)',
    color: 'var(--ok-ink)',
  },
  scheduled: {
    border: '1px solid rgba(245,166,35,.34)',
    background: 'rgba(245,166,35,.12)',
    color: 'var(--warn-ink)',
  },
  idle: {
    border: '1px solid rgba(148,163,184,.3)',
    background: 'rgba(148,163,184,.12)',
    color: 'var(--tx3)',
  },
};

const ZONE_STATUS_TOOLTIP = {
  running: 'Running now',
  scheduled: 'Scheduled — not running right now',
  idle: 'Zone created — not running or scheduled',
};

/**
 * Key for the Engines column's colour coding, so the chips don't rely on a
 * hover to be readable. Swatch colours and hover text are read from
 * ZONE_STATUS_STYLE / ZONE_STATUS_TOOLTIP rather than restated, so the legend
 * can never drift from the chips it explains — add a status there and it only
 * needs a label here.
 */
const ZONE_STATUS_LEGEND = [
  { status: 'running', label: 'Running' },
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'idle', label: 'Zone only' },
];

function ZoneStatusLegend() {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 13, marginLeft: 'auto', flexWrap: 'wrap',
      }}
    >
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>
        ENGINES
      </span>
      {ZONE_STATUS_LEGEND.map(({ status, label }) => (
        <span
          key={status}
          title={ZONE_STATUS_TOOLTIP[status]}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11.5, color: 'var(--tx2)', whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 9, height: 9, borderRadius: 999, flexShrink: 0,
              background: ZONE_STATUS_STYLE[status].color,
            }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

// Tooltip geometry. TIP_MAX_W matches the bubble's maxWidth so the clamp below
// can keep it inside the viewport; TIP_MIN_ROOM is roughly the tallest the
// bubble gets (label + status line), used to decide whether it fits above.
const TIP_MAX_W = 220;
const TIP_GAP = 10;
const TIP_EDGE = 8;
const TIP_MIN_ROOM = 76;

/** Engine initials chip with a hover tooltip naming the detection and its state.
 *
 * The bubble is rendered into a body portal rather than absolutely inside the
 * chip: the table card is overflow:hidden, which clipped the tooltip on the top
 * row (it could only grow upward into the header). Same reason the popovers on
 * this page portal — see AppliedTypesPopover below. */
function EngineChip({ label, status = 'idle', onSelect }) {
  const [tip, setTip] = useState(null);
  const chipRef = useRef(null);
  const palette = ZONE_STATUS_STYLE[status] || ZONE_STATUS_STYLE.idle;

  const showTip = () => {
    const rect = chipRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centre = rect.left + rect.width / 2;
    const half = TIP_MAX_W / 2;
    // Keep the bubble inside the viewport even for chips near either edge.
    const left = Math.min(
      Math.max(centre, half + TIP_EDGE),
      window.innerWidth - half - TIP_EDGE
    );
    // Not enough room above (top row, or a scrolled-up page) — flip below.
    const flip = rect.top < TIP_MIN_ROOM + TIP_GAP;

    setTip({
      left,
      top: flip ? rect.bottom + TIP_GAP : rect.top - TIP_GAP,
      flip,
      // Clamping moves the bubble but not the chip, so offset the arrow to keep
      // it pointing at what it describes.
      arrow: centre - left,
    });
  };

  // Fixed coordinates go stale the moment the page moves, and a bubble with
  // pointerEvents:none never gets the mouseleave that would normally close it.
  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tip]);

  return (
    <span
      ref={chipRef}
      onMouseEnter={showTip}
      onMouseLeave={() => setTip(null)}
      style={{ display: 'inline-flex' }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.();
        }}
        title={`Open ${label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 24,
          minWidth: 38,
          padding: '0 9px',
          borderRadius: 999,
          border: palette.border,
          background: palette.background,
          color: palette.color,
          fontSize: 11.5,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {detectionInitials(label)}
      </button>
      {tip &&
        createPortal(
          <span
            style={{
              position: 'fixed',
              left: tip.left,
              top: tip.top,
              transform: `translate(-50%, ${tip.flip ? '0' : '-100%'})`,
              zIndex: 9999,
              width: 'max-content',
              maxWidth: TIP_MAX_W,
              padding: '7px 10px',
              borderRadius: 10,
              background: 'var(--tooltip)',
              color: 'var(--tx)',
              border: '1px solid var(--bd2)',
              fontSize: 11.5,
              fontWeight: 600,
              lineHeight: 1.35,
              textAlign: 'center',
              boxShadow: '0 12px 28px rgba(15,23,42,.24)',
              pointerEvents: 'none',
              whiteSpace: 'normal',
              backdropFilter: 'blur(8px)',
            }}
          >
            {label}
            <span style={{ display: 'block', marginTop: 3, fontSize: 10, fontWeight: 500, color: 'var(--tx3)' }}>
              {ZONE_STATUS_TOOLTIP[status]}
            </span>
            <span
              style={{
                position: 'absolute',
                left: `calc(50% + ${tip.arrow}px)`,
                ...(tip.flip
                  ? { bottom: '100%', marginBottom: -5, borderLeft: '1px solid var(--bd2)', borderTop: '1px solid var(--bd2)' }
                  : { top: '100%', marginTop: -5, borderRight: '1px solid var(--bd2)', borderBottom: '1px solid var(--bd2)' }),
                width: 10,
                height: 10,
                background: 'var(--tooltip)',
                transform: 'translateX(-50%) rotate(45deg)',
                backdropFilter: 'blur(8px)',
              }}
            />
          </span>,
          document.body
        )}
    </span>
  );
}

function EngineFilterDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedValues = Array.isArray(value) ? value : [];
  const selectedOptions = options.filter(option => selectedValues.includes(option.value));
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter(option => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);
  const triggerLabel = !selectedOptions.length
    ? 'All Engines'
    : selectedOptions.length === 1
      ? selectedOptions[0].label
      : `${selectedOptions.length} Engines Selected`;

  const toggleValue = (nextValue) => {
    if (selectedValues.includes(nextValue)) {
      onChange(selectedValues.filter(valueItem => valueItem !== nextValue));
      return;
    }
    onChange([...selectedValues, nextValue]);
  };

  const selectAllFiltered = () => {
    const merged = [...new Set([...selectedValues, ...filteredOptions.map(option => option.value)])];
    onChange(merged);
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          style={{
            height: 40,
            minWidth: 150,
            padding: '0 34px 0 13px',
            borderRadius: 10,
            background: 'var(--bg2)',
            border: '1px solid var(--bd)',
            fontSize: 13,
            color: selectedOptions.length ? 'var(--tx)' : 'var(--tx3)',
            cursor: 'pointer',
            position: 'relative',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {triggerLabel}
          </span>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6}>
        <div style={{ width: 290, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '2px 2px 0' }}>
            <button
              type="button"
              onClick={selectAllFiltered}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--tx2)',
                cursor: 'pointer',
              }}
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearAll}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--crit)',
                cursor: 'pointer',
              }}
            >
              Clear All
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)' }} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search engines..."
              style={{
                width: '100%',
                height: 34,
                padding: '0 10px 0 32px',
                borderRadius: 8,
                border: '1px solid var(--bd)',
                background: 'var(--bg2)',
                color: 'var(--tx)',
                fontSize: 12.5,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredOptions.length ? filteredOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleValue(option.value)}
                style={{
                  minHeight: 34,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: selectedValues.includes(option.value) ? 'rgba(59,130,246,.12)' : 'transparent',
                  color: 'var(--tx)',
                  fontSize: 12.5,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <span>{option.label}</span>
                <span style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: '1px solid rgba(59,130,246,.35)',
                  background: selectedValues.includes(option.value) ? 'var(--blue)' : 'transparent',
                  color: '#fff',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {selectedValues.includes(option.value) ? '✓' : ''}
                </span>
              </button>
            )) : (
              <div style={{ minHeight: 34, padding: '8px 10px', color: 'var(--tx3)', fontSize: 12.5 }}>
                No engines found
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
/** Popover: toggle each detection type on/off for this one camera. Rendered in a
 * body portal (see Popover.jsx) so it isn't clipped by the table's overflow:hidden. */
function AppliedTypesPopover({ camera, typeLabels, onToggleRequest, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounced so a typed word is one request, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), TYPE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Server-side search: GET /detection-settings/types?search= does the matching.
  // `enabled` keeps this inert until the user actually opens this row's popover
  // and types — otherwise every mounted row would fire a request.
  const searchApi = useApi(
    () => getDetectionTypes({ search: debouncedQuery }),
    [debouncedQuery],
    { enabled: open && debouncedQuery.length > 0 },
  );

  // No query -> the full catalogue the parent already loaded, so opening the
  // popover costs no request. With a query, the API response replaces it.
  const searching = debouncedQuery.length > 0;
  const activeTypeLabels = searching ? (searchApi.data ?? {}) : typeLabels;

  // Detection types API is the master list; merge each type with
  // camera.detections[key]?.enabled and show enabled items first.
  const availableTypes = useMemo(
    () => appliedTypesFor(camera, activeTypeLabels, debouncedQuery),
    [camera, activeTypeLabels, debouncedQuery],
  );

  // Deliberately measured against the unsearched catalogue: keying this off the
  // search results would yank the input away mid-typing as they narrow.
  const showSearch = useMemo(
    () => appliedTypesFor(camera, typeLabels).length >= TYPE_SEARCH_MIN,
    [camera, typeLabels],
  );

  // Only true before the first response for a query — a refined search keeps the
  // previous list on screen instead of flashing empty.
  const awaitingResults = searching && searchApi.loading && !searchApi.data;
  const searchFailed = searching && !searchApi.loading && !!searchApi.error;
  // A failed search would otherwise fall through to appliedTypesFor(camera, {}),
  // which renders the camera-only tail as if it were the whole catalogue.
  const showList = !awaitingResults && !searchFailed;

  const handleToggle = (type) => {
    if (disabled) return;
    setOpen(false);
    onToggleRequest(camera, type.key, type.label, type.enabled);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery('');
          setDebouncedQuery('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px 0 12px',
            borderRadius: 20, background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.32)',
            fontSize: 11.5, fontWeight: 500, color: 'var(--blue)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.65 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ whiteSpace: 'nowrap' }}>Applied Types</span>
          <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6}>
        <div style={{ width: 260, padding: 10 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', color: 'var(--tx3)', padding: '2px 4px 8px' }}>
            DETECTION TYPES
          </div>
          {showSearch && (
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)', pointerEvents: 'none' }} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search detection types..."
                aria-label="Search detection types"
                style={{
                  width: '100%',
                  height: 32,
                  padding: `0 ${searching && searchApi.loading ? 28 : 9}px 0 29px`,
                  borderRadius: 8,
                  border: '1px solid var(--bd)',
                  background: 'var(--bg2)',
                  color: 'var(--tx)',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {searching && searchApi.loading && (
                <Loader2
                  size={13}
                  className="animate-spin"
                  style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)', pointerEvents: 'none' }}
                />
              )}
            </div>
          )}
          {/* Capped to ~5 visible rows (34px each incl. gap) so a long type list scrolls instead of pushing the popover off-screen. */}
          <div style={{ maxHeight: 'min(220px, calc(100vh - 180px))', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {awaitingResults && (
              <div style={{ padding: '10px 6px', color: 'var(--tx3)', fontSize: 12.5 }}>
                Searching...
              </div>
            )}
            {searchFailed && (
              <div style={{ padding: '10px 6px', color: 'var(--crit)', fontSize: 12.5 }}>
                Could not search detection types
              </div>
            )}
            {/* The "no license / none configured" state is only meaningful for the
                unsearched list; a search that matches nothing is not a licensing
                problem, so it gets its own line below. */}
            {!searching && availableTypes.length === 0 && (
              <NoDetectionLicense
                compact
                fallback="No detection types are configured for this camera."
              />
            )}
            {searching && showList && availableTypes.length === 0 && (
              <div style={{ padding: '10px 6px', color: 'var(--tx3)', fontSize: 12.5 }}>
                No detection types found
              </div>
            )}
            {showList && availableTypes.map(type => {
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

function CameraPreviewModal({ camera, onClose }) {
  const title = camera?.customName || camera?.name || camera?.channelId || 'Camera Preview';
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,.62)', backdropFilter: 'blur(7px)', display: 'grid', placeItems: 'center', padding: 24 }}
    >
      <section
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(920px, 94vw)', background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.38)' }}
      >
        <div style={{ height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 850, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: 'var(--tx3)' }}>Live camera preview</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx2)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ background: '#020617', aspectRatio: '16 / 9', minHeight: 320 }}>
          <CameraStream channel={streamableCamera(camera)} minH={320} rounded={false} fit="contain" showOverlay />
        </div>
      </section>
    </div>
  );
}

function CameraRow({ camera, typeLabels, onOpen, onPreview, onToggleDetectionRequest, onResetThresholdsRequest, onCheckTypeChange, checkTypeSaving, resetLoading = false, canEdit = false }) {
  const zoneTypes = configuredZoneTypesFor(camera, typeLabels);
  const resettableTypes = resettableTypesFor(camera, typeLabels);

  return (
    <div
      className="vq-row"
      onClick={onOpen}
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(200px,1.35fr) minmax(240px,1.2fr) 150px 210px 150px 44px',
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
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {camera.customName || camera.name}
            </span>
            <button
              type="button"
              title="Preview camera"
              onClick={(event) => {
                event.stopPropagation();
                onPreview?.(camera);
              }}
              style={{
                height: 24,
                padding: '0 8px',
                borderRadius: 7,
                border: '1px solid rgba(99,102,241,.32)',
                background: 'rgba(99,102,241,.1)',
                color: 'var(--blue)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 750,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Play size={10} fill="currentColor" />
              Preview
            </button>
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx3)', display: 'block' }}>
            {camera.ipAddress || ''}
          </span>
        </span>
      </span>

      <span style={{ minWidth: 0 }}>
        {zoneTypes.length ? (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {zoneTypes.map(type => (
              <EngineChip
                key={type.key}
                label={type.label}
                status={zoneStatusOf(type)}
                onSelect={() => onOpen?.(type.key)}
              />
            ))}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>No zones configured</span>
        )}
      </span>

      <span style={{ display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        <AppliedTypesPopover camera={camera} typeLabels={typeLabels} onToggleRequest={onToggleDetectionRequest} disabled={!canEdit} />
      </span>

      <span style={{ display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onResetThresholdsRequest?.(camera)}
          disabled={resetLoading}
          title={!canEdit ? 'You only have view access for detections' : (resettableTypes.length === 0 ? 'No enabled detections to reset' : 'Reset enabled detection thresholds')}
          style={{
            height: 32,
            padding: '0 10px',
            borderRadius: 8,
            border: '1px solid rgba(168,85,247,.28)',
            background: resettableTypes.length ? 'rgba(168,85,247,.1)' : 'var(--bg2)',
            color: (!canEdit || resetLoading || resettableTypes.length === 0) ? 'var(--tx3)' : 'var(--violet)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            cursor: resetLoading ? 'not-allowed' : 'pointer',
            opacity: resetLoading ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {resetLoading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <ListRestart size={13} />
          )}
          reset detection thresholds
        </button>
      </span>

      <span style={{ display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        <span style={{ position: 'relative' }}>
          <select
            value={camera.checkType || 'none'}
            onChange={e => onCheckTypeChange(camera, e.target.value)}
            disabled={checkTypeSaving || !canEdit}
            style={{
              height: 32, padding: '0 26px 0 11px', borderRadius: 8,
              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12,
              outline: 'none', cursor: canEdit ? 'pointer' : 'not-allowed', color: 'var(--tx)', appearance: 'none',
              opacity: canEdit ? 1 : 0.72,
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

const LIMIT = 100;

export function DetectionSettingsCameraList({ onOpenCamera }) {
  const { permissions } = usePermissions();
  const canEditDetections = permissions?.detectionSettings?.edit === true;
  const [search, setSearch] = useState('');
  const [nvrFilter, setNvrFilter] = useState('');
  const [camTypeFilter, setCamTypeFilter] = useState('');
  const [engineFilter, setEngineFilter] = useState([]);
  const [page, setPage] = useState(0);
  const [detectionConfirm, setDetectionConfirm] = useState(null);
  // Licensing refusal from the last enable attempt, with the camera/type to
  // retry once the user frees a slot.
  const [limitBlock, setLimitBlock] = useState(null);
  const [detectionActionLoading, setDetectionActionLoading] = useState(false);
  const [previewCamera, setPreviewCamera] = useState(null);
  const [checkTypeSavingId, setCheckTypeSavingId] = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [resetSelection, setResetSelection] = useState([]);
  const [resetLoadingId, setResetLoadingId] = useState('');

  const nvrsApi = useApi(() => getNvrs(0, 100), []);
  const nvrs = nvrsApi.data?.nvrs ?? [];

  const typesApi = useApi(() => getDetectionTypes(), []);
  const typeLabels = typesApi.data || {};

  const channelsApi = useApi(
    () => getChannels({ skip: page * LIMIT, limit: LIMIT, nvrId: nvrFilter, search, camType: camTypeFilter, engines: engineFilter }),
    [page, nvrFilter, search, camTypeFilter, engineFilter],
  );
  const cameras = channelsApi.data?.channels ?? [];
  const total = channelsApi.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const engineOptions = useMemo(() => {
    const entries = Array.isArray(typeLabels)
      ? typeLabels.map((type, index) => ({
          value: type?.settingType || type?.detectionType || type?.key || type?.id || `type-${index}`,
          label: detectionTypeLabel(type, `Type ${index + 1}`),
        }))
      : Object.entries(typeLabels || {}).map(([key, value]) => ({
          value: key,
          label: detectionTypeLabel(value, key),
        }));

    const cameraOnlyEntries = cameras
      .flatMap(camera => Object.keys(camera?.detections || {}))
      .filter(Boolean)
      .filter((key, index, list) => list.indexOf(key) === index)
      .filter(key => !entries.some(entry => entry.value === key))
      .map(key => ({ value: key, label: key }));

    return [...entries, ...cameraOnlyEntries].sort((a, b) => a.label.localeCompare(b.label));
  }, [typeLabels, cameras]);

  // Matches V1: a single toggle endpoint for on/off; 404s if the type was
  // never linked to this camera (no auto-create — same as V1's real behavior).
const handleToggleDetection = async (camera, detectionType, enable) => {
  if (!canEditDetections) return;
  if (isAttendanceDetectionType(detectionType)) return;
  try {
    const response = await toggleChannelDetection({
      channelId: camera._id,
      detectionType,
      enable,
    });

    // Silent: a non-silent refetch flips AsyncBoundary to its skeleton, which
    // unmounts every CameraRow and collapses the page height, so the browser
    // clamps the scroll position to the top. Awaited so the confirm dialog
    // keeps its "Starting.../Stopping..." state until the fresh row is in.
    await channelsApi.refetch({ silent: true });

    const message =
      response?.data?.body?.message ||
      response?.body?.message ||
      response?.message ||
      `${detectionType} ${enable ? 'enabled' : 'disabled'} successfully.`;

    toast.success(message);
  } catch (err) {
    // Licensing refusals get the "deselect a camera to continue" dialog rather
    // than a toast the user can do nothing about.
    const licenseError = licenseErrorFrom(err);
    if (licenseError) {
      setLimitBlock({ error: licenseError, camera, detectionType });
      throw err;
    }

    const msg =
      err?.response?.data?.body?.message ||
      err?.response?.data?.message ||
      err?.body?.message ||
      err?.message ||
      'Failed to update detection type.';

    toast.error(msg);

    throw err;
  }
};
  const handleDetectionToggleRequest = (camera, detectionType, label, currentlyEnabled) => {
    if (!canEditDetections) return;
    setDetectionConfirm({ camera, detectionType, label, currentlyEnabled });
  };

  const handleResetThresholdsRequest = (camera) => {
    if (!canEditDetections) return;
    const options = resettableTypesFor(camera, typeLabels);
    if (options.length === 0) {
      toast.error('No enabled detections to reset');
      return;
    }
    setResetModal({ camera, options });
    setResetSelection([]);
  };

  const closeResetModal = () => {
    if (resetLoadingId) return;
    setResetModal(null);
    setResetSelection([]);
  };

  const handleConfirmResetThresholds = async () => {
    if (!resetModal?.camera?._id) return;
    if (resetSelection.length === 0) {
      toast.error('Select at least one enabled detection to reset.');
      return;
    }

    setResetLoadingId(resetModal.camera._id);
    try {
      const result = await resetDetectionThresholdsBatch({
        channelId: resetModal.camera._id,
        detectionSettingIds: resetSelection,
      });
      channelsApi.setData((previous) => {
        const updateCamera = (item) => item?._id === resetModal.camera._id
          ? patchCameraWithResetThresholds(item, result)
          : item;
        if (Array.isArray(previous)) return previous.map(updateCamera);
        if (Array.isArray(previous?.channels)) {
          return { ...previous, channels: previous.channels.map(updateCamera) };
        }
        return previous;
      });
      setResetModal(null);
      setResetSelection([]);
      toast.success('Detection thresholds reset successfully.');
      channelsApi.refetch({ silent: true });
    } catch (err) {
      const msg = err?.response?.data?.body?.message || err?.response?.data?.message || err?.message || 'Failed to reset detection thresholds.';
      toast.error(msg);
    } finally {
      setResetLoadingId('');
    }
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
    } catch {
      // handleToggleDetection has already surfaced the failure (toast, or the
      // licensing dialog). Close the confirmation either way so the dialog it
      // opened is not stacked behind this one.
      setDetectionConfirm(null);
    } finally {
      setDetectionActionLoading(false);
    }
  };

  const handleCheckTypeChange = async (camera, checkType) => {
    if (!canEditDetections) return;
    if (!camera?._id || checkTypeSavingId) return;
    if ((camera.checkType || 'none') === checkType) return;
    const previousCheckType = camera.checkType || 'none';
    setCheckTypeSavingId(camera._id);
    channelsApi.setData((previous) => {
      const updateCamera = (item) => item?._id === camera._id ? { ...item, checkType } : item;
      if (Array.isArray(previous)) return previous.map(updateCamera);
      if (Array.isArray(previous?.channels)) {
        return { ...previous, channels: previous.channels.map(updateCamera) };
      }
      return previous;
    });
    try {
      await updateChannel(camera._id, { checkType });
      channelsApi.refetch({ silent: true });
    } catch (err) {
      channelsApi.setData((previous) => {
        const updateCamera = (item) => item?._id === camera._id ? { ...item, checkType: previousCheckType } : item;
        if (Array.isArray(previous)) return previous.map(updateCamera);
        if (Array.isArray(previous?.channels)) {
          return { ...previous, channels: previous.channels.map(updateCamera) };
        }
        return previous;
      });
      const msg = err?.response?.data?.body?.message || 'Failed to update camera type.';
      toast.error(msg);
    } finally {
      setCheckTypeSavingId(null);
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
        <div style={{ position: 'relative' }}>
          <select
            value={camTypeFilter}
            onChange={e => { setCamTypeFilter(e.target.value); setPage(0); }}
            style={{
              height: 40, padding: '0 34px 0 13px', borderRadius: 10,
              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 13,
              outline: 'none', cursor: 'pointer', color: 'var(--tx)', appearance: 'none',
            }}
          >
            {CAM_TYPE_FILTERS.map(type => (
              <option key={type.value || 'all'} value={type.value}>{type.label}</option>
            ))}
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <EngineFilterDropdown
            value={engineFilter}
            options={engineOptions}
            onChange={(nextValue) => {
              setEngineFilter(nextValue);
              setPage(0);
            }}
          />
        </div>
        <ZoneStatusLegend />
        {/* <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>
          {total} total
        </span> */}
      </div>

      <div style={{ position: 'relative', background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(200px,1.35fr) minmax(240px,1.2fr) 150px 210px 150px 44px', gap: 0,
          padding: '12px 18px', borderBottom: '1px solid var(--bd)',
          fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)', alignItems: 'center',
        }}>
          <span>CAMERA NAME</span>
          <span>ENGINES</span>
          <span style={{ textAlign: 'center' }}>ENABLE DETECTION</span>
          <span style={{ textAlign: 'center' }}>RESET DETECTION THRESHOLDS</span>
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
          {() => cameras.map(camera => (
            <CameraRow
              key={camera._id}
              camera={camera}
              typeLabels={typeLabels}
              onOpen={(targetSettingType) => onOpenCamera?.(
                camera,
                typeof targetSettingType === 'string' ? targetSettingType : undefined,
              )}
              onPreview={setPreviewCamera}
              onToggleDetectionRequest={handleDetectionToggleRequest}
              onResetThresholdsRequest={handleResetThresholdsRequest}
              onCheckTypeChange={handleCheckTypeChange}
              checkTypeSaving={checkTypeSavingId === camera._id}
              resetLoading={resetLoadingId === camera._id}
              canEdit={canEditDetections}
            />
          ))}
        </AsyncBoundary>
      </div>
      {checkTypeSavingId && (
        <div
          aria-live="polite"
          aria-busy="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 30,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              minWidth: 190,
              maxWidth: 300,
              padding: '11px 15px',
              borderRadius: 12,
              background: 'var(--bg1solid)',
              border: '1px solid var(--bd2)',
              boxShadow: '0 18px 40px rgba(15,23,42,.24)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--tx)',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--blue)', flexShrink: 0 }} />
            <span>Updating camera...</span>
          </div>
        </div>
      )}
      {previewCamera && (
        <CameraPreviewModal camera={previewCamera} onClose={() => setPreviewCamera(null)} />
      )}

      <ConfirmationModal
        open={!!resetModal}
        title="Reset Detection"
        message={resetModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
              Camera: <span style={{ fontWeight: 700, color: 'var(--tx)' }}>{resetModal.camera?.customName || resetModal.camera?.name || 'Camera'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>Select detection type to reset</span>
              <MultiSelect
                options={resetModal.options.map(type => ({ id: type.settingId, label: type.label }))}
                value={resetSelection}
                onChange={setResetSelection}
                placeholder="Select enabled detections"
                searchPlaceholder="Search detections..."
                msg="No enabled detections found"
                maxHeight="max-h-44"
                tint="#a855f7"
              />
            </div>
          </div>
        )}
        confirmLabel={resetLoadingId ? 'Resetting...' : 'Reset'}
        cancelLabel="Cancel"
        onClose={closeResetModal}
        onConfirm={handleConfirmResetThresholds}
        loading={!!resetLoadingId}
        confirmClass="bg-[var(--violet)] text-white hover:opacity-90 shadow-sm shadow-[var(--violet)]/20 disabled:opacity-70"
      />

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
      <DetectionLimitDialog
        open={Boolean(limitBlock)}
        error={limitBlock?.error}
        detectionType={limitBlock?.detectionType}
        detectionLabel={detectionTypeLabel(
          typeLabels?.[limitBlock?.detectionType],
          limitBlock?.detectionType,
        )}
        onClose={() => setLimitBlock(null)}
        onRetry={async () => {
          if (!limitBlock) return;
          try {
            await handleToggleDetection(limitBlock.camera, limitBlock.detectionType, true);
            setLimitBlock(null);
          } catch {
            // Still blocked (or blocked by a different rule) — the dialog stays
            // open showing the refreshed refusal.
          }
        }}
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
      if (fresh) setOpenCamera(mergeCameraStreamFields({ ...fresh, nvrId: openCamera.nvrId }, openCamera));
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
