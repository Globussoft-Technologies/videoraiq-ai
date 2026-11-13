export const MACHINE_OPS_SETTING_TYPE = 'machineOpsDetectionSettings';
export const machineOpsId = name => String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
export const MACHINE_OPS_LOG_FIELDS = Object.freeze([
  { key: 'snap', label: 'Snapshot' },
  { key: 'nvrName', label: 'NVR Name', sortField: 'nvrData.nvrName' },
  { key: 'channelName', label: 'Camera Name', sortField: 'channelData.name' },
  { key: 'machineName', label: 'Machine Name', sortField: 'machineName' },
  { key: 'machineState', label: 'Machine State', sortField: 'machineState' },
  { key: 'description', label: 'Description', sortField: 'description' },
  { key: 'timeOfIncident', label: 'Time of Incident', sortField: 'timeOfIncident' },
]);

export function machineOpsZoneSettings(zone = {}, index = 0) {
  return {
    machine_id: zone.machine_id ?? `machine-${Math.floor(index / 2) + 1}`,
    zone_role: zone.zone_role ?? (index % 2 ? 'indicator' : 'machine'),
  };
}

export function groupMachineOpsZones(zones) {
  const groups = new Map();
  zones.forEach((zone, index) => {
    const fields = machineOpsZoneSettings(zone, index);
    const group = groups.get(fields.machine_id) || { machineId: fields.machine_id, entries: [] };
    group.entries.push({ zone, index, role: fields.zone_role });
    groups.set(fields.machine_id, group);
  });
  return [...groups.values()].map(group => ({ ...group,
    name: (group.entries.find(entry => entry.role === 'machine') || group.entries[0]).zone.name || '',
    missingRoles: ['machine', 'indicator'].filter(role => !group.entries.some(entry => entry.role === role)),
  }));
}

export function nextMachineOpsZone(zones) {
  const groups = groupMachineOpsZones(zones);
  const incomplete = groups.find(group => group.missingRoles.length);
  if (incomplete) return { machine_id: incomplete.machineId, zone_role: incomplete.missingRoles[0], name: incomplete.name };
  const ids = new Set(groups.map(group => group.machineId));
  let number = 1;
  while (ids.has(`machine-${number}`)) number++;
  return { machine_id: `machine-${number}`, zone_role: 'machine', name: `Machine ${number}` };
}

export function machineOpsSharedZones(zones) {
  const shared = new Map();
  groupMachineOpsZones(zones).forEach(group => {
    const primary = (group.entries.find(entry => entry.role === 'machine') || group.entries[0]).zone;
    group.entries.forEach(({ index }) => shared.set(index, {
      whatsappRecipientIds: primary.whatsappRecipientIds,
      telegramChatIds: primary.telegramChatIds,
      telegramChatId: primary.telegramChatId,
      schedule: primary.schedule,
    }));
  });
  return zones.map((zone, index) => ({ ...zone, ...shared.get(index) }));
}

// Draw in video pixels, send the normalized polygons required by DS.
export function machineOpsMachines(zones, width, height) {
  if (!(width > 0 && height > 0)) throw new Error('Wait for the camera resolution before saving machines.');
  const machines = new Map();
  for (const [index, zone] of zones.entries()) {
    const fields = machineOpsZoneSettings(zone, index);
    const id = String(fields.machine_id).trim();
    if (!id) throw new Error('Enter a machine ID for every zone.');
    if (!['machine', 'indicator'].includes(fields.zone_role)) throw new Error('Select a machine or indicator zone.');
    const machine = machines.get(id) || { machine_id: id };
    const key = `${fields.zone_role}_zone`;
    if (machine[key]) throw new Error(`Machine ${id} has more than one ${fields.zone_role} zone.`);
    const points = (zone.points || []).map(({ x, y }) => [x / width, y / height]);
    if (points.length < 3 || points.some(point => point.some(axis => !Number.isFinite(axis) || axis < 0 || axis > 1))) throw new Error(`Complete the ${fields.zone_role} polygon for machine ${id}.`);
    const area = points.reduce((sum, [x, y], i) => { const next = points[(i + 1) % points.length]; return sum + x * next[1] - next[0] * y; }, 0);
    if (Math.abs(area) <= 1e-10) throw new Error(`Draw a non-empty ${fields.zone_role} polygon for machine ${id}.`);
    machine[key] = points;
    if (fields.zone_role === 'machine') machine.name = String(zone.name || id).trim();
    machines.set(id, machine);
  }
  if (!machines.size) throw new Error('Draw at least one machine and its indicator zone.');
  const ids = new Set();
  for (const machine of machines.values()) {
    if (!machine.machine_zone || !machine.indicator_zone) throw new Error(`Machine ${machine.machine_id} needs both a machine zone and an indicator zone with the same machine ID.`);
    const id = machineOpsId(machine.name);
    if (!id) throw new Error('Enter a name for every machine.');
    if (ids.has(id)) throw new Error('Use a different name for each machine. Machine names must produce unique IDs.');
    ids.add(id);
    machine.machine_id = id;
  }
  return [...machines.values()];
}
