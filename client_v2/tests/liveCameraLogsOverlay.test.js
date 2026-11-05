import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/components/LiveCameraLogsOverlay.jsx', import.meta.url), 'utf8');
const { code } = await transform(source, {
  loader: 'jsx', format: 'cjs', jsx: 'automatic', define: { 'import.meta.env': '{}' },
});
let socketData;
const mocks = {
  '../context/AttendanceSocketContext': { useAttendanceSocket: () => socketData },
  '../lib/format': { detectionLabel: type => type },
  '@/utils/timezone': { utcToConfiguredTimezone: () => null },
};
const module = { exports: {} };
runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] || require(name) });
const LiveCameraLogsOverlay = module.exports.default;
const renderOverlay = detections => {
  socketData = { allDetections: detections };
  return renderToStaticMarkup(React.createElement(LiveCameraLogsOverlay, { channel: { _id: 'cam-1' } }));
};

test('fullscreen hides emotion and gender/age alerts, counts and setting aliases', () => {
  for (const type of ['emotionDetection', 'emotionDetectionSettings', 'genderAgeDetection', 'genderAgeDetectionSettings', 'genderAgeCount']) {
    assert.equal(renderOverlay([{ incidentType: type, cameraId: 'cam-1' }]), '', type);
    assert.equal(renderOverlay([{ detectionType: type, cameraId: 'cam-1' }]), '', type);
  }
});

test('fullscreen keeps other detections and camera filtering when excluded alerts are mixed in', () => {
  const html = renderOverlay([
    { cameraId: 'cam-1', incidentType: 'emotionDetection', incidentName: 'Negative Expression Detected' },
    { cameraId: 'cam-1', incidentType: 'genderAgeDetection', incidentName: 'Female Detected' },
    { cameraId: 'cam-1', incidentType: 'carModelDetection', incidentName: 'Car Detected' },
    { cameraId: 'cam-2', incidentType: 'doorDetection', incidentName: 'Other Camera Door' },
    { cameraId: 'cam-1', incidentType: 'doorDetection', incidentName: 'Door Open' },
  ]);
  assert.ok(html.includes('Detection Details'));
  assert.ok(html.includes('Door Open'));
  for (const name of ['Negative Expression Detected', 'Female Detected', 'Car Detected', 'Other Camera Door']) {
    assert.ok(!html.includes(name), name);
  }
});
