import { describe, expect, it } from 'vitest';
import { DETECTION_LOG_METADATA, DETECTION_MODES_MAP, dsDetectorsForModes, TYPE_MAP } from '../../constants/detectionTypes.js';
import { PersonPostureDetectionSetting, CansStackDetectionSetting } from '../../core/v1/detectionSettings/detectionSettings.model.js';
import { PersonPostureDetectionIncident, CansStackDetectionIncident } from '../../core/v1/incidents/incidents.model.js';
import DetectionSettingsValidation from '../../core/v2/detectionSettings/detectionSettings.validate.js';
import IncidentsValidator from '../../core/v2/incidents/incidents.validate.js';
import { postureDetectorPayload, cansStackDetectorPayload } from '../../services/postureCanStackPayload.js';

describe('posture and can stack detection contracts', () => {
  it('keeps zone and configuration documents independent', () => {
    const cameraId = '69ce7069d5b1b9d2ca500464';
    const posture = new PersonPostureDetectionSetting({
      settings: { trigger_on: 'standing', referencePoints: { [cameraId]: [[[1, 2], [3, 4], [5, 6]]] } },
    });
    const stack = new CansStackDetectionSetting({
      settings: { layers: 4, referencePoints: { [cameraId]: [[[10, 20], [30, 40], [50, 60]]] } },
    });
    expect(posture.settings.trigger_on).toBe('standing');
    expect(stack.settings.layers).toBe(4);
    expect(posture.settings.referencePoints[cameraId]).not.toEqual(stack.settings.referencePoints[cameraId]);
    expect(posture.settingType).toBe('personPostureDetectionSettings');
    expect(stack.settingType).toBe('cansStackDetectionSettings');
  });

  it('maps each setting and incident to its own detector', () => {
    for (const [settingType, incidentType] of [
      ['personPostureDetectionSettings', 'personPostureDetection'],
      ['cansStackDetectionSettings', 'cansStackDetection'],
    ]) {
      expect(TYPE_MAP[settingType]).toBe(incidentType);
      expect(DETECTION_LOG_METADATA[settingType]).toBeDefined();
      expect(dsDetectorsForModes(DETECTION_MODES_MAP[settingType])).toEqual({ detectors: [settingType], unmapped: [] });
    }
    const posture = new PersonPostureDetectionIncident({ posture: 'sitting', confidence: 0.91 });
    const stack = new CansStackDetectionIncident({ layers: 3, observedLayers: 4, currentStatus: 'DETECTED' });
    expect(posture.incidentType).toBe('personPostureDetection');
    expect(stack.incidentType).toBe('cansStackDetection');
    expect(stack.observedLayers).toBe(4);
  });

  it('sends posture polygons and keeps can stack full frame', () => {
    const zones = [[[1, 2], [3, 4], [5, 6]]];
    expect(postureDetectorPayload({ zones, zoneConfigs: [{ name: 'Work Area' }], settings: { trigger_on: 'standing' }, severity: 'moderate' })).toMatchObject({
      name: 'personPostureDetectionSettings', trigger_on: 'standing', zones, zone_name: 'Work Area',
    });
    const stack = cansStackDetectorPayload({ zoneConfigs: [{ name: 'Can Storage Area' }], settings: { layers: 3 }, severity: 'high' });
    expect(stack).toMatchObject({ name: 'cansStackDetectionSettings', layers: 3, zone_name: 'Can Storage Area' });
    expect(stack).not.toHaveProperty('zones');
  });

  it('validates detector specific values', () => {
    expect(DetectionSettingsValidation.validateNewDetectorSettings('personPostureDetectionSettings', { trigger_on: 'standing' }).error).toBeFalsy();
    expect(DetectionSettingsValidation.validateNewDetectorSettings('personPostureDetectionSettings', { trigger_on: 'walking' }).error).toBeTruthy();
    expect(DetectionSettingsValidation.validateNewDetectorSettings('cansStackDetectionSettings', { layers: 3 }).error).toBeFalsy();
    expect(DetectionSettingsValidation.validateNewDetectorSettings('cansStackDetectionSettings', { layers: 0 }).error).toBeTruthy();
    expect(IncidentsValidator.validatePostureOrStackIncident({ incidentType: 'personPostureDetection', timeOfIncident: '2026-11-18T10:30:00Z', posture: 'sitting', confidence: 0.91 }).error).toBeFalsy();
    expect(IncidentsValidator.validatePostureOrStackIncident({ incidentType: 'cansStackDetection', timeOfIncident: '2026-11-18T08:00:00Z', layers: 3, observedLayers: 4 }).error).toBeFalsy();
    expect(IncidentsValidator.validatePostureOrStackIncident({ incidentType: 'personPostureDetection', timeOfIncident: '2026-11-18T10:30:00Z', posture: 'walking' }).error).toBeTruthy();
  });
});
