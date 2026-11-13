// One settings contract and one state-report incident for every machine.
export const MACHINE_OPS_SETTINGS = 'machineOpsDetectionSettings';
export const MACHINE_OPS_INCIDENT = 'machineOpsDetection';

const fail = message => { throw new Error(message); };
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) < 1e-10 &&
  p.every((v, i) => v >= Math.min(a[i], b[i]) - 1e-10 && v <= Math.max(a[i], b[i]) + 1e-10);
const intersects = (a, b, c, d) => (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
  onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
const edges = p => p.map((v, i) => [v, p[(i + 1) % p.length]]);
const inside = (p, polygon) => {
  let result = false;
  for (const [a, b] of edges(polygon)) {
    if (onSegment(p, a, b)) return false;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};
const polygon = (value, label) => {
  if (!Array.isArray(value) || value.length < 3 || value.length > 128) fail(`${label} needs 3–128 normalized points`);
  if (value.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1))) fail(`${label} coordinates must be within [0,1]`);
  const points = value.map(p => [...p]);
  if (points[0].every((v, i) => v === points.at(-1)[i])) points.pop();
  if (points.length < 3 || new Set(points.map(p => JSON.stringify(p))).size !== points.length) fail(`${label} needs distinct vertices`);
  const lines = edges(points);
  if (Math.abs(lines.reduce((s, [a, b]) => s + a[0] * b[1] - b[0] * a[1], 0)) < 1e-10) fail(`${label} must have a nonzero area`);
  lines.forEach(([a, b], i) => lines.forEach(([c, d], j) => {
    if (j > i + 1 && !(i === 0 && j === lines.length - 1) && intersects(a, b, c, d)) fail(`${label} cannot self-intersect`);
  }));
  return points;
};

export function normalizeMachineOpsMachines(machines) {
  if (!Array.isArray(machines) || !machines.length || machines.length > 32) fail('Configure between 1 and 32 machines per camera');
  const ids = new Set();
  return machines.map(machine => {
    if (!machine || typeof machine.machineId !== 'string' || !machine.machineId.trim() || machine.machineId.length > 128) fail('Each machine needs a stable machineId');
    const machineId = machine.machineId.trim();
    if (ids.has(machineId)) fail('Machine IDs must be unique within a camera');
    ids.add(machineId);
    const name = typeof machine.name === 'string' ? machine.name.trim() : '';
    if (!name || name.length > 128) fail('Each machine needs a name');
    const machineZone = polygon(machine.machineZone, `${name}: machine zone`);
    const indicatorZone = polygon(machine.indicatorZone, `${name}: indicator zone`);
    if (!indicatorZone.every(p => inside(p, machineZone)) || edges(machineZone).some(([a, b]) => edges(indicatorZone).some(([c, d]) => intersects(a, b, c, d)))) fail(`${name}: indicator zone must be entirely inside its machine zone`);
    if (machine.profileId !== undefined && (typeof machine.profileId !== 'string' || !machine.profileId.trim())) fail('Invalid machine profileId');
    return { machineId, name, ...(machine.profileId ? { profileId: machine.profileId.trim() } : {}), machineZone, indicatorZone };
  });
}

export function validateMachineOpsSettings(settingType, settings = {}) {
  if (settingType !== MACHINE_OPS_SETTINGS) return { error: null };
  try { normalizeMachineOpsMachines(settings.machines); return { error: null }; }
  catch (error) { return { error }; }
}

export function buildMachineOpsDetector(settings = {}, severity = 'low') {
  const machines = normalizeMachineOpsMachines(settings.machines);
  return { name: MACHINE_OPS_SETTINGS, severity, trigger_notification: settings.trigger_notification ?? true,
    machines: machines.map(m => ({ machine_id: m.machineId, name: m.name, machine_zone: m.machineZone,
      indicator_zone: m.indicatorZone, ...(m.profileId ? { machine_profile_id: m.profileId } : {}) })) };
}

export function normalizeMachineOpsIncident(body = {}) {
  if (body.incidentType !== MACHINE_OPS_INCIDENT) return;
  for (const key of ['eventId', 'machineId', 'machineName']) {
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 128) fail(`Machine Ops requires ${key}`);
    body[key] = body[key].trim();
  }
  if (!['ON', 'OFF'].includes(body.machineState)) fail('machineState must be ON or OFF');
  if (typeof body.timeOfIncident !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(body.timeOfIncident) ||
      !Number.isFinite(new Date(body.timeOfIncident).getTime())) fail('Machine Ops requires a valid ISO timeOfIncident with timezone');
  if (body.triggerNotification !== undefined && typeof body.triggerNotification !== 'boolean') fail('triggerNotification must be a boolean');
  body.channelId ??= body.cameraId;
  body.zone = body.zone || body.machineName;
  body.incidentName = `Machine ${body.machineState}`;
  body.type = 'gauge';
}
