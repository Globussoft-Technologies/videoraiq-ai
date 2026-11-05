import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as emotion from '../src/helpers/emotionDetection.js';
import { EMOTION_CONFIG, GENDER_AGE_CONFIG } from '../src/pages/IncidentLogs/configs.js';
import * as genderAge from '../src/helpers/genderAgeDetection.js';

const require = createRequire(import.meta.url);
test('emotion settings use the canonical setting key', () => {
  assert.equal(emotion.EMOTION_SETTING_TYPE, 'emotionDetectionSettings');
});
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

test('emotion group is required and shows an accessible validation error', () => {
  for (const groups of [undefined, null, [], [''], ['invalid']]) {
    assert.ok(emotion.emotionAlertGroupsError(groups));
  }
  for (const groups of [...emotion.EMOTION_ALERT_GROUPS.map(group => [group]), [...emotion.EMOTION_ALERT_GROUPS]]) {
    assert.equal(emotion.emotionAlertGroupsError(groups), '');
  }
  const error = emotion.emotionAlertGroupsError([]);
  const field = EmotionAlertGroups({ value: [], error, onChange() {}, id: 'required-group' });
  const select = React.Children.toArray(field.props.children).find(child => child.type === 'select');
  assert.equal(select.props.required, true);
  assert.equal(select.props.value, '');
  assert.equal(select.props['aria-invalid'], true);
  assert.equal(select.props['aria-describedby'], 'required-group-error');
  const html = renderToStaticMarkup(React.createElement(EmotionAlertGroups, { value: [], error, id: 'required-group' }));
  assert.ok(html.includes('Emotion Alert Group *'));
  assert.ok(html.includes(error));
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

test('emotion logs show both received emotion fields in list and grid views', () => {
  const columns = buildColumns(EMOTION_CONFIG, { onSort() {}, onPreview() {} });
  for (const field of ['emotionGroup', 'emotion']) {
    const column = columns.find(item => item.accessorKey === field);
    assert.ok(column, field);
    assert.ok(renderToStaticMarkup(React.createElement(column.cell, { row: { original: incident } })).includes(incident[field]));
  }
  const grid = renderToStaticMarkup(renderIncidentCard(incident, EMOTION_CONFIG, { onPreview() {} }));
  assert.ok(grid.includes('Emotion Group'));
  assert.ok(grid.includes('negative'));
  assert.ok(grid.includes('Sadness'));
  assert.ok(grid.includes('Negative Expression Detected'));
});

const IncidentZoneDetails = (await loadJsx('../src/page/user/Incidents/IncidentZoneDetails.jsx', {
  '../../../helpers/solderIncidentDetails.js': {},
  '../../../helpers/packingIncidentDetails.js': {},
  '../../../helpers/lightingDetection': { LIGHTING_INCIDENT_TYPE: 'lightingVisibilitySiteConditionsDetection' },
  '../../../helpers/hygieneDetection': { HYGIENE_INCIDENT_TYPE: 'hygieneSanitationFoodSafetyDetection' },
  './IncidentHygieneDetails': () => null,
})).default;

test('incident cards and detail views show both emotion fields and handle missing values', () => {
  for (const variant of ['card', 'lightbox']) {
    const html = renderToStaticMarkup(React.createElement(IncidentZoneDetails, {
      item: { ...incident, emotion: 'Anger' }, variant,
    }));
    for (const value of ['Emotion Group', 'Emotion', 'negative', 'Anger']) assert.ok(html.includes(value), value);
    const missing = renderToStaticMarkup(React.createElement(IncidentZoneDetails, {
      item: { incidentType: 'emotionDetection' }, variant,
    }));
    assert.equal((missing.match(/>--</g) || []).length, 2);
  }
});

const TargetGenderSelect = (await loadJsx(
  '../src/page/user/Configure/DetectionZoneMarking/components/TargetGenderSelect.jsx',
  { '../../../../../helpers/genderAgeDetection': genderAge },
)).default;
const GenderAgeSummary = (await loadJsx('../src/pages/IncidentLogs/components/GenderAgeSummary.jsx', {})).default;

test('gender targets remain independent per zone and the dropdown sends Male or Female', () => {
  assert.deepEqual(genderAge.genderAgeZoneSettings(), { target_gender: 'Female' });
  assert.deepEqual(genderAge.genderAgeZoneSettings({}, { target_gender: 'Male' }), { target_gender: 'Male' });
  assert.deepEqual(genderAge.genderAgeZoneSettings({ target_gender: 'Female' }, { target_gender: 'Male' }), { target_gender: 'Female' });
  const changes = [];
  const control = TargetGenderSelect({ value: 'Male', onChange: value => changes.push(value), id: 'gender' });
  const select = React.Children.toArray(control.props.children).find(child => child.type === 'select');
  assert.equal(select.props.value, 'Male');
  select.props.onChange({ target: { value: 'Female' } });
  assert.deepEqual(changes, ['Female']);
});

test('gender logs render the image, incident, description, gender, zone and time', () => {
  const row = { ...incident, incidentImageUrl: 'https://nas.test/gender.jpg', incidentName: 'Female Detected', description: 'Female detected in Reception', targetGender: 'Female', zone: 'Reception' };
  const columns = buildColumns(GENDER_AGE_CONFIG, { onSort() {}, onPreview() {} });
  const html = columns.map(column => renderToStaticMarkup(React.createElement(column.cell, { row: { original: row } }))).join('');
  for (const value of ['https://nas.test/gender.jpg', 'Female Detected', 'Female detected in Reception', 'Female', 'Reception', '04/11/2026']) assert.ok(html.includes(value), value);
  const grid = renderToStaticMarkup(renderIncidentCard(row, GENDER_AGE_CONFIG, { onPreview() {} }));
  assert.ok(grid.includes('Female detected in Reception'));
  assert.ok(grid.includes('Female'));
});

test('gender summary shows male/female totals and counts by camera and zone, including zero', () => {
  const html = renderToStaticMarkup(React.createElement(GenderAgeSummary, { summary: {
    femaleCount: 3, maleCount: 1, totalCount: 4, zones: [
      { cameraId: 'cam', cameraName: 'Office', zoneIdx: 0, zone: 'Reception', femaleCount: 2, maleCount: 0 },
      { cameraId: 'cam', cameraName: 'Office', zoneIdx: 1, zone: 'Shop Floor', femaleCount: 1, maleCount: 1 },
    ],
  } }));
  for (const value of ['Female', 'Male', 'Reception', 'Shop Floor', 'Office', 'Total in selected range:', '>4<', '>0<']) assert.ok(html.includes(value), value);
  assert.ok(html.includes('Total in selected date range'));
  assert.ok(html.includes('Live count'));
});
