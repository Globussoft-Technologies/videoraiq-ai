import test from 'node:test';
import assert from 'node:assert/strict';
import { undoAreaDrawing } from '../src/page/user/Configure/DetectionZoneMarking/drawingDraft.js';

const points = [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 80 }, { x: 10, y: 80 }];
const saved = {
  name: 'Assembly desk', points,
  capacity: '2', threshold: '120', company: 'Example',
  telegramChatIds: ['chat-1'], schedule: { from: '09:00', to: '18:00' },
};
const state = (extra = {}) => ({ zones: [saved], draftZones: [], points: [], pointZone: null, isLineCrossing: false, ...extra });

test('undo reopens a saved area without changing its saved coordinates or settings', () => {
  const original = structuredClone(saved);
  const next = undoAreaDrawing(state());
  assert.deepEqual(next.zones, []);
  assert.deepEqual(next.points, points.slice(0, -1));
  assert.equal(next.pointZone, saved);
  assert.deepEqual(saved, original);
});

test('undo removes a drawing point before touching saved or completed draft areas', () => {
  const draft = { ...saved, name: 'New desk' };
  const input = state({ points, draftZones: [draft] });
  const next = undoAreaDrawing(input);
  assert.equal(next.zones, input.zones);
  assert.equal(next.draftZones, input.draftZones);
  assert.deepEqual(next.points, points.slice(0, -1));
});

test('undo reopens the latest completed draft before a saved area and keeps its metadata', () => {
  const draft = { ...saved, name: 'New desk', threshold: '180' };
  const input = state({ draftZones: [draft] });
  const next = undoAreaDrawing(input);
  assert.equal(next.zones, input.zones);
  assert.deepEqual(next.draftZones, []);
  assert.equal(next.pointZone, draft);
  assert.equal(next.pointZone.threshold, '180');
});

test('successive undos can edit multiple saved areas without altering the saved list', () => {
  const older = { ...saved, name: 'Older desk' };
  const input = state({ zones: [older, saved] });
  let next = undoAreaDrawing(input);
  for (let i = 0; i < points.length; i++) next = undoAreaDrawing({ ...next, isLineCrossing: false });
  assert.deepEqual(next.zones, []);
  assert.equal(next.pointZone, older);
  assert.equal(input.zones.length, 2);
  assert.equal(input.zones[1].points.length, 4);
});

test('line-crossing undo removes its inside reference point before its two endpoints', () => {
  const line = { ...saved, points: points.slice(0, 2), insideReferencePoint: points[2] };
  const next = undoAreaDrawing(state({ zones: [line], isLineCrossing: true }));
  assert.deepEqual(next.points, line.points);
  assert.deepEqual(next.zones, []);
  assert.deepEqual(line.insideReferencePoint, points[2]);
});

test('undo on an empty canvas is a no-op', () => {
  const input = state({ zones: [] });
  assert.deepEqual(undoAreaDrawing(input), { zones: [], draftZones: [], points: [], pointZone: null });
});
