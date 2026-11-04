import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as emotion from '../src/helpers/emotionDetection.js';
import { EMOTION_CONFIG } from '../src/pages/IncidentLogs/configs.js';

const require = createRequire(import.meta.url);
async function loadJsx(path, mocks) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic' });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] || require(name) });
  return module.exports;
}
const EmotionAlertGroups = (await loadJsx(
  '../src/page/user/Configure/DetectionZoneMarking/components/EmotionAlertGroups.jsx',
  { '../../../../../helpers/emotionDetection': emotion },
)).default;

test('new and legacy zones default to all four groups with independent arrays', () => {
  const first = emotion.emotionZoneSettings();
  const second = emotion.emotionZoneSettings();
  assert.deepEqual(first.emotion_alert_groups, ['positive', 'neutral', 'negative', 'surprise']);
  first.emotion_alert_groups.pop();
  assert.equal(second.emotion_alert_groups.length, 4);
  assert.deepEqual(emotion.emotionZoneSettings({ emotion_alert_groups: ['negative'] }).emotion_alert_groups, ['negative']);
});

test('zone dropdown sends a singleton for each group and all four for All', () => {
  const changes = [];
  const field = EmotionAlertGroups({ onChange: groups => changes.push(groups), id: 'emotion-groups' });
  const select = React.Children.toArray(field.props.children).find(child => child.type === 'select');
  assert.equal(select.props.value, 'all');
  for (const group of emotion.EMOTION_ALERT_GROUPS) select.props.onChange({ target: { value: group } });
  select.props.onChange({ target: { value: 'all' } });
  assert.deepEqual(changes, [['positive'], ['neutral'], ['negative'], ['surprise'], ['positive', 'neutral', 'negative', 'surprise']]);
  const saved = EmotionAlertGroups({ value: ['negative'], onChange() {}, id: 'saved' });
  assert.equal(React.Children.toArray(saved.props.children).find(child => child.type === 'select').props.value, 'negative');
});

const { buildColumns, renderIncidentCard } = await loadJsx('../src/pages/IncidentLogs/incidentColumns.jsx', {
  '@/utils/timezone': { getConfiguredTimezone: () => 'Asia/Kolkata' },
  './incidentState': { styles: { text: '' } },
  './stockMovement': {}, './boxPacking': {}, './doorIncident': {},
  '@/pages/AttendanceLogs/components/ImageWithLoader': props => React.createElement('img', { src: props.src, alt: props.alt }),
  '@/page/user/Incidents/IncidentHygieneDetails': () => null,
  '@/utils/mobileEmbed': { isMobileEmbedded: () => false },
});
const incident = {
  incidentType: 'emotionDetection', incidentName: 'Negative Expression Detected',
  emotion: 'Sadness', emotionGroup: 'negative', confidence: 0.908, durationSec: 5,
  createdAt: '2026-11-04T10:15:30Z', nvrName: 'Office NVR', channelName: 'Reception',
};

test('emotion logs show the received emotion in list and grid views', () => {
  const columns = buildColumns(EMOTION_CONFIG, { onSort() {}, onPreview() {} });
  const column = columns.find(item => item.accessorKey === 'emotion');
  assert.ok(renderToStaticMarkup(React.createElement(column.cell, { row: { original: incident } })).includes('Sadness'));
  const grid = renderToStaticMarkup(renderIncidentCard(incident, EMOTION_CONFIG, { onPreview() {} }));
  assert.ok(grid.includes('Sadness'));
  assert.ok(grid.includes('Negative Expression Detected'));
});
