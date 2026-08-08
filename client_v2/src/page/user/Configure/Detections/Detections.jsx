import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../../components/States';
import { useApi } from '../../../../hooks/useApi';
import { deleteDetectionSetting, getCamerasByNvr, getDetectionSettings, getDetectionTypes, toggleChannelDetection, updateChannel, updateDetectionSetting } from '../../../../helpers/configure';
import { fetchDetectionTypes as fetchIncidentFilterTypes, fetchIncidents, fetchIncidentStats } from '../../../../helpers/incidents';
import { timeOfDay } from '../../../../lib/format';
import DetectionZoneMarking from '../DetectionZoneMarking';
import { DetectionSettingsCameraList } from '../DetectionSettings';
import {
  DETECTION_CATEGORIES,
  CATEGORY_BY_KEY,
  DETECTION_THRESHOLDS,
  buildDetectionModels,
  emptyIncidents,
  toPercent,
} from './detectionsData';
import DetectionCard from './DetectionCard';
import DetectionDetailPanel from './DetectionDetailPanel';
import DetectionIncidents from './DetectionIncidents';
import ConfirmDialog from '../DetectionZoneMarking/dialogs/ConfirmDialog';
import './detections.css';

const STATE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
];

const CAMERA_TYPE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'checkout', label: 'Check-out' },
];

const INCIDENT_PAGE_SIZE = 12;

function normalizeIncidentKey(value) {
  return String(value || '')
    .replace(/settings$/i, '')
    .replace(/detection$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function compactIncidentType(value) {
  return String(value || '').replace(/Settings$/, '');
}

function incidentTypeForDetection(model, incidentFilterTypes = []) {
  if (!model) return '';
  const candidates = [
    compactIncidentType(model.settingType || model.id),
    model.id,
    model.name,
    model.subtitle,
  ].filter(Boolean);
  const candidateKeys = new Set(candidates.map(normalizeIncidentKey));

  const match = incidentFilterTypes.find((item) => {
    const values = [
      item?.incidentType,
      item?.formattedIncidentType,
      item?.incidentName,
      item?.displayName,
      item?.name,
    ];
    return values.some((value) => candidateKeys.has(normalizeIncidentKey(value)));
  });

  return match?.incidentType || '';
}

/** One chip style for every filter in the toolbar (category + state). */
const chipStyle = (active, hasDot) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  height: 28,
  padding: hasDot ? '0 10px 0 9px' : '0 12px',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  color: active ? '#fff' : 'var(--tx2)',
  background: active ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg2)',
  border: `1px solid ${active ? 'transparent' : 'var(--bd)'}`,
});

function StatCard({ label, value, sub, color = 'var(--tx)', small = false }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{label}</div>
      <div
        style={{
          fontFamily: 'var(--disp)',
          fontWeight: 700,
          fontSize: small ? 17 : 27,
          lineHeight: 1.15,
          letterSpacing: '-.02em',
          margin: small ? '9px 0 0' : '6px 0 0',
          color,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={small ? String(value) : undefined}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {sub}
      </div>
    </div>
  );
}

function cameraLabel(camera) {
  return camera?.customName || camera?.name || camera?.channelId || camera?.ipAddress || camera?._id || 'Camera';
}

function cameraWithNvr(camera, nvr) {
  if (!camera) return null;
  return {
    ...camera,
    nvrId: camera.nvrId && typeof camera.nvrId === 'object' ? camera.nvrId : nvr,
  };
}

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

function nvrIdOf(nvr) {
  if (!nvr) return '';
  return typeof nvr === 'object' ? nvr._id : nvr;
}

function severityKey(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'critical') return 'critical';
  if (key === 'high') return 'high';
  if (key === 'moderate' || key === 'medium') return 'medium';
  return 'low';
}

function severityFilterValue(value) {
  if (value === 'critical') return ['critical', 'Critical', 'CRITICAL'];
  if (value === 'high') return ['high', 'High', 'HIGH'];
  if (value === 'medium') return ['moderate', 'medium', 'Moderate', 'Medium', 'MODERATE', 'MEDIUM'];
  if (value === 'low') return ['low', 'Low', 'LOW'];
  return null;
}

function statusKey(item) {
  if (item?.resolved) return 'resolved';
  if (item?.report?.status) return 'acknowledged';
  return 'new';
}

function confidenceOf(item) {
  const raw = item?.ConfidenceScoreInPercentage ?? item?.confidence ?? item?.accuracy ?? item?.score;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function alertIncidentRows(items, selected, camera) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item._id || item.id || `${item.incidentType || selected?.id || 'incident'}-${index}`,
    severity: severityKey(item.severity),
    status: statusKey(item),
    title: item.incidentName || item.displayName || selected?.name || 'Detection alert',
    camera: item.channelData?.name || item.channelId?.name || camera?.customName || camera?.name || 'Camera',
    site: item.nvrData?.nvrName || item.nvrId?.nvrName || camera?.nvrId?.nvrName || 'NVR',
    confidence: confidenceOf(item),
    time: timeOfDay(item.timeOfIncident || item.createdAt),
  }));
}

