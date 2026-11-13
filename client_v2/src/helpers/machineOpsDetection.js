export const MACHINE_OPS_SETTING_TYPE = 'machineOpsDetectionSettings';

export function rectangleZone(start, end) {
  const left = Math.min(start[0], end[0]), right = Math.max(start[0], end[0]);
  const top = Math.min(start[1], end[1]), bottom = Math.max(start[1], end[1]);
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

export function machineOpsFormError(machines) {
  if (!machines.length) return 'Add at least one machine.';
  if (machines.length > 32) return 'A camera supports up to 32 machines.';
  if (new Set(machines.map(m => m.machineId)).size !== machines.length) return 'Machine IDs must be unique.';
  for (const machine of machines) {
    if (!machine.name.trim()) return 'Give every machine a name.';
    if (!machine.machineZone?.length || !machine.indicatorZone?.length) return `${machine.name}: draw both zones.`;
  }
  return '';
}
