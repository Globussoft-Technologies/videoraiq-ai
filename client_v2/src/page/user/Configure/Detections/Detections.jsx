import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../../components/States';
import { useApi } from '../../../../hooks/useApi';
import { getCamerasByNvr, getDetectionSettings, getDetectionTypes, toggleChannelDetection } from '../../../../helpers/configure';
import { fetchIncidents } from '../../../../helpers/incidents';
import { timeOfDay } from '../../../../lib/format';
import DetectionZoneMarking from '../DetectionZoneMarking';
import { DetectionSettingsCameraList } from '../DetectionSettings';
import {
  DETECTION_CATEGORIES,
  CATEGORY_BY_KEY,
  buildDetectionModels,
  emptyIncidents,
} from './detectionsData';
import DetectionCard from './DetectionCard';
import DetectionDetailPanel from './DetectionDetailPanel';
import DetectionIncidents from './DetectionIncidents';
import './detections.css';

const STATE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
];

const INCIDENT_PAGE_SIZE = 50;

/** One chip style for every filter in the toolbar (category + state). */
const chipStyle = (active, hasDot) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 28,
  padding: hasDot ? '0 12px 0 10px' : '0 14px',
  borderRadius: 8,
  fontSize: 11.5,
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
  const base = cameraWithNvr(linkedCamera || camera, linkedCamera?.nvrId || nvr);
  const setting = getDetectionSetting(item);
  if (!base || !setting?._id) return base;

  const existingEntry = base.detections?.[settingType] || camera?.detections?.[settingType] || {};
  const existingEnabled = typeof existingEntry === 'object' ? existingEntry.enabled : existingEntry;
  return {
    ...base,
    detections: {
      ...(base.detections || {}),
      [settingType]: {
        ...(typeof existingEntry === 'object' ? existingEntry : {}),
        enabled: existingEnabled ?? setting.enabled ?? true,
        id: setting,
      },
    },
  };
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
  const incidentRequestIdRef = useRef(0);
  const typesApi = useApi(() => getDetectionTypes(), [], { initialData: {} });

  const models = useMemo(
    () => buildDetectionModels(typesApi.data).map((m) => {
      const edited = edits[m.id] || {};
      const settingType = m.settingType || m.id;
      const cameraEntry = zoneCamera?.detections?.[settingType];
      const cameraEnabled = typeof cameraEntry === 'object' ? cameraEntry?.enabled : cameraEntry;
      const cameraScopedActive = zoneCamera?._id ? !!cameraEnabled : m.active;
      return { ...m, ...edited, active: cameraScopedActive };
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
  const incidentFilter = useMemo(() => {
    if (!enteredDetections) return null;
    const severity = severityFilterValue(incidentSeverity);
    return {
      ...(severity ? { severity } : {}),
      ...(incidentDateFrom && incidentDateTo ? { startDate: incidentDateFrom, endDate: incidentDateTo } : {}),
    };
  }, [enteredDetections, incidentDateFrom, incidentDateTo, incidentSeverity]);
  const incidentFilterKey = useMemo(() => JSON.stringify(incidentFilter || {}), [incidentFilter]);

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
  const activeCount = models.filter((m) => m.active).length;
  const incidents24h = incidentFilter ? incidentTotalCount : models.reduce((sum, m) => sum + m.incidents24h, 0);
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

  const toggleGroupCollapsed = (groupKey) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
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

  const enterDetections = (camera) => {
    setZoneCamera(camera);
    setEnteredDetections(true);
  };

  const backToCameraList = () => {
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
          <span style={{ fontSize: 12, color: 'var(--tx3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <StatCard label="Active Now" value={loadingValue ?? activeCount} sub="catalogue state" color="var(--ok)" />
        <StatCard label="Incidents - 24h" value={loadingValue ?? incidents24h.toLocaleString()} sub="from detection types API" color="var(--blue)" />
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
          style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
        >
          <div className="vq-det-search" style={{ position: 'relative', flex: '0 1 200px', minWidth: 160 }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
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

          <div className="vq-det-statetabs" style={{ marginLeft: 'auto', display: 'flex', gap: 8, flex: '0 0 auto' }}>
            {STATE_TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setStateTab(t.key)} style={chipStyle(stateTab === t.key, false)}>
                {t.label}
              </button>
            ))}
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
              groups.map((group) => (
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
                          onSelect={() => setSelectedId(model.id)}
                          onToggle={() => toggleModel(model)}
                          toggleDisabled={detectionToggleLoading === (model.settingType || model.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

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
          </div>

          <div className="vq-det-aside">
            {selected && (
              <>
                <DetectionDetailPanel
                  model={selected}
                  category={selectedCategory}
                  onToggle={() => toggleModel(selected)}
                  toggleDisabled={detectionToggleLoading === selectedSettingType}
                  onSensitivityChange={(value) => patch(selected.id, { sensitivity: value })}
                  onEditZones={() => setZoneSettingsOpen(true)}
                />
                <DetectionIncidents
                  incidents={incidents}
                  loading={incidentLoading}
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
                  onSeverityChange={setIncidentSeverity}
                />
              </>
            )}
          </div>
        </div>
      </AsyncBoundary>
    </div>
  );
}
