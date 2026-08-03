import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  DETECTION_CATEGORIES,
  CATEGORY_BY_KEY,
  DETECTION_MODELS,
  getIncidents,
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

const DEFAULT_SELECTED = 'faceRecognition';

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

/**
 * Detections (Configure → after Cameras & NVRs).
 *
 * Catalogue of every AI detection model grouped by category, with the selected
 * model's configuration and recent incidents in the right-hand panel. Same page
 * for admins and sub-users — nothing here is role-specific.
 *
 * UI only for now: the catalogue comes from detectionsData.js and every edit
 * (enable/disable, sensitivity) lives in local state, so the page is fully
 * interactive while the detections API is being built. Swapping the three data
 * sources in detectionsData.js for real calls is the only change needed.
 */
export default function Detections() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [stateTab, setStateTab] = useState('all');
  const [selectedId, setSelectedId] = useState(DEFAULT_SELECTED);
  // Local edits keyed by model id — { [id]: { active, sensitivity } }.
  const [edits, setEdits] = useState({});

  const models = useMemo(
    () => DETECTION_MODELS.map((m) => ({ ...m, ...(edits[m.id] || {}) })),
    [edits],
  );

  const selected = models.find((m) => m.id === selectedId) || models[0];
  const selectedCategory = CATEGORY_BY_KEY[selected?.category];
  const incidents = useMemo(() => getIncidents(selected), [selected]);

  const activeCount = models.filter((m) => m.active).length;
  const incidents24h = models.reduce((sum, m) => sum + m.incidents24h, 0);

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

  // Keep the prototype's category order; drop groups with nothing in them.
  const groups = useMemo(
    () =>
      DETECTION_CATEGORIES.map((cat) => ({
        ...cat,
        items: filtered.filter((m) => m.category === cat.key),
      })).filter((g) => g.items.length > 0),
    [filtered],
  );

  const patch = (id, changes) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...changes } }));
  const toggleModel = (model) => patch(model.id, { active: !model.active });

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI row */}
      <div className="vq-kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <StatCard label="Detection Models" value={models.length} sub={`across ${DETECTION_CATEGORIES.length} categories`} />
        <StatCard label="Active Now" value={activeCount} sub="running on live streams" color="var(--ok)" />
        <StatCard label="Incidents · 24h" value={incidents24h.toLocaleString()} sub="all detections combined" color="var(--blue)" />
        <StatCard
          label="Selected"
          value={selected?.name || '—'}
          sub={`${incidents.length} ${incidents.length === 1 ? 'incident' : 'incidents'} shown`}
          color="var(--blue)"
          small
        />
      </div>

      {/* Toolbar panel: search · category chips · state chips */}
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
          </div>
        </div>
      </div>

      {/* Catalogue + selected-detection panel */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
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
                </div>
                <div className="vq-det-cards">
                  {group.items.map((model) => (
                    <DetectionCard
                      key={model.id}
                      model={model}
                      color={group.color}
                      selected={model.id === selected?.id}
                      onSelect={() => setSelectedId(model.id)}
                      onToggle={() => toggleModel(model)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="vq-det-aside">
          {selected && (
            <>
              <DetectionDetailPanel
                model={selected}
                category={selectedCategory}
                onToggle={() => toggleModel(selected)}
                onSensitivityChange={(value) => patch(selected.id, { sensitivity: value })}
                // Zones, rules and per-camera assignment already live in
                // Detection Settings — point the actions there until the
                // detections API exposes its own endpoints for them.
                onEditZones={() => navigate('/engines')}
                onAssignCameras={() => navigate('/engines')}
              />
              <DetectionIncidents incidents={incidents} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
