import { Maximize, Minimize, Pencil, Save, Trash2, Undo2 } from 'lucide-react';

export default function ZoneToolbar({
  activeType,
  isLineCrossing,
  drawing,
  setDrawing,
  videoSize,
  points,
  draftZones,
  zones,
  minPointsToSave,
  saving,
  onMaxArea,
  onMinArea,
  onUndo,
  onClearAll,
  onSave,
}) {
  const hasVideo = !!videoSize.w;
  const hasDrawableContent = points.length > 0 || draftZones.length > 0 || zones.length > 0;
  const canClearAll = drawing && hasDrawableContent;
  const canSave = !!activeType && !saving && (zones.length > 0 || draftZones.length > 0 || points.length >= minPointsToSave);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
      {isLineCrossing ? (
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
          <Pencil size={14} /> {drawing ? 'Stop Drawing' : 'Draw Line'}
        </button>
      ) : (
        <>
          <button
            onClick={onMaxArea}
            disabled={!activeType || !hasVideo}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8,
              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)',
              cursor: (activeType && hasVideo) ? 'pointer' : 'not-allowed', opacity: (activeType && hasVideo) ? 1 : 0.5,
            }}
          >
            <Maximize size={14} /> Max Area
          </button>
          <button
            onClick={onMinArea}
            disabled={!activeType || !hasVideo}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8,
              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)',
              cursor: (activeType && hasVideo) ? 'pointer' : 'not-allowed', opacity: (activeType && hasVideo) ? 1 : 0.5,
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
        </>
      )}
      <button
        onClick={onUndo}
        disabled={!drawing || (points.length === 0 && draftZones.length === 0)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8,
          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)',
          cursor: (drawing && (points.length || draftZones.length)) ? 'pointer' : 'not-allowed',
          opacity: (drawing && (points.length || draftZones.length)) ? 1 : 0.5,
        }}
      >
        <Undo2 size={14} /> Undo
      </button>
      <button
        onClick={onClearAll}
        disabled={!canClearAll}
        title="Clear all the in-progress drawing"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8,
          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)',
          cursor: canClearAll ? 'pointer' : 'not-allowed', opacity: canClearAll ? 1 : 0.5,
        }}
      >
        <Trash2 size={14} /> Clear All
      </button>
      <button
        onClick={onSave}
        disabled={!canSave}
        style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 16px',
          borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: '#fff', border: 'none',
          background: 'linear-gradient(135deg,var(--blue),var(--violet))',
          cursor: canSave ? 'pointer' : 'not-allowed',
          opacity: canSave ? 1 : 0.6,
          boxShadow: '0 3px 12px rgba(99,102,241,.3)',
        }}
      >
        <Save size={14} /> {saving ? 'Saving...' : isLineCrossing ? 'Save Line' : 'Save Area'}
      </button>
    </div>
  );
}
