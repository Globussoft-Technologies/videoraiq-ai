import { describe, expect, it } from 'vitest';
import { HYGIENE_CATEGORIES } from '../../../constants/hygieneDetection.js';
import validator from '../../../core/v2/incidents/incidents.validate.js';
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
});
