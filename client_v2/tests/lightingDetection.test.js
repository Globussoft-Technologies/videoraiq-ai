import assert from 'node:assert/strict';
import test from 'node:test';
import { lightingSettings, lightingErrors, lightingPayload, lightingInputValue, lightingStoredValue, LIGHTING_CATEGORY_OPTIONS } from '../src/helpers/lightingDetection.js';

test('duration inputs show minutes and submit seconds without changing confidence', () => {
  assert.equal(lightingInputValue('lighting_interval_sec', 3600), 60);
  assert.equal(lightingInputValue('lighting_interval_sec', 20580.78), 343);
  assert.equal(lightingInputValue('lighting_cooldown_sec', 21600), 360);
  const settings = lightingSettings({
    lighting_interval_sec: lightingStoredValue('lighting_interval_sec', '10.5'),
    lighting_cooldown_sec: lightingStoredValue('lighting_cooldown_sec', '0'),
    lighting_min_confidence: lightingStoredValue('lighting_min_confidence', '0.75'),
  });
  assert.deepEqual(lightingErrors(settings), {});
  assert.equal(lightingPayload(settings).lighting_interval_sec, 660);
  assert.equal(lightingPayload(settings).lighting_cooldown_sec, 0);
  assert.equal(lightingPayload(settings).lighting_min_confidence, 0.75);
  assert.equal(lightingInputValue('lighting_interval_sec', ''), '');
  assert.equal(lightingStoredValue('lighting_interval_sec', ''), '');
  assert.match(lightingErrors(lightingSettings({ lighting_interval_sec: 599 })).lighting_interval_sec, /10 and 1440 minutes/);
});

test('lighting defaults and serialization preserve the supplied detector settings', () => {
  const settings = lightingSettings();
  assert.deepEqual(lightingErrors(settings), {});
  assert.deepEqual(lightingPayload(settings), {
    zone_name: 'Scrap Yard', trigger_notification: true,
    lighting_categories: ['weatherSiteHazard'], lighting_interval_sec: 3600,
    lighting_min_confidence: 0.6, lighting_cooldown_sec: 21600,
  });
  const all = lightingSettings({ lighting_categories: LIGHTING_CATEGORY_OPTIONS.map(option => option.id), trigger_notification: false, lighting_cooldown_sec: 0 });
  assert.deepEqual(lightingErrors(all), {});
  assert.equal(lightingPayload(all).trigger_notification, false);
  assert.equal(lightingPayload(all).lighting_cooldown_sec, 0);
  all.lighting_categories.pop();
  assert.deepEqual(settings.lighting_categories, ['weatherSiteHazard']);
});

test('UI rejects unsupported selections, blank fields and values outside the detector limits', () => {
  for (const categories of [[], ['emergencyLighting'], ['lowVisibility', 'lowVisibility']]) {
    assert.ok(lightingErrors(lightingSettings({ lighting_categories: categories })).lighting_categories);
  }
  for (const [key, values] of Object.entries({
    lighting_interval_sec: ['', 599, 86401, Infinity],
    lighting_min_confidence: ['', 0.49, 1.01, NaN],
    lighting_cooldown_sec: ['', -1, 86401, Infinity],
  })) {
    for (const value of values) assert.ok(lightingErrors(lightingSettings({ [key]: value }))[key], `${key}: ${value}`);
  }
  assert.ok(lightingErrors(lightingSettings({ zone_name: ' ' })).zone_name);
  assert.deepEqual(lightingErrors(lightingSettings({ lighting_interval_sec: 600, lighting_min_confidence: 0.5, lighting_cooldown_sec: 86400 })), {});
});