function getDetectionSetting(item) {
  return item?.detectionSetting || item?.setting || item;
}

function getLinkedCameras(item) {
  const linked = item?.linkedCameras || item?.cameras || item?.channels || [];
  return Array.isArray(linked) ? linked : [];
}

function getSettingUiData(item, setting) {
  return item?.uiData || setting?.uiData || null;
}

function findSettingForCamera(settingsResult, settingType, cameraId) {
  const items = Array.isArray(settingsResult?.settings) ? settingsResult.settings : [];
  return items.find((item) => {
    const setting = getDetectionSetting(item);
    if (!setting || setting.settingType !== settingType) return false;

    const linkedCameras = getLinkedCameras(item);
    if (linkedCameras.length === 0) return true;
    return linkedCameras.some((camera) => String(camera?._id) === String(cameraId));
  });
}

function mergeDetectionSetting(camera, nvr, settingType, settingsResult) {
  const item = findSettingForCamera(settingsResult, settingType, camera?._id);
  const linkedCamera = getLinkedCameras(item).find((cam) => String(cam?._id) === String(camera?._id));
  const base = mergeCameraStreamFields(
    cameraWithNvr(linkedCamera || camera, linkedCamera?.nvrId || nvr),
    camera,
  );
  const setting = getDetectionSetting(item);
  if (!base) return base;
  if (!setting?._id) {
    const existingEntry = base.detections?.[settingType] || camera?.detections?.[settingType] || {};
    return {
      ...base,
      detections: {
        ...(base.detections || {}),
        [settingType]: {
          ...(typeof existingEntry === 'object' ? existingEntry : {}),
          enabled: false,
          id: null,
        },
      },
    };
  }
  const uiData = getSettingUiData(item, setting);
  const hydratedSetting = uiData && setting.uiData !== uiData
    ? { ...setting, uiData }
    : setting;

  const baseEntry = base.detections?.[settingType];
  const cameraEntry = camera?.detections?.[settingType];
  const existingEntry = typeof baseEntry === 'object'
    ? baseEntry
    : (typeof cameraEntry === 'object' ? cameraEntry : {});
  const baseEnabled = typeof baseEntry === 'object' ? baseEntry.enabled : baseEntry;
  const cameraEnabled = typeof cameraEntry === 'object' ? cameraEntry.enabled : cameraEntry;
  const existingEnabled = baseEnabled ?? cameraEnabled;
  const settingEnabled = setting?.active ?? setting?.enabled;
  return {
    ...base,
    detections: {
      ...(base.detections || {}),
      [settingType]: {
        ...(typeof existingEntry === 'object' ? existingEntry : {}),
        enabled: existingEnabled ?? settingEnabled ?? true,
        id: hydratedSetting,
      },
    },
  };
}

function settingFromEntry(entry) {
  return entry?.id && typeof entry.id === 'object' ? entry.id : null;
}

function scheduleModeFrom(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.mode || '';
}

function thresholdsFromSettings(settingType, baseThresholds, settings) {
  const next = { ...(baseThresholds || {}) };
  const keys = DETECTION_THRESHOLDS[settingType] || Object.keys(next);
  for (const key of keys) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) {
      next[key] = toPercent(settings[key]) ?? next[key] ?? 70;
    } else if (!Object.prototype.hasOwnProperty.call(next, key)) {
      next[key] = 70;
    }
  }
  return next;
}

function percentToApiValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num / 100));
}

/**
 * Detections catalogue. The master detection list is fetched from
 * GET /detection-settings/types; per-camera toggles persist through
 * PUT /channel/detection/toggle.
 */
