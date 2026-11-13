import { groupMachineOpsZones } from '../../../../../helpers/machineOpsDetection';
import MachineOpsFields from './MachineOpsFields';

export default function MachineOpsGroups({ zones, enabled, onUpdateField, disabled, errors = {}, id, children }) {
  if (!enabled) return zones.map(children);
  return groupMachineOpsZones(zones).map((group, groupIndex) => (
    <section key={group.entries[0].index} aria-label={`Machine ${groupIndex + 1}`} style={{ border: '1px solid var(--bd)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>Machine {groupIndex + 1}</div>
      <MachineOpsFields name={group.name} id={`${id}-${group.entries[0].index}`} disabled={disabled}
        error={group.entries.some(({ index }) => errors[`zone-${index}-name`])}
        onNameChange={name => group.entries.forEach(({ index }) => onUpdateField(index, 'name', name))} />
      {group.entries.map(({ zone, index }) => children(zone, index))}
      {group.missingRoles.map(role => <div key={role} style={{ fontSize: 11, color: 'var(--warn)', padding: 8, border: '1px dashed var(--bd)', borderRadius: 8 }}>
        {role === 'machine' ? 'Machine Zone' : 'Indicator Zone'} not drawn. Draw the next polygon on the camera to complete this machine.
      </div>)}
    </section>
  ));
}
