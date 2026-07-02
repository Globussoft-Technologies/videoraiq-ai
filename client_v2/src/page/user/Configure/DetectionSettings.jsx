import { useState, useMemo, useEffect } from 'react';
import { Search } from 'lucide-react';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getDetectionSettings, updateDetectionSetting, getDetectionTypes } from '../../../helpers/configure';
import { fetchIncidents, fetchIncidentStats } from '../../../helpers/incidents';

// ── detection group colours (same as HTML reference) ─────────────────────────
const DEFAULT_GROUP_COLORS = {
  environment: '#22d3ee',
  vehicle:     '#f59e0b',
  intrusion:   '#ef4444',
  behavior:    '#a855f7',
  access:      '#10b981',
  other:       '#6b7796',
};


const SETTING_TYPE_TO_GROUP = {
  personalProtectiveEquipmentSettings: 'environment',
  vehicleDetectionSettings: 'vehicle',
  unauthorizedAccessSettings: 'intrusion',
  crowdDetectionSettings: 'behavior',
  lineCrossingSettings: 'intrusion',
  countVehiclesSettings: 'vehicle',
  conveyorDetectionSettings: 'environment',
  crusherDetectionSettings: 'environment',
  waterSpillageDetectionSettings: 'environment',
  doorDetectionSettings: 'access',
  lightDetectionSettings: 'environment',
  vehicleObstructionSettings: 'vehicle',
  deskAbsenceSettings: 'behavior',
  guardAbsenceSettings: 'behavior',
  countPersonsSettings: 'behavior',
  vehicleTypeDetectionSettings: 'vehicle',
  loiteringDetectionSettings: 'behavior',
  tableOccupancyDetectionSettings: 'behavior',
  foodServicePPEDetectionSettings: 'environment',
  motionDetectionSettings: 'intrusion',
  genericObjectDetectionSettings: 'environment',
  loiteringWithoutAuthSettings: 'behavior',
  loiteringWithAuthSettings: 'behavior',
  fireSmokeDetectionSettings: 'environment',
  weaponDetectionSettings: 'intrusion',
  unattendedBaggageDetectionSettings: 'intrusion',
};

const TYPE_MAP = {
  countPersonsSettings: "countPersons",
  motionDetectionSettings: "motionDetection",
  genericObjectDetectionSettings: "genericObjectDetection",
  countVehiclesSettings: "countVehicles",
  loiteringWithoutAuthSettings: "loiteringWithoutAuth",
  loiteringWithAuthSettings: "loiteringWithAuth",
  unauthorizedAccessSettings: "unauthorizedAccess",
  lineCrossingSettings: "lineCrossing",
  fireSmokeDetectionSettings: "fireSmokeDetection",
  weaponDetectionSettings: "weaponDetection",
  unattendedBaggageDetectionSettings: "unattendedBaggageDetection",
  personalProtectiveEquipmentSettings: "personalProtectiveEquipment",
  crowdDetectionSettings: "crowdDetection",
  doorDetectionSettings: "doorDetection",
  lightDetectionSettings: "lightDetection",
  vehicleDetectionSettings: "vehicleDetection",
  deskAbsenceSettings: "deskAbsence",
  guardAbsenceSettings: "guardAbsence",
  conveyorDetectionSettings: "conveyorDetection",
  crusherDetectionSettings: "crusherDetection",
  waterSpillageDetectionSettings: "waterSpillageDetection",
  vehicleTypeDetectionSettings: "vehicleTypeDetection",
  loiteringDetectionSettings: "loiteringDetection",
  vehicleObstructionSettings: "vehicleObstruction",
  tableOccupancyDetectionSettings: "tableOccupancySettings",
  foodServicePPEDetectionSettings: "foodServicePPEDetection",
};

function getGroupKey(settingType) {
  return SETTING_TYPE_TO_GROUP[settingType] || 'other';
}

