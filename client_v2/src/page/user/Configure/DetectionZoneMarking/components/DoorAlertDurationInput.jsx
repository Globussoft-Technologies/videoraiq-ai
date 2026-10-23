const PRESETS = [1, 5, 10, 30];

export default function DoorAlertDurationInput({ value, onChange, error, compact = false }) {
  const seconds = Number(value);
  const preset = PRESETS.includes(seconds / 60);
  const buttonStyle = (selected) => ({
    height: compact ? 32 : 34,
    minWidth: compact ? 54 : 63,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${selected ? 'var(--blue)' : 'var(--bd)'}`,
    background: selected ? 'rgba(99,102,241,.12)' : 'var(--bg2)',
    color: selected ? 'var(--blue)' : 'var(--tx2)',
    fontSize: 11.5,
    fontWeight: selected ? 700 : 500,
    cursor: 'pointer',
  });

  return (
    <div>
      <div style={{ fontSize: compact ? 10 : 11, fontWeight: 600, color: 'var(--tx2)', marginBottom: 7 }}>Alert after *</div>
      <div role="group" aria-label="Door alert duration" style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {PRESETS.map(minutes => (
          <button key={minutes} type="button" aria-pressed={seconds === minutes * 60}
            onClick={() => onChange(String(minutes * 60))} style={buttonStyle(seconds === minutes * 60)}>
            {minutes} min
          </button>
        ))}
        <button type="button" aria-pressed={!preset} onClick={() => onChange('')}
          style={buttonStyle(!preset)}>Custom</button>
      </div>
      {!preset && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
          <input type="number" min="1" step="1" aria-label="Custom duration in minutes"
            value={value === '' ? '' : seconds / 60}
            onChange={event => onChange(event.target.value === '' ? '' : String(Number(event.target.value) * 60))}
            style={{ width: 105, height: 36, padding: '0 10px', borderRadius: 8, background: 'var(--bg2)', border: `1px solid ${error ? '#ef4444' : 'var(--bd)'}`, color: 'var(--tx)', fontSize: 12 }} />
          <span style={{ color: 'var(--tx3)', fontSize: 11 }}>minutes, minimum 1</span>
        </div>
      )}
      <div style={{ marginTop: 7, color: 'var(--tx3)', fontSize: 10.5 }}>Repeats after each selected period while the door stays in that state.</div>
      {error && <div style={{ marginTop: 5, color: '#ef4444', fontSize: 11 }}>Enter a whole number of minutes, at least 1.</div>}
    </div>
  );
}
