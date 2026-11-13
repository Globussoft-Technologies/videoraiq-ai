import { machineOpsId } from '../../../../../helpers/machineOpsDetection';

export default function MachineOpsFields({ name, id, disabled, error, onNameChange }) {
  const style = { width: '100%', minWidth: 0, height: 34, padding: '0 10px', boxSizing: 'border-box', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--tx)', fontSize: 12 };
  return <div style={{ display: 'grid', gap: 7 }}>
    <label htmlFor={`${id}-name`} style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)' }}>Machine Name *</label>
    <input id={`${id}-name`} value={name} maxLength={50} onChange={event => onNameChange(event.target.value)} disabled={disabled} aria-invalid={!!error} style={style} />
    <span style={{ fontSize: 10, color: 'var(--tx3)', overflowWrap: 'anywhere' }}>Machine ID: {machineOpsId(name) || '—'}</span>
    {error && <span style={{ fontSize: 10, color: 'var(--crit)' }}>Machine name is required.</span>}
    <p style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--tx3)', margin: 0 }}>Machine Zone and Indicator Zone belong to this machine and share this name.</p>
  </div>;
}
