import { describe, expect, it } from 'vitest';
import { normalizeMachineOpsMachines, normalizeMachineOpsIncident, buildMachineOpsDetector,
  validateMachineOpsSettings } from '../../../services/machineOpsDetection.js';

const machine = (id = 'laser-1') => ({ machineId: id, name: 'Laser Cutter', profileId: 'green-indicator',
  machineZone: [[.1, .1], [.9, .1], [.9, .9], [.1, .9]],
  indicatorZone: [[.2, .2], [.3, .2], [.3, .3], [.2, .3]] });

describe('Machine Ops multi-machine settings', () => {
  it('builds a single detector with independent, named zone pairs', () => {
    const result = buildMachineOpsDetector({ machines: [machine(), machine('laser-2')] });
    expect(result.name).toBe('machineOpsDetectionSettings');
    expect(result.machines.map(m => m.machine_id)).toEqual(['laser-1', 'laser-2']);
    expect(result.machines[1].indicator_zone).toEqual(machine().indicatorZone);
    expect(result.machines[1].machine_profile_id).toBe('green-indicator');
  });
  it.each([[], [machine(), machine()], [{ ...machine(), name: '' }],
    [{ ...machine(), indicatorZone: [[0, 0], [.2, 0], [.2, .2]] }],
    [{ ...machine(), machineZone: [[.1, .1], [.9, .9], [.1, .9], [.9, .1]] }],
    [{ ...machine(), machineZone: [[10, 10], [90, 10], [90, 90], [10, 90]] }],
  ])('rejects invalid machine groups: %j', machines => {
    expect(() => normalizeMachineOpsMachines(machines)).toThrow();
  });
  it('rejects concave edge crossings even when vertices are inside', () => {
    expect(() => normalizeMachineOpsMachines([{ ...machine(),
      machineZone: [[0, 0], [1, 0], [1, 1], [.6, 1], [.6, .4], [.4, .4], [.4, 1], [0, 1]],
      indicatorZone: [[.2, .2], [.8, .2], [.8, .8], [.2, .8]],
    }])).toThrow(/entirely inside/);
  });
  it('does not affect other detectors', () => {
    expect(validateMachineOpsSettings('doorDetectionSettings', {})).toEqual({ error: null });
  });
});

describe('one Machine Ops incident shape', () => {
  const post = state => ({ incidentType: 'machineOpsDetection', eventId: 'event-1', machineId: 'laser-1',
    machineName: 'Laser Cutter', machineState: state, timeOfIncident: '2026-11-13T08:00:00Z', cameraId: 'camera-1' });
  it.each(['ON', 'OFF'])('normalizes %s without initial/change variants', state => {
    const body = post(state);
    normalizeMachineOpsIncident(body);
    expect(body).toMatchObject({ machineState: state, channelId: 'camera-1', incidentName: `Machine ${state}` });
    expect(body).not.toHaveProperty('eventType');
    expect(body).not.toHaveProperty('previousState');
  });
  it.each(['UNKNOWN', 'on', { $ne: 'OFF' }, null])('rejects invalid state %j', state => {
    expect(() => normalizeMachineOpsIncident(post(state))).toThrow(/machineState/);
  });
  it.each([true, 1, '2026-11-13', 'not-a-date'])('rejects ambiguous incident time %j', timeOfIncident => {
    expect(() => normalizeMachineOpsIncident({ ...post('ON'), timeOfIncident })).toThrow(/timeOfIncident/);
  });
});
