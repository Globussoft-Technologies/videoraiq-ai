import { DOOR_ALERT_MODE_OPTIONS } from '../constants';

const selectStyle = {
  width: '100%', height: 40, padding: '0 12px', borderRadius: 9,
  border: '1px solid var(--bd)', background: 'var(--bg1solid)',
  color: 'var(--tx)', fontSize: 13, cursor: 'pointer',
};

export default function DoorAlertRules({ mode, onModeChange, notification, onNotificationChange, saving = false, onSave }) {
  return (
    <div style={{ display: 'grid', gap: 14, border: '1px solid var(--bd)', borderRadius: 12, padding: 14, background: 'var(--bg2)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>Alert rules</div>
      <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--tx2)' }}>
        Alert when door is
        <select value={mode} onChange={event => onModeChange(event.target.value)} disabled={saving} style={selectStyle}>
          {DOOR_ALERT_MODE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 12px', border: '1px solid var(--bd)', borderRadius: 9, background: 'var(--bg1solid)', cursor: 'pointer' }}>
        <span style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>Send notification</span>
          <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>Incidents are saved even when notifications are off.</span>
        </span>
        <input type="checkbox" checked={notification} onChange={event => onNotificationChange(event.target.checked)} disabled={saving}
          aria-label="Send door detection notifications" style={{ width: 16, height: 16, flex: '0 0 auto', accentColor: 'var(--blue)' }} />
      </label>
      <div style={{ fontSize: 10.5, color: 'var(--tx3)', lineHeight: 1.4 }}>Alerts repeat after each selected period. A resolved incident is recorded when the door changes state.</div>
      {onSave && <button type="button" onClick={onSave} disabled={saving}
        style={{ justifySelf: 'end', height: 34, padding: '0 13px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving...' : 'Save alert rules'}
      </button>}
    </div>
  );
}
