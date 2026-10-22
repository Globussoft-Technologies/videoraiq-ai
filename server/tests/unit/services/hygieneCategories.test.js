import { describe, expect, it } from 'vitest';
import { HYGIENE_CATEGORIES } from '../../../constants/hygieneDetection.js';
import validator from '../../../core/v2/incidents/incidents.validate.js';
import settingsValidator from '../../../core/v2/detectionSettings/detectionSettings.validate.js';
import { HygieneSanitationFoodSafetyDetectionIncident } from '../../../core/v1/incidents/incidents.model.js';
import { HYGIENE_CATEGORY_OPTIONS, hygieneZoneErrors } from '../../../../client_v2/src/helpers/hygieneDetection.js';

const confirmed = ['cleaningSanitationSop', 'unsafeFoodHandling', 'servingFoodSafety', 'handHygieneBypass', 'productContact', 'contaminationRisk'];
describe('confirmed hygiene contract', () => {
  it('supports exactly the same six codes in the frontend and backend', () => {
    expect([...HYGIENE_CATEGORIES].sort()).toEqual([...confirmed].sort());
    expect(HYGIENE_CATEGORY_OPTIONS.map(c => c.id).sort()).toEqual([...confirmed].sort());
  });
  it.each(confirmed)('validates and stores %s', code => {
    const body = { incidentType: 'hygieneSanitationFoodSafetyDetection', selectedCategories: [code], violationCount: 1, violations: [{ category: code, confidence: .9, severity: 'high' }] };
    expect(validator.validateHygieneIncident(body).error).toBeUndefined();
    const incident = new HygieneSanitationFoodSafetyDetectionIncident({ ...body, userId: 'test', liveDemoData: true, timeOfIncident: new Date() });
    expect(incident.validateSync()).toBeUndefined();
    expect(hygieneZoneErrors({ hygiene_categories: [code], hygiene_interval_sec: 180, hygiene_min_confidence: .6, hygiene_cooldown_sec: 1800 })).toEqual({});
  });
  it('rejects unconfirmed codes', () => {
    expect(validator.validateHygieneIncident({ incidentType: 'hygieneSanitationFoodSafetyDetection', violations: [{ category: 'unsupported' }] }).error).toBeTruthy();
  });
  const validZone = { hygiene_categories: [confirmed[0]], hygiene_interval_sec: 180, hygiene_min_confidence: 0.6, hygiene_cooldown_sec: 1800 };
  it.each([
    ['hygiene_interval_sec', 18], ['hygiene_interval_sec', 3601],
    ['hygiene_min_confidence', 0.46], ['hygiene_min_confidence', 1.01],
    ['hygiene_cooldown_sec', -1], ['hygiene_cooldown_sec', 86401],
  ])('rejects unsupported %s=%s before detection starts', (field, value) => {
    const zone = { ...validZone, [field]: value };
    expect(hygieneZoneErrors(zone)[field]).toBeTruthy();
    expect(settingsValidator.validateHygieneSettings('hygieneSanitationFoodSafetyDetectionSettings', zone).error).toBeTruthy();
    expect(settingsValidator.validateHygieneSettings('hygieneSanitationFoodSafetyDetectionSettings', { zone_configs: [zone] }).error).toBeTruthy();
  });
  it.each([
    [60, 0.5, 0], [3600, 1, 86400], [180, 0.6, 1800],
  ])('accepts supported boundary values %s / %s / %s', (interval, confidence, cooldown) => {
    const zone = { ...validZone, hygiene_interval_sec: interval, hygiene_min_confidence: confidence, hygiene_cooldown_sec: cooldown };
    expect(hygieneZoneErrors(zone)).toEqual({});
    expect(settingsValidator.validateHygieneSettings('hygieneSanitationFoodSafetyDetectionSettings', { ...zone, zone_configs: [zone] }).error).toBeUndefined();
  });
});
