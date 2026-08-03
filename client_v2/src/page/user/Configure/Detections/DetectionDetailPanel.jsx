import { Toggle } from '../../../../components/primitives';

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
  onEditZones,
}) {
  const Icon = category?.icon;
  const color = category?.color || 'var(--blue)';
  const sensitivity = model.sensitivity;
  const appliedCameras = model.appliedCameras == null ? 'N/A' : model.appliedCameras;
  const minConfidence = model.minConfidence == null ? 'N/A' : `${model.minConfidence}%`;

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
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--tx3)', marginTop: 3 }}>
            {category?.label} · {model.subtitle}
          </span>
        </span>
        <span style={{ flex: '0 0 auto' }}>
          <Toggle on={model.active} onChange={onToggle} disabled={toggleDisabled} />
        </span>
      </div>

      {/* Sensitivity — label, track and value on one row (as in the design). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <span style={{ fontSize: 11.5, color: 'var(--tx2)', flex: '0 0 auto' }}>Sensitivity</span>
        <input
          type="range"
          className="vq-det-range"
          min={0}
          max={100}
          value={sensitivity}
          disabled={!model.active}
          onChange={(e) => onSensitivityChange(Number(e.target.value))}
          aria-label={`${model.name} sensitivity`}
          style={{
            flex: 1,
            minWidth: 0,
            background: `linear-gradient(90deg, var(--blue) 0%, var(--violet) ${sensitivity}%, var(--sliderrest) ${sensitivity}%, var(--sliderrest) 100%)`,
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
            color: 'var(--blue)',
          }}
        >
          {sensitivity}
        </span>
      </div>

      {/* Config stats */}
      <div
        className="vq-det-detail-stats"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 16 }}
      >
        <StatBox
          label="Status"
          value={model.active ? 'Active' : 'Paused'}
          color={model.active ? 'var(--ok)' : 'var(--tx3)'}
        />
        <StatBox label="Schedule" value={model.schedule} />
        <StatBox label="Applied Cameras" value={appliedCameras} />
        <StatBox label="Min Confidence" value={minConfidence} color="var(--blue)" />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button
          type="button"
          onClick={onEditZones}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 8,
            border: 0,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            background: 'linear-gradient(135deg,var(--blue),var(--violet))',
            boxShadow: '0 6px 18px rgba(99,102,241,.25)',
          }}
        >
          Edit zones &amp; rules
        </button>
      </div>
    </div>
  );
}