export default function Detections() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [stateTab, setStateTab] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [edits, setEdits] = useState({});
  const [zoneCamera, setZoneCamera] = useState(null);
  const [enteredDetections, setEnteredDetections] = useState(false);
  const [zoneSettingsOpen, setZoneSettingsOpen] = useState(false);
  const [detectionToggleLoading, setDetectionToggleLoading] = useState('');
  const [incidentDateFrom, setIncidentDateFrom] = useState('');
  const [incidentDateTo, setIncidentDateTo] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState('all');
  const [incidentItems, setIncidentItems] = useState([]);
  const [incidentTotalCount, setIncidentTotalCount] = useState(0);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentLoadingMore, setIncidentLoadingMore] = useState(false);
  const [incidentError, setIncidentError] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const detailCameraId = searchParams.get('camera');
  const [resettingSetting, setResettingSetting] = useState(false);
  const [cameraTypeSaving, setCameraTypeSaving] = useState(false);
  const incidentRequestIdRef = useRef(0);
  const typesApi = useApi(() => getDetectionTypes(), [], { initialData: {} });
  const incidentFilterTypesApi = useApi(
    () => fetchIncidentFilterTypes({ skip: 0, limit: 100 }),
    [],
    { initialData: [] },
  );

  const models = useMemo(
    () => buildDetectionModels(typesApi.data).map((m) => {
      const edited = edits[m.id] || {};
      const settingType = m.settingType || m.id;
      const cameraEntry = zoneCamera?.detections?.[settingType];
      const setting = settingFromEntry(cameraEntry);
      const uiData = setting?.uiData || {};
      const apiSettings = uiData.settings || setting?.settings || {};
      const cameraEnabled = typeof cameraEntry === 'object' ? cameraEntry?.enabled : cameraEntry;
      const settingEnabled = setting?.active ?? setting?.enabled;
      const cameraScopedActive = zoneCamera?._id
        ? (cameraEnabled ?? settingEnabled ?? false)
        : m.active;
      const apiThresholds = thresholdsFromSettings(settingType, m.thresholds, apiSettings);
      const editedThresholds = edited.thresholds || {};
      const thresholds = { ...apiThresholds, ...editedThresholds };
      const firstThreshold = Object.values(thresholds)[0];
      const scheduleMode = scheduleModeFrom(uiData.schedule);
      return {
        ...m,
        ...edited,
        name: uiData.detectionName || m.name,
        status: uiData.status || edited.status || m.status,
        scheduleMode: scheduleMode || edited.scheduleMode || m.scheduleMode,
        schedule: scheduleMode || edited.schedule || m.schedule,
        appliedCameras: uiData.appliedCameras ?? edited.appliedCameras ?? m.appliedCameras,
        activeCameras: uiData.activeCameras ?? edited.activeCameras ?? m.activeCameras,
        settings: { ...(m.settings || {}), ...apiSettings, ...(edited.settings || {}) },
        thresholds,
        sensitivity: edited.sensitivity ?? firstThreshold ?? m.sensitivity,
        active: cameraScopedActive,
      };
    }),
    [edits, typesApi.data, zoneCamera],
  );

  useEffect(() => {
    if (models.length === 0) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!models.some((m) => m.id === selectedId)) setSelectedId(models[0].id);
  }, [models, selectedId]);

  const selected = models.find((m) => m.id === selectedId) || models[0];
  const selectedCategory = CATEGORY_BY_KEY[selected?.category];
  const selectedSettingType = selected?.settingType || selected?.id || '';
  const selectedIncidentType = incidentTypeForDetection(selected, incidentFilterTypesApi.data);
  const selectedDetectionEntry = selectedSettingType ? zoneCamera?.detections?.[selectedSettingType] : null;
  const selectedDetectionSettingId = selectedDetectionEntry?.id && typeof selectedDetectionEntry.id === 'object'
    ? selectedDetectionEntry.id._id
    : null;
  const selectedDetectionAlerts = selectedDetectionEntry?.id && typeof selectedDetectionEntry.id === 'object'
    ? selectedDetectionEntry.id.alerts || []
    : [];
  const incidentFilter = useMemo(() => {
    if (!enteredDetections || incidentFilterTypesApi.loading || !selectedIncidentType) return null;
    const severity = severityFilterValue(incidentSeverity);
    return {
      incidentTypeFilter: [selectedIncidentType],
      statusFilter: ['new', 'reported', 'resolved'],
      ...(zoneCamera?._id ? { channelId: [String(zoneCamera._id)] } : {}),
      ...(severity ? { severity } : {}),
      ...(incidentDateFrom && incidentDateTo ? { startDate: incidentDateFrom, endDate: incidentDateTo } : {}),
    };
  }, [
    enteredDetections,
    incidentDateFrom,
    incidentDateTo,
    incidentSeverity,
    incidentFilterTypesApi.loading,
    selectedIncidentType,
    zoneCamera?._id,
  ]);
  // Keep the inactive camera-list state distinct from the active "All"
  // filter. Both previously serialized to "{}", so entering a camera did not
  // change this dependency and the initial incidents request was skipped.
  const incidentFilterKey = useMemo(
    () => (incidentFilter === null ? null : JSON.stringify(incidentFilter)),
    [incidentFilter],
  );
  const incidentStatsApi = useApi(
    () => fetchIncidentStats(incidentFilter),
    [incidentFilterKey],
    { enabled: Boolean(incidentFilter), initialData: {} },
  );

  useEffect(() => {
    if (!enteredDetections || incidentFilterTypesApi.loading || selectedIncidentType) return;
    incidentRequestIdRef.current += 1;
    setIncidentItems([]);
    setIncidentTotalCount(0);
    setIncidentLoading(false);
    setIncidentLoadingMore(false);
    setIncidentError(null);
  }, [enteredDetections, incidentFilterTypesApi.loading, selectedIncidentType, selectedId, incidentSeverity, incidentDateFrom, incidentDateTo]);

  const loadIncidents = useCallback(async ({ skip = 0, append = false } = {}) => {
    if (!incidentFilter) {
      setIncidentItems([]);
      setIncidentTotalCount(0);
      return;
    }

    const requestId = ++incidentRequestIdRef.current;
    append ? setIncidentLoadingMore(true) : setIncidentLoading(true);
    if (!append) setIncidentError(null);

    try {
      const result = await fetchIncidents({ skip, limit: INCIDENT_PAGE_SIZE }, incidentFilter);
      if (requestId !== incidentRequestIdRef.current) return;

      const nextItems = Array.isArray(result.items) ? result.items : [];
      setIncidentItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
      const loadedCount = skip + nextItems.length;
      const apiTotal = Number(result.totalCount);
      const inferredTotal = loadedCount + (nextItems.length === INCIDENT_PAGE_SIZE ? 1 : 0);
      setIncidentTotalCount(Number.isFinite(apiTotal) && apiTotal >= loadedCount ? apiTotal : inferredTotal);
    } catch (err) {
      if (requestId !== incidentRequestIdRef.current) return;
      if (append) {
        toast.error(err?.response?.data?.body?.message || 'Failed to load more alerts.');
      } else {
        setIncidentError(err);
      }
    } finally {
      if (requestId === incidentRequestIdRef.current) {
        append ? setIncidentLoadingMore(false) : setIncidentLoading(false);
      }
    }
  }, [incidentFilter]);

  useEffect(() => {
    if (!incidentFilter) {
      incidentRequestIdRef.current += 1;
      setIncidentItems([]);
      setIncidentTotalCount(0);
      setIncidentLoading(false);
      setIncidentLoadingMore(false);
      setIncidentError(null);
      return;
    }
    setIncidentItems([]);
    setIncidentTotalCount(0);
    loadIncidents({ skip: 0, append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentFilterKey]);

  const hasMoreIncidents = incidentItems.length < incidentTotalCount;
  const loadMoreIncidents = useCallback(() => {
    if (!incidentFilter || incidentLoading || incidentLoadingMore || !hasMoreIncidents) return;
    loadIncidents({ skip: incidentItems.length, append: true });
  }, [
    hasMoreIncidents,
    incidentFilter,
    incidentItems.length,
    incidentLoading,
    incidentLoadingMore,
    loadIncidents,
  ]);

  const incidents = useMemo(
    () => alertIncidentRows(incidentItems ?? emptyIncidents(), selected, zoneCamera),
    [incidentItems, selected, zoneCamera],
  );
  const incidentPanelLoading = incidentFilterTypesApi.loading || (Boolean(incidentFilter) && incidentLoading);
  const activeCount = models.filter((m) => m.active).length;
  const incidentStats = incidentStatsApi.data || {};
  const selectedIncidentCount = incidentFilter
    ? Number(incidentStats.totalAlerts || 0) + Number(incidentStats.incidentsResolved || 0)
    : models.reduce((sum, m) => sum + m.incidents24h, 0);
  const visibleCategoryCount = new Set(models.map((m) => m.category)).size;
  const loadingValue = typesApi.loading ? '...' : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (category !== 'all' && m.category !== category) return false;
      if (stateTab === 'active' && !m.active) return false;
      if (stateTab === 'paused' && m.active) return false;
      if (q && !`${m.name} ${m.subtitle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [models, search, category, stateTab]);

  const groups = useMemo(
    () =>
      DETECTION_CATEGORIES.map((cat) => ({
        ...cat,
        items: filtered.filter((m) => m.category === cat.key),
      })).filter((g) => g.items.length > 0),
    [filtered],
  );
  const allVisibleGroupsCollapsed = groups.length > 0 && groups.every((group) => collapsedGroups[group.key]);
  const hiddenDetectionCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  const toggleGroupCollapsed = (groupKey) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const selectDetection = (modelId) => {
    if (!modelId || modelId === selectedId) return;
    // Immediately remove the previous detection's rows and invalidate its
    // request. The filter effect refreshes the v2 incident list while the
    // header-stat request uses the same selected detection filter.
    incidentRequestIdRef.current += 1;
    setIncidentItems([]);
    setIncidentTotalCount(0);
    setIncidentError(null);
    setIncidentLoadingMore(false);
    setIncidentLoading(true);
    setSelectedId(modelId);
  };

  const toggleAllGroupsCollapsed = () => {
    setCollapsedGroups((prev) => {
      if (allVisibleGroupsCollapsed) {
        const next = { ...prev };
        groups.forEach((group) => { next[group.key] = false; });
        return next;
      }
      return groups.reduce((next, group) => ({ ...next, [group.key]: true }), { ...prev });
    });
  };

  const zoneCameraNvrId = nvrIdOf(zoneCamera?.nvrId);

  const patch = (id, changes) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...changes } }));

  const updateSelectedThreshold = async (key, value) => {
    if (!selected?.id) return;
    const nextThresholds = {
      ...(selected.thresholds || {}),
      [key]: value,
    };
    patch(selected.id, {
      thresholds: nextThresholds,
      ...(key === Object.keys(selected.thresholds || {})[0] ? { sensitivity: value } : {}),
    });

    if (!selectedDetectionSettingId || !selectedSettingType) {
      toast.error('Select a saved detection setting before changing thresholds.');
      return;
    }

    const apiValue = percentToApiValue(value);
    try {
      await updateDetectionSetting(selectedDetectionSettingId, {
        settings: { [key]: apiValue },
      });
      setZoneCamera((prev) => {
        if (!prev) return prev;
        const currentEntry = prev.detections?.[selectedSettingType] || {};
        const currentSetting = settingFromEntry(currentEntry);
        const nextSetting = currentSetting
          ? {
              ...currentSetting,
              settings: {
                ...(currentSetting.settings || {}),
                [key]: apiValue,
              },
              uiData: {
                ...(currentSetting.uiData || {}),
                settings: {
                  ...(currentSetting.uiData?.settings || {}),
                  [key]: apiValue,
                },
              },
            }
          : currentSetting;
        return {
          ...prev,
          detections: {
            ...(prev.detections || {}),
            [selectedSettingType]: {
              ...(typeof currentEntry === 'object' ? currentEntry : {}),
              id: nextSetting || currentEntry?.id,
            },
          },
        };
      });
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || err?.response?.data?.message || 'Failed to update threshold.');
    }
  };

  const updateSelectedRecipients = (alertIds) => {
    if (!selectedSettingType) return;
    setZoneCamera((prev) => {
      if (!prev) return prev;
      const currentEntry = prev.detections?.[selectedSettingType] || {};
      const currentSetting = settingFromEntry(currentEntry);
      const nextSetting = currentSetting
        ? { ...currentSetting, alerts: alertIds }
        : currentSetting;
      return {
        ...prev,
        detections: {
          ...(prev.detections || {}),
          [selectedSettingType]: {
            ...(typeof currentEntry === 'object' ? currentEntry : {}),
            id: nextSetting || currentEntry?.id,
          },
        },
      };
    });
  };

  const setCameraDetectionEnabled = (settingType, enabled) => {
    setZoneCamera((prev) => {
      if (!prev) return prev;
      const currentEntry = prev.detections?.[settingType] || {};
      return {
        ...prev,
        detections: {
          ...(prev.detections || {}),
          [settingType]: {
            ...(typeof currentEntry === 'object' ? currentEntry : {}),
            enabled,
          },
        },
      };
    });
  };

  const toggleModel = async (model) => {
    const detectionType = model.settingType || model.id;
    if (!zoneCamera?._id || !detectionType) {
      toast.error('Select a camera before changing detection status.');
      return;
    }
    const enable = !model.active;
    setDetectionToggleLoading(detectionType);
    try {
      await toggleChannelDetection({ channelId: zoneCamera._id, detectionType, enable });
      setCameraDetectionEnabled(detectionType, enable);
      toast.success(`${model.name} ${enable ? 'enabled' : 'disabled'}.`);
      refreshZoneCamera();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to update detection status.');
    } finally {
      setDetectionToggleLoading('');
    }
  };

  const handleResetSetting = async () => {
    if (!selectedSettingType || !selectedDetectionSettingId) {
      toast.error('No detection settings found to reset.');
      setShowResetConfirm(false);
      return;
    }

    setResettingSetting(true);
    try {
      await deleteDetectionSetting(selectedDetectionSettingId);
      setZoneSettingsOpen(false);
      setShowResetConfirm(false);
      setZoneCamera((prev) => {
        if (!prev) return prev;
        const nextDetections = { ...(prev.detections || {}) };
        const currentEntry = nextDetections[selectedSettingType];
        nextDetections[selectedSettingType] = {
          ...(typeof currentEntry === 'object' ? currentEntry : {}),
          enabled: false,
          id: null,
        };
        return { ...prev, detections: nextDetections };
      });
      patch(selected.id, { active: false });
      toast.success('Detection settings reset successfully.');
      refreshZoneCamera();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to reset detection settings.');
    } finally {
      setResettingSetting(false);
    }
  };

  useEffect(() => {
    if (!detailCameraId && enteredDetections) {
      setEnteredDetections(false);
      setZoneCamera(null);
      setZoneSettingsOpen(false);
    }
  // Only react to URL changes. Running this effect when `enteredDetections`
  // changes as part of the same click sees the previous search params and
  // immediately closes the detail view, forcing users to click twice.
  }, [detailCameraId]);

  const enterDetections = (camera) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('camera', String(camera?._id || ''));
      return next;
    });
    setZoneCamera(camera);
    // Show the loader in the first rendered frame; the filter effect below
    // performs the request once enteredDetections becomes active.
    setIncidentLoading(true);
    setIncidentError(null);
    setEnteredDetections(true);
  };

  const backToCameraList = () => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('camera');
      return next;
    }, { replace: true });
    setEnteredDetections(false);
    setZoneCamera(null);
    setZoneSettingsOpen(false);
  };

  const fetchCameraWithZones = async (camera, nvr, settingType) => {
    const normalized = cameraWithNvr(camera, nvr);
    if (!normalized || !settingType) return normalized;

    const settingsResult = await getDetectionSettings({
      settingType,
      nvrIds: nvrIdOf(normalized.nvrId) || nvrIdOf(nvr),
      channelIds: normalized._id,
      limit: 100,
    });
    return mergeDetectionSetting(normalized, normalized.nvrId || nvr, settingType, settingsResult);
  };

  const refreshZoneCamera = async () => {
    if (!zoneCameraNvrId) return;
    try {
      const list = await getCamerasByNvr(zoneCameraNvrId);
      const fresh = (list || []).find((camera) => String(camera._id) === String(zoneCamera._id));
      const hydratedCamera = await fetchCameraWithZones(fresh || zoneCamera, zoneCamera.nvrId, selectedSettingType);
      if (hydratedCamera) setZoneCamera(hydratedCamera);
    } catch {
      // The editor already applied the successful local update; skip noisy background refresh errors.
    }
  };

  const handleZoneCameraTypeChange = async (checkType) => {
    if (!zoneCamera?._id || cameraTypeSaving) return;
    const previous = zoneCamera.checkType || 'none';
    if (previous === checkType) return;
    setCameraTypeSaving(true);
    setZoneCamera((prev) => (prev ? { ...prev, checkType } : prev));
    try {
      await updateChannel(zoneCamera._id, { checkType });
      toast.success('Camera type updated.');
      refreshZoneCamera();
    } catch (err) {
      setZoneCamera((prev) => (prev ? { ...prev, checkType: previous } : prev));
      toast.error(err?.response?.data?.body?.message || 'Failed to update camera type.');
    } finally {
      setCameraTypeSaving(false);
    }
  };

  useEffect(() => {
    if (!zoneCamera?._id || !zoneCameraNvrId || !selectedSettingType) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const list = await getCamerasByNvr(zoneCameraNvrId);
        const fresh = (list || []).find((camera) => String(camera._id) === String(zoneCamera._id));
        const hydratedCamera = await fetchCameraWithZones(fresh || zoneCamera, zoneCamera.nvrId, selectedSettingType);
        if (!cancelled && hydratedCamera) setZoneCamera(hydratedCamera);
      } catch {
        // Keep the currently selected camera mounted if a background refresh fails.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSettingType, zoneCamera?._id, zoneCameraNvrId]);

  if (!enteredDetections) {
    return <DetectionSettingsCameraList onOpenCamera={enterDetections} />;
  }

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={backToCameraList}
          style={{
            height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--bd)',
            background: 'var(--bg2)', color: 'var(--tx2)', fontSize: 12.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} />
          Cameras
        </button>
        {zoneCamera && (
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cameraLabel(zoneCamera)}
          </span>
        )}
      </div>

      <div className="vq-kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <StatCard
          label="Detection Models"
          value={loadingValue ?? models.length}
          sub={typesApi.loading ? 'loading from API' : `across ${visibleCategoryCount || 0} categories`}
        />
        <StatCard label="Active Now" value={loadingValue ?? activeCount} sub="running on live streams" color="var(--ok)" />
        <StatCard
          label="Incidents"
          value={incidentFilter && incidentStatsApi.loading
            ? '...'
            : (loadingValue ?? selectedIncidentCount.toLocaleString())}
          sub={incidentFilter ? `${selected?.name || 'Selected detection'} total` : 'all detections combined'}
          color="var(--blue)"
        />
        <StatCard
          label="Selected"
          value={selected?.name || (typesApi.loading ? '...' : '-')}
          sub={`${incidents.length} ${incidents.length === 1 ? 'incident' : 'incidents'} shown`}
          color="var(--blue)"
          small
        />
      </div>

      <div
        style={{
          background: 'var(--bg1)',
          border: '1px solid var(--bd)',
          borderRadius: 12,
          padding: '12px 14px',
        }}
      >
        <div
          className="vq-det-toolbar-row"
          style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}
        >
          <div className="vq-det-search" style={{ position: 'relative', flex: '0 0 200px', minWidth: 170 }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search detections"
              style={{
                width: '100%',
                height: 30,
                padding: '0 11px 0 32px',
                borderRadius: 8,
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                fontSize: 12,
                color: 'var(--tx)',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', minWidth: 0 }}>
            {[{ key: 'all', label: 'All', color: null }, ...DETECTION_CATEGORIES].map((c) => {
              const active = category === c.key;
              return (
                <button key={c.key} type="button" onClick={() => setCategory(c.key)} style={chipStyle(active, !!c.color)}>
                  {c.color && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#fff' : c.color, flex: '0 0 auto' }} />
                  )}
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="vq-det-statetabs" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', flexWrap: 'nowrap' }}>
            {STATE_TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setStateTab(t.key)} style={chipStyle(stateTab === t.key, false)}>
                {t.label}
              </button>
            ))}
            {zoneCamera && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: '0 0 auto' }}>
                <span className="font-bold text-xs">
                  Camera Type :
                </span>
                <span style={{ position: 'relative' }}>
                  <select
                    value={zoneCamera.checkType || 'none'}
                    onChange={(event) => handleZoneCameraTypeChange(event.target.value)}
                    disabled={cameraTypeSaving}
                    style={{
                      height: 30,
                      minWidth: 104,
                      padding: '0 28px 0 10px',
                      borderRadius: 8,
                      background: 'var(--bg2)',
                      border: '1px solid var(--bd)',
                      color: 'var(--tx)',
                      fontSize: 12,
                      outline: 'none',
                      cursor: cameraTypeSaving ? 'wait' : 'pointer',
                      appearance: 'none',
                      opacity: cameraTypeSaving ? 0.72 : 1,
                    }}
                  >
                    {CAMERA_TYPE_OPTIONS.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                  {cameraTypeSaving ? (
                    <span
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        width: 13,
                        height: 13,
                        marginTop: -6.5,
                        borderRadius: '50%',
                        border: '2px solid rgba(99,102,241,.25)',
                        borderTopColor: 'var(--blue)',
                        animation: 'vq-spin .7s linear infinite',
                        pointerEvents: 'none',
                      }}
                    />
                  ) : (
                    <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)' }} />
                  )}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={toggleAllGroupsCollapsed}
              disabled={groups.length === 0}
              title={allVisibleGroupsCollapsed ? 'Expand all detection groups' : 'Collapse all detection groups'}
              style={{
                ...chipStyle(false, false),
                gap: 7,
                opacity: groups.length === 0 ? 0.5 : 1,
                cursor: groups.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {allVisibleGroupsCollapsed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {allVisibleGroupsCollapsed ? 'Expand detections' : 'Collapse detections'}
            </button>
          </div>
        </div>
      </div>

      <AsyncBoundary
        loading={typesApi.loading}
        error={typesApi.error}
        isEmpty={!typesApi.loading && !typesApi.error && models.length === 0}
        onRetry={typesApi.refetch}
        minH={260}
        emptyLabel="No detection types found"
      >
        <div className="vq-det-shell">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
            {groups.length === 0 ? (
              <div
                style={{
                  background: 'var(--bg1)',
                  border: '1px solid var(--bd)',
                  borderRadius: 13,
                  padding: '42px 20px',
                  textAlign: 'center',
                  fontSize: 12.5,
                  color: 'var(--tx3)',
                }}
              >
                No detections match this filter
              </div>
            ) : (
              allVisibleGroupsCollapsed ? (
                <button
                  type="button"
                  onClick={toggleAllGroupsCollapsed}
                  title="Expand all detection groups"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    background: 'var(--bg1)',
                    border: '1px dashed var(--bd)',
                    borderRadius: 12,
                    padding: '14px 15px',
                    fontSize: 12.5,
                    color: 'var(--tx2)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <ChevronRight size={15} style={{ color: 'var(--tx3)', flex: '0 0 auto' }} />
                  <span style={{ fontWeight: 600, color: 'var(--tx)' }}>All detections collapsed</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
                    {hiddenDetectionCount} hidden
                  </span>
                </button>
              ) : groups.map((group) => (
                <div key={group.key} style={{ minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapsed(group.key)}
                    title={`${collapsedGroups[group.key] ? 'Expand' : 'Collapse'} ${group.label} detections`}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10,
                      padding: 0,
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {collapsedGroups[group.key] ? (
                      <ChevronRight size={15} style={{ color: 'var(--tx3)', flex: '0 0 auto' }} />
                    ) : (
                      <ChevronDown size={15} style={{ color: 'var(--tx3)', flex: '0 0 auto' }} />
                    )}
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: group.color,
                        boxShadow: `0 0 7px ${group.color}`,
                        flex: '0 0 auto',
                      }}
                    />
                    <span style={{ fontFamily: 'var(--disp)', fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>
                      {group.label}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
                      {group.items.length}
                    </span>
                  </button>
                  {collapsedGroups[group.key] ? (
                    <div
                      style={{
                        background: 'var(--bg1)',
                        border: '1px dashed var(--bd)',
                        borderRadius: 12,
                        padding: '13px 14px',
                        fontSize: 12,
                        color: 'var(--tx3)',
                      }}
                    >
                      {group.label} detections collapsed - {group.items.length} hidden
                    </div>
                  ) : (
                    <div className="vq-det-cards">
                      {group.items.map((model) => (
                        <DetectionCard
                          key={model.id}
                          model={model}
                          color={group.color}
                          selected={model.id === selected?.id}
                          onSelect={() => selectDetection(model.id)}
                          onToggle={() => toggleModel(model)}
                          toggleDisabled={detectionToggleLoading === (model.settingType || model.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Incidents moved to aside */}
          </div>

          <div className="vq-det-aside">
            {selected && (
              <>
                <div
                  style={{
                    background: 'var(--bg1)',
                    border: '1px solid var(--bd)',
                    borderRadius: 13,
                    padding: zoneCamera ? 16 : '38px 20px',
                    minHeight: zoneCamera ? 0 : 420,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: zoneCamera ? 'flex-start' : 'center',
                  }}
                >
                  {zoneCamera && selectedSettingType ? (
                    <DetectionZoneMarking
                      key={`${zoneCamera._id}-${selectedSettingType}`}
                      camera={zoneCamera}
                      embedded
                      selectedSettingType={selectedSettingType}
                      onSaved={refreshZoneCamera}
                      zoneSettingsOpen={zoneSettingsOpen}
                      onZoneSettingsClose={() => setZoneSettingsOpen(false)}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--tx3)' }}>
                      <div style={{ fontFamily: 'var(--disp)', fontSize: 15, fontWeight: 600, color: 'var(--tx)', marginBottom: 7 }}>
                        Zone Editor
                      </div>
                      <div style={{ fontSize: 12 }}>
                        {selectedSettingType ? 'Select a camera from the list to load the editor.' : 'Loading detection types...'}
                      </div>
                    </div>
                  )}
                </div>
                <DetectionDetailPanel
                  model={selected}
                  category={selectedCategory}
                  settingId={selectedDetectionSettingId}
                  channel={zoneCamera}
                  onToggle={() => toggleModel(selected)}
                  toggleDisabled={detectionToggleLoading === selectedSettingType}
                  onSensitivityChange={(value) => patch(selected.id, { sensitivity: value })}
                  onThresholdChange={updateSelectedThreshold}
                  onEditZones={() => setZoneSettingsOpen(true)}
                  onResetSetting={() => {
                    if (!selectedDetectionSettingId) {
                      toast.error('No detection settings found to reset.');
                      return;
                    }
                    setShowResetConfirm(true);
                  }}
                  resetDisabled={resettingSetting || !selectedDetectionSettingId}
                  initialAlerts={selectedDetectionAlerts}
                  onRecipientsChange={updateSelectedRecipients}
                  onScheduleSaved={refreshZoneCamera}
                />
                <DetectionIncidents
                  detectionName={selected.name}
                  incidents={incidents}
                  loading={incidentPanelLoading}
                  loadingMore={incidentLoadingMore}
                  error={incidentError}
                  onRetry={() => loadIncidents({ skip: 0, append: false })}
                  totalCount={incidentTotalCount}
                  hasMore={hasMoreIncidents}
                  onLoadMore={loadMoreIncidents}
                  dateFrom={incidentDateFrom}
                  dateTo={incidentDateTo}
                  onDateFromChange={setIncidentDateFrom}
                  onDateToChange={setIncidentDateTo}
                  onDateClear={() => {
                    setIncidentDateFrom('');
                    setIncidentDateTo('');
                  }}
                  severity={incidentSeverity}
                  onSeverityChange={(value) => {
                    if (value === incidentSeverity || incidentLoading) return;
                    if (selectedIncidentType) setIncidentLoading(true);
                    setIncidentError(null);
                    setIncidentSeverity(value);
                  }}
                />
              </>
            )}
          </div>
        </div>
      </AsyncBoundary>

      <ConfirmDialog
        open={showResetConfirm}
        title="Reset Detection UI"
        busy={resettingSetting}
        busyLabel="Resetting..."
        confirmLabel="Reset Setting"
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={handleResetSetting}
      >
        <strong>Warning:</strong> This will reset the selected detection settings to their default values. This action cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
