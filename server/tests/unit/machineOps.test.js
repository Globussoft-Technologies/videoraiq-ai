import { describe, expect, it } from 'vitest';
import { machineOpsSettingsSchema, machineOpsIncidentSchema } from '../../services/machineOps.js';
import { MachineOpsDetectionSetting } from '../../core/v1/detectionSettings/detectionSettings.model.js';
import { MachineOpsDetectionIncident } from '../../core/v1/incidents/incidents.model.js';
import { MACHINE_OPS_LOG_FIELDS, machineOpsMachines, machineOpsZoneSettings, machineOpsId, groupMachineOpsZones, nextMachineOpsZone, machineOpsSharedZones } from '../../../client_v2/src/helpers/machineOpsDetection.js';

const machine = { machine_id: 'laser-cutter-1', name: 'Laser Cutter 1',
  machine_zone: [[0.02, 0.1], [0.48, 0.1], [0.48, 0.9], [0.02, 0.9]],
  indicator_zone: [[0.1, 0.2], [0.15, 0.2], [0.15, 0.3], [0.1, 0.3]],
};
const event = { incidentType: 'machineOpsDetection', eventId: 'event-1', machineId: machine.machine_id,
  machineName: machine.name, machineState: 'OFF', timeOfIncident: '2026-11-13T08:00:10.000Z',
  incidentName: 'Machine OFF', description: 'Laser Cutter 1 is OFF.', Image: '', videoLink: '',
};

describe('Machine Operations contracts', () => {
  it('groups both polygons under one name while keeping machines separate', () => {
    const first = nextMachineOpsZone([]);
    const second = nextMachineOpsZone([first]);
    const third = nextMachineOpsZone([first, second]);
    expect(first).toEqual({ machine_id: 'machine-1', zone_role: 'machine', name: 'Machine 1' });
    expect(second).toEqual({ machine_id: 'machine-1', zone_role: 'indicator', name: 'Machine 1' });
    expect(third.machine_id).toBe('machine-2');
    const groups = groupMachineOpsZones([first, second, third]);
    expect(groups).toHaveLength(2);
    expect(groups[0].entries.map(entry => entry.role)).toEqual(['machine', 'indicator']);
    expect(groups[0].missingRoles).toEqual([]);
    expect(groups[1].missingRoles).toEqual(['indicator']);
    expect(nextMachineOpsZone([third, { ...third, zone_role: 'indicator' }]).machine_id).toBe('machine-1');
  });
  it('derives payload IDs from names, collapses whitespace, and rejects duplicate IDs', () => {
    expect(machineOpsId('  Laser   Cutter 1  ')).toBe('laser-cutter-1');
    const zone = (id, role, name) => ({ machine_id: id, zone_role: role, name, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }] });
    const zones = [zone('internal-1', 'machine', 'Laser Cutter 1'), zone('internal-1', 'indicator', 'Laser Cutter 1')];
    expect(machineOpsMachines(zones, 100, 100)[0].machine_id).toBe('laser-cutter-1');
    expect(zones[0].machine_id).toBe('internal-1');
    expect(() => machineOpsMachines([...zones, zone('internal-2', 'machine', ' laser   cutter 1 '), zone('internal-2', 'indicator', 'laser cutter 1')], 100, 100)).toThrow('unique IDs');
  });
  it('limits the logs and exports to the seven requested fields', () => {
    expect(MACHINE_OPS_LOG_FIELDS.map(field => field.key)).toEqual([
      'snap', 'nvrName', 'channelName', 'machineName', 'machineState', 'description', 'timeOfIncident',
    ]);
  });
  it('uses one notification configuration per machine for both polygons and preserves other machines', () => {
    const settings = { whatsappRecipientIds: ['recipient-1'], telegramChatIds: ['chat-1'], telegramChatId: 'chat-1', schedule: { from: '09:00 AM', to: '06:00 PM' } };
    const zones = [
      { machine_id: 'one', zone_role: 'machine', ...settings },
      { machine_id: 'one', zone_role: 'indicator', telegramChatIds: ['old-chat'] },
      { machine_id: 'two', zone_role: 'machine', telegramChatIds: ['chat-2'] },
    ];
    const result = machineOpsSharedZones(zones);
    expect(result[0]).toMatchObject(settings);
    expect(result[1]).toMatchObject(settings);
    expect(result[2].telegramChatIds).toEqual(['chat-2']);
    expect(zones[1].telegramChatIds).toEqual(['old-chat']);
  });
  it('stores normalized paired polygons and machine IDs without adding DS fields', () => {
    const settings = { machines: [machine] };
    expect(machineOpsSettingsSchema.validate(settings, { convert: false }).error).toBeUndefined();
    const doc = new MachineOpsDetectionSetting({ name: 'Machines', userId: '42', enabled: true, settings });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.settings.machines[0].toObject()).toEqual(machine);
  });
  it.each([
    [], [machine, machine], [{ ...machine, machine_id: '' }],
    [{ ...machine, indicator_zone: [] }],
    [{ ...machine, machine_zone: [[0, 0], [100, 0], [100, 100]] }],
    [{ ...machine, machine_zone: [[0, 0], [0.1, 0.1], [0.2, 0.2]] }],
  ])('rejects missing, duplicate or invalid machine polygons: %j', machines => {
    expect(machineOpsSettingsSchema.validate({ machines }, { convert: false }).error).toBeTruthy();
  });
  it.each(['ON', 'OFF'])('accepts %s events including empty media URLs', machineState => {
    expect(machineOpsIncidentSchema.validate({ ...event, machineState }, { convert: false }).error).toBeUndefined();
    const doc = new MachineOpsDetectionIncident({ ...event, machineState, userId: '42', channelId: '0123456789abcdef01234567', nvrId: '0123456789abcdef01234568' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.machineState).toBe(machineState);
  });
  it('rejects malformed incident identity and states', () => {
    expect(machineOpsIncidentSchema.validate({ ...event, machineState: 'unknown' }).error).toBeTruthy();
    expect(machineOpsIncidentSchema.validate({ ...event, eventId: '' }).error).toBeTruthy();
  });
  it('converts pixel drawings to the exact DS polygons and preserves distinct machines', () => {
    const zones = [machine, { ...machine, machine_id: 'laser-cutter-2', name: 'Laser Cutter 2' }].flatMap(m =>
      ['machine', 'indicator'].map(role => ({ machine_id: m.machine_id, name: m.name, zone_role: role,
        points: m[`${role}_zone`].map(([x, y]) => ({ x: x * 100, y: y * 100 })),
      })));
    const result = machineOpsMachines(zones, 100, 100);
    expect(result).toEqual([machine, { ...machine, machine_id: 'laser-cutter-2', name: 'Laser Cutter 2' }]);
    expect(() => machineOpsMachines(zones.slice(0, 1), 100, 100)).toThrow('needs both');
    expect(() => machineOpsMachines([zones[0], zones[0]], 100, 100)).toThrow('more than one');
    expect(machineOpsZoneSettings({}, 3)).toEqual({ machine_id: 'machine-2', zone_role: 'indicator' });
  });
});