function getGroupColor(settingType) {
  const gk = getGroupKey(settingType);
  return groupColors[gk] || DEFAULT_GROUP_COLORS['other'];
}

function getGroupName(settingType) {
  const gk = getGroupKey(settingType);
  return gk.charAt(0).toUpperCase() + gk.slice(1);
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, color = '#3b82f6' }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(!value); }}
      style={{
        width: 34, height: 18, borderRadius: 9, flexShrink: 0,
        background: value ? color : 'var(--bg3, #2a2d3e)',
        border: `1px solid ${value ? color : 'var(--bd)'}`,
        position: 'relative', cursor: 'pointer',
        transition: 'background .2s, border-color .2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: value ? 18 : 2,
        width: 12, height: 12, borderRadius: '50%',
        background: '#fff',
        transition: 'left .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,.4)',
      }} />
    </div>
  );
}

// ── detection card in catalog ─────────────────────────────────────────────────
function DetCard({ item, selected, onSelect, onToggle, enabled, gColor }) {
  const d = item.detectionSetting || {};

  return (
    <div
      onClick={onSelect}
      style={{
        background: 'var(--bg2)',
        border: `1px solid ${selected ? gColor : 'var(--bd)'}`,
        borderRadius: 12, padding: 12, cursor: 'pointer',
        boxShadow: selected ? `inset 0 0 0 1px ${gColor}` : 'none',
        transition: 'border-color .15s, transform .15s',
        transform: selected ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 2,
          background: gColor, boxShadow: `0 0 6px ${gColor}`, flexShrink: 0,
        }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, flex: 1, minWidth: 0, color: 'var(--tx)' }}>
          {d.name || 'Unknown'}
        </span>
        <Toggle value={enabled} onChange={onToggle} color={gColor} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', textTransform: 'uppercase' }}>
          {d.detectionName || d.settingType?.replace('Settings', '') || '—'}
        </span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
          color: enabled ? gColor : 'var(--tx3)',
        }}>
          {item.linkedCameras?.length ?? 0} cameras
        </span>
      </div>
    </div>
  );
}

// ── detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({ item, enabled, onToggle, sensitivity, onSensChange, incidents, incLoading, incSev, setIncSev, getGroupColor, getGroupName }) {
  if (!item) return (
    <div style={{
      background: 'var(--bg1)', border: '1px solid var(--bd)',
      borderRadius: 14, padding: 32, textAlign: 'center', color: 'var(--tx3)', fontSize: 12,
    }}>
      Select a detection to configure
    </div>
  );

  const d = item.detectionSetting || {};
  const gColor = getGroupColor(d.settingType);
  const statusColor = enabled ? '#22c55e' : '#6b7796';

  const SEVC = { crit: '#ff4d4d', high: '#f5a623', med: '#3b82f6', low: '#6b7796' };
  const SEVS = { crit: 'CRIT', high: 'HIGH', med: 'MED', low: 'LOW' };
  const STC = { new: '#ff4d4d', ack: '#f5a623', resolved: '#22c55e' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0 }}>
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 15 }}>
          <span style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: `${gColor}22`, border: `1px solid ${gColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: gColor, boxShadow: `0 0 8px ${gColor}` }} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
              {d.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
              {getGroupName(d.settingType)} · {d.detectionName || d.settingType?.replace('Settings', '')}
            </div>
          </div>
          <Toggle value={enabled} onChange={onToggle} color={gColor} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--tx2)', width: 74, flexShrink: 0 }}>Sensitivity</span>
          <input
            type="range" min={0} max={100} value={sensitivity}
            onChange={e => onSensChange(+e.target.value)}
            style={{ flex: 1, accentColor: gColor, height: 4, cursor: 'pointer' }}
          />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: gColor, width: 30, textAlign: 'right', flexShrink: 0 }}>
            {sensitivity}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
          {[
            { label: 'Status',            value: enabled ? 'Active' : 'Paused',  color: statusColor },
            { label: 'Schedule',          value: '24 / 7',                        color: null },
            { label: 'Applied Cameras',   value: item.linkedCameras?.length ?? 0, color: null },
            { label: 'Min Confidence',    value: `${sensitivity}%`,              color: gColor, mono: true },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 9, padding: '9px 11px' }}>
              <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: s.color || 'var(--tx)', fontFamily: s.mono ? 'var(--mono)' : undefined }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '13px 15px 11px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13.5 }}>Incidents</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginLeft: 'auto' }}>
              {incidents.length} matching
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['all', 'All'], ['crit', 'Critical'], ['high', 'High'], ['med', 'Medium'], ['low', 'Low']].map(([k, label]) => {
              const active = incSev === k;
              const col = k === 'all' ? 'var(--blue)' : SEVC[k];
              return (
                <div
                  key={k}
                  onClick={() => setIncSev(k)}
                  style={{
                    padding: '4px 11px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    color: active ? '#fff' : 'var(--tx2)',
                    background: active ? col : 'var(--bg2)',
                    border: `1px solid ${active ? col : 'var(--bd)'}`
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {incLoading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--tx3)' }}>Loading incidents...</div>
          ) : incidents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--tx3)' }}>No matching incidents</div>
          ) : (
            incidents.map((a, i) => {
              const sKey = (a.severity || 'low').toLowerCase();
              const sevColor = SEVC[sKey] || SEVC.low;
              const sevShort = SEVS[sKey] || 'LOW';
              const statusColor = STC[a.resolved ? 'resolved' : a.report?.status === true ? 'ack' : 'new'];
              const statusLabel = a.resolved ? 'Resolved' : a.report?.status === true ? 'Ack' : 'New';
              const timeStr = a.createdAt ? new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
              
              return (
                <div key={a._id || i} style={{ display: 'flex', gap: 10, padding: 10, borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
                  <div style={{ width: 3, borderRadius: 2, background: sevColor, flexShrink: 0 }}></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 600, color: sevColor, border: `1px solid ${sevColor}`, borderRadius: 4, padding: '1px 5px' }}>
                        {sevShort}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)', marginLeft: 'auto' }}>
                        {timeStr}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.3, fontWeight: 500, color: 'var(--tx)' }}>
                      {a.title || a.message || 'Detection Event'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--tx3)' }}>
                        {a.cameraName || a.cameraId?.name || 'Camera'} · {a.location || 'Site'} · {Math.round((a.confidenceScore || 0.9) * 100)}%
                      </span>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: statusColor, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }}></span>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 13, padding: 15 }}>
      <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 25, marginTop: 5, color: color || 'var(--tx)' }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ── group filter chip ─────────────────────────────────────────────────────────
function GroupChip({ label, color, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap',
        color: active ? '#fff' : 'var(--tx2)',
        background: active ? color : 'var(--bg2)',
        border: `1px solid ${active ? color : 'var(--bd)'}`,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#fff' : color }} />
      {label}
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
export default function DetectionSettings() {
  const [search, setSearch]       = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId]   = useState(null);
  const [enabled, setEnabled]     = useState({});
  const [sensitivity, setSensitivity] = useState({});
  const [detTypesMap, setDetTypesMap] = useState({});
  const [groupColors, setGroupColors] = useState(DEFAULT_GROUP_COLORS);

  const [incidents, setIncidents] = useState([]);
  const [incLoading, setIncLoading] = useState(false);
  const [incSev, setIncSev] = useState('all');

  const detApi = useApi(() => getDetectionSettings({ limit: 200 }), []);
  const allDet = detApi.data?.settings ?? (Array.isArray(detApi.data) ? detApi.data : []);

  const statsApi = useApi(() => fetchIncidentStats({}), []);
  const totalIncidentsCount = statsApi.data ? (
    (statsApi.data.critical || 0) + 
    (statsApi.data.high || 0) + 
    (statsApi.data.medium || 0) + 
    (statsApi.data.low || 0)
  ) : 0;

  useEffect(() => {
    let cancelled = false;
    getDetectionTypes().then(map => {
      if (cancelled) return;
      const types = map?.detectionTypes ?? map ?? {};
      setDetTypesMap(types);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const getGroupKey = (settingType) => SETTING_TYPE_TO_GROUP[settingType] || 'other';
  const getGroupColor = (settingType) => groupColors[getGroupKey(settingType)] || DEFAULT_GROUP_COLORS['other'];
  const getGroupName = (settingType) => {
    const gk = getGroupKey(settingType);
    return gk.charAt(0).toUpperCase() + gk.slice(1);
  };

  const isEnabled = (item) => {
    const d = item?.detectionSetting;
    if (!d) return false;
    return enabled[d._id] !== undefined ? enabled[d._id] : (d.enabled ?? true);
  };

  const getSens = (item) => {
    const d = item?.detectionSetting;
    if (!d) return 75;
    return sensitivity[d._id] !== undefined ? sensitivity[d._id] : (d.settings?.minConfidence ?? d.settings?.sensitivity ?? 75);
  };

  const handleToggle = async (item, val) => {
    const d = item.detectionSetting;
    if (!d) return;
    setEnabled(p => ({ ...p, [d._id]: val }));
    try { await updateDetectionSetting(d._id, { enabled: val }); } catch (err) {}
  };

  const handleSensChange = async (item, val) => {
    const d = item.detectionSetting;
    if (!d) return;
    setSensitivity(p => ({ ...p, [d._id]: val }));
    try { await updateDetectionSetting(d._id, { settings: { minConfidence: val, sensitivity: val } }); } catch (err) {}
  };

  const groups = useMemo(() => {
    const seen = {};
    allDet.forEach(item => {
      const d = item.detectionSetting;
      if (!d) return;
      const gKey = getGroupKey(d.settingType);
      const gName = getGroupName(d.settingType);
      const gColor = getGroupColor(d.settingType);
      if (!seen[gKey]) seen[gKey] = { key: gKey, name: gName, color: gColor };
    });
    return Object.values(seen);
  }, [allDet]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allDet.filter(item => {
      const d = item.detectionSetting;
      if (!d) return false;
      const nameMatch = !q || (d.name || '').toLowerCase().includes(q) || (d.detectionName || d.settingType || '').toLowerCase().includes(q);
      const groupMatch = groupFilter === 'all' || getGroupKey(d.settingType) === groupFilter;
      const on = isEnabled(item);
      const statMatch = statusFilter === 'all' || (statusFilter === 'active' ? on : !on);
      return nameMatch && groupMatch && statMatch;
    });
  }, [allDet, search, groupFilter, statusFilter, enabled]);

  const buckets = useMemo(() => {
    const map = {};
    filtered.forEach(item => {
      const d = item.detectionSetting;
      if (!d) return;
      const gKey = getGroupKey(d.settingType);
      const gName = getGroupName(d.settingType);
      const gColor = getGroupColor(d.settingType);
      if (!map[gKey]) map[gKey] = { key: gKey, name: gName, color: gColor, items: [] };
      map[gKey].items.push(item);
    });
    return Object.values(map);
  }, [filtered]);

  const selectedDet = useMemo(() => {
    if (selectedId) return allDet.find(item => item.detectionSetting?._id === selectedId) || allDet[0] || null;
    return allDet[0] || null;
  }, [allDet, selectedId]);

  useEffect(() => {
    if (!selectedDet) return;
    const d = selectedDet.detectionSetting;
    if (!d) return;
    const incidentType = TYPE_MAP[d.settingType];
    if (!incidentType) { setIncidents([]); return; }
    setIncLoading(true);
    fetchIncidents({ skip: 0, limit: 30 }, { incidentTypeFilter: [incidentType] })
      .then(res => setIncidents(res.items || []))
      .catch(() => {})
      .finally(() => setIncLoading(false));
  }, [selectedDet]);

  const filteredIncidents = useMemo(() => {
    if (incSev === 'all') return incidents;
    return incidents.filter(a => {
      const sev = (a.severity || 'low').toLowerCase();
      if (incSev === 'crit') return sev === 'crit' || sev === 'critical';
      return sev === incSev;
    });
  }, [incidents, incSev]);

  const activeCount = allDet.filter(item => isEnabled(item)).length;
  const totalCount  = allDet.length;

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @media (max-width: 1024px) { .vq-catalog { grid-template-columns: 1fr !important; } .vq-kpi-row { grid-template-columns: repeat(2,1fr) !important; } }
      `}</style>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }} className="vq-kpi-row">
        <KpiTile label="Detection Models" value={totalCount} sub={`across ${groups.length} categories`} />
        <KpiTile label="Active Now" value={activeCount} sub="running on live streams" color="var(--ok)" />
        <KpiTile label="Incidents · 24h" value={totalIncidentsCount} sub="all detections combined" color="var(--blue)" />
        <KpiTile label="Selected" value={<span style={{ fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', color: selectedDet ? getGroupColor(selectedDet.detectionSetting?.settingType) : 'var(--tx3)' }}>{selectedDet?.detectionSetting?.name || '—'}</span>} sub={`${filteredIncidents.length} incidents shown`} />
      </div>

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 13, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 11px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--tx3)' }}>
          <Search size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search detections" style={{ background: 'transparent', border: 0, outline: 'none', fontSize: 12.5, width: 150, color: 'var(--tx)' }} />
        </div>
        <div style={{ width: 1, height: 22, background: 'var(--bd)' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          <GroupChip label="All" color="#3b82f6" active={groupFilter === 'all'} onClick={() => setGroupFilter('all')} />
          {groups.map(g => ( <GroupChip key={g.key} label={g.name} color={g.color} active={groupFilter === g.key} onClick={() => setGroupFilter(g.key)} /> ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['all', 'All'], ['active', 'Active'], ['paused', 'Paused']].map(([k, l]) => {
            const active = statusFilter === k;
            return (
              <button key={k} onClick={() => setStatusFilter(k)} style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                color: active ? '#fff' : 'var(--tx2)',
                background: active ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg2)',
                border: `1px solid ${active ? 'transparent' : 'var(--bd)'}`,
                transition: 'background 0.2s, color 0.2s',
              }}>
                {l}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 16, alignItems: 'start' }} className="vq-catalog">
        <AsyncBoundary loading={detApi.loading} error={detApi.error} isEmpty={!detApi.loading && !detApi.error && filtered.length === 0} onRetry={detApi.refetch} minH={200} emptyLabel="No detections found">
          {() => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {buckets.map(b => (
                <div key={b.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: b.color, boxShadow: `0 0 8px ${b.color}` }} />
                    <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13.5, color: 'var(--tx)' }}>{b.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{b.items.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {b.items.map(item => (
                      <DetCard key={item.detectionSetting?._id} item={item} gColor={b.color} selected={selectedDet?.detectionSetting?._id === item.detectionSetting?._id} enabled={isEnabled(item)} onSelect={() => setSelectedId(item.detectionSetting?._id)} onToggle={(v) => handleToggle(item, v)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AsyncBoundary>
        {/* Right: detail panel */}
        <DetailPanel
          item={selectedDet}
          enabled={selectedDet ? isEnabled(selectedDet) : false}
          onToggle={(v) => selectedDet && handleToggle(selectedDet, v)}
          sensitivity={selectedDet ? getSens(selectedDet) : 75}
          onSensChange={(v) => selectedDet && handleSensChange(selectedDet, v)}
          incidents={filteredIncidents}
          incLoading={incLoading}
          incSev={incSev}
          setIncSev={setIncSev}
          getGroupColor={getGroupColor}
          getGroupName={getGroupName}
        />
      </div>
    </div>
  );
}
