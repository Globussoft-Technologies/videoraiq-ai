import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowSnapshot, canResumeLivePreview, snapshotForPreview } from '../src/page/user/Configure/DetectionZoneMarking/preview.js';

const state = { snapshotUrl: '/snapshot.jpg', snapshotFailed: false, url: '/live.m3u8', videoState: 'loading', streamTimedOut: false };
test('preserves snapshots when detection settings return a partial linked camera', () => {
  const snapshot = { path: '/frame.jpg', capturedAt: '2026-10-21T12:00:00Z' };
  assert.deepEqual(snapshotForPreview({ _id: 'camera' }, { _id: 'camera', latestSnapshot: snapshot }), snapshot);
  assert.deepEqual(snapshotForPreview({ _id: 'camera', latestSnapshot: { path: '/new.jpg' } }, { _id: 'camera', latestSnapshot: snapshot }), { path: '/new.jpg' });
  assert.equal(snapshotForPreview({ _id: 'other' }, { _id: 'camera', latestSnapshot: snapshot }), undefined);
});
test('tries live playback first, then falls back on failure or timeout', () => {
  assert.equal(shouldShowSnapshot(state), false);
  assert.equal(shouldShowSnapshot({ ...state, videoState: 'error' }), true);
  assert.equal(shouldShowSnapshot({ ...state, streamTimedOut: true }), true);
  assert.equal(shouldShowSnapshot({ ...state, url: '' }), true);
});
test('keeps the snapshot visible throughout HLS retries', () => {
  assert.equal(shouldShowSnapshot({ ...state, streamTimedOut: true, videoState: 'loading' }), true);
  assert.equal(shouldShowSnapshot({ ...state, videoState: 'ready' }), false);
});
test('unavailable or broken snapshots do not enable the fallback', () => {
  assert.equal(shouldShowSnapshot({ ...state, videoState: 'error', snapshotUrl: '' }), false);
  assert.equal(shouldShowSnapshot({ ...state, videoState: 'error', snapshotFailed: true }), false);
});
test('a returning feed must preserve snapshot coordinates', () => {
  assert.equal(canResumeLivePreview(true, { w: 1920, h: 1080 }, { videoWidth: 1280, videoHeight: 720 }), false);
  assert.equal(canResumeLivePreview(true, { w: 1920, h: 1080 }, { videoWidth: 1920, videoHeight: 1080 }), true);
  assert.equal(canResumeLivePreview(false, { w: 1920, h: 1080 }, { videoWidth: 1280, videoHeight: 720 }), true);
});
