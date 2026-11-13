import assert from 'node:assert/strict';
import test from 'node:test';
import { rectangleZone, machineOpsFormError } from '../src/helpers/machineOpsDetection.js';

test('drawn rectangles preserve the normalized coordinate contract', () => {
  assert.deepEqual(rectangleZone([.7, .8], [.2, .3]), [[.2, .3], [.7, .3], [.7, .8], [.2, .8]]);
});
test('multiple machines each require their own complete zone pair', () => {
  const zone = rectangleZone([.1, .1], [.9, .9]);
  const machines = ['machine-1', 'machine-2'].map(machineId => ({ machineId, name: machineId, machineZone: zone, indicatorZone: zone }));
  assert.equal(machineOpsFormError(machines), '');
  machines[1].indicatorZone = [];
  assert.match(machineOpsFormError(machines), /machine-2: draw both zones/);
});
test('duplicate machine identities and blank names are rejected', () => {
  assert.match(machineOpsFormError([{ machineId: 'a', name: '' }]), /name/);
  assert.match(machineOpsFormError([{ machineId: 'a' }, { machineId: 'a' }]), /unique/);
});
