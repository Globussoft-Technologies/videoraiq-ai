import { describe, expect, it } from 'vitest';
import { LightingVisibilitySiteConditionsDetectionIncident, Incident } from '../../../core/v1/incidents/incidents.model.js';

describe('lighting incident payload', () => {
  it.each(['lowVisibility', 'roadSurfaceDamage', 'weatherSiteHazard'])('accepts %s and saves medium severity as moderate', category => {
    const incident = new LightingVisibilitySiteConditionsDetectionIncident({
      incidentType: 'lightingVisibilitySiteConditionsDetection',
      incidentName: 'Lighting / Visibility / Site Conditions Detection',
      conceptGroup: 'Lighting / Visibility / Site Conditions',
      timeOfIncident: '2026-10-16T09:00:00Z',
      cameraId: '69ce7069d5b1b9d2ca500464', channelId: '69ce7069d5b1b9d2ca500464',
      nvrId: '69ce7069d5b1b9d2ca500400', adminId: '69ce7069d5b1b9d2ca500300',
      userId: 'lighting-user', zone: 'Scrap Yard', type: 'gauge', severity: 'medium',
      alertThreshold: 400, triggerNotification: true,
      selectedCategories: [category], violationCount: 1,
      violations: [{ category, description: 'Detected issue', confidence: 0.81, severity: 'medium' }],
    });
    expect(incident.validateSync()).toBeUndefined();
    expect(incident.severity).toBe('moderate');
    expect(incident.violations[0].severity).toBe('medium');
    expect(incident.selectedCategories).toEqual([category]);
    expect(incident.alertThreshold).toBe(400);
    expect(Incident.schema.path('severity').enumValues).not.toContain('medium');
  });
});
