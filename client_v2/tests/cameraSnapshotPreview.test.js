import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowSnapshot, canResumeLivePreview } from '../src/page/user/Configure/DetectionZoneMarking/preview.js';

const state = { snapshotUrl: '/snapshot.jpg', snapshotFailed: false, url: '/live.m3u8', videoState: 'loading', streamTimedOut: false };
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
