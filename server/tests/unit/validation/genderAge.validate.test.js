import { describe, expect, it } from 'vitest';
import settingsValidator from '../../../core/v2/detectionSettings/detectionSettings.validate.js';
import incidentsValidator from '../../../core/v2/incidents/incidents.validate.js';
import { GenderAgeDetectionSetting } from '../../../core/v1/detectionSettings/detectionSettings.model.js';
import { GenderAgeDetectionIncident } from '../../../core/v1/incidents/incidents.model.js';

const ids = { cameraId: '68e1f2a9c4b3d2e1a0f5c6d7', channelId: '68e1f2a9c4b3d2e1a0f5c6d7', nvrId: '68e1f2a9c4b3d2e1a0f5c6d8', adminId: '68e1f2a9c4b3d2e1a0f5c6d9' };
const alert = { ...ids, incidentType: 'genderAgeDetection', timeOfIncident: '2026-11-04T20:30:15Z', incidentName: 'Female Detected', Image: 'https://nas.test/frame.jpg', targetGender: 'Female', details: [{ track_id: 101, bbox: [120, 80, 260, 420], gender: 'Female', confidence: 0.884, age: 27 }] };
const counts = { ...ids, incidentType: 'genderAgeCount', femaleCount: 3, maleCount: 1, zones: [{ zone_idx: 0, zone: 'Reception', female_count: 2, male_count: 0 }], triggerNotification: false };

describe('Gender & Age contracts', () => {
  it('accepts alerts and count posts without an image, channelId or timestamp', () => {
    expect(incidentsValidator.validateGenderAgeIncident(alert).error).toBeUndefined();
    const { channelId, ...snapshot } = counts;
    expect(incidentsValidator.validateGenderAgeIncident(snapshot).error).toBeUndefined();
    expect(new GenderAgeDetectionIncident({ ...alert, userId: 'test' }).validateSync()).toBeUndefined();
  });
  it.each(['Male', 'Female'])('supports %s per zone with detector defaults', gender => {
    const settings = { zone_configs: [{ name: 'Reception', target_gender: gender }] };
    expect(settingsValidator.validateGenderAgeSettings('genderAgeDetectionSettings', settings).error).toBeUndefined();
    const doc = new GenderAgeDetectionSetting({ name: 'Gender', userId: 'test', enabled: true, settings });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.settings.gender_confidence_threshold).toBe(0.6);
    expect(doc.settings.gender_age_min_confirmation_frames).toBe(2);
    expect(doc.settings.face_crop_padding).toBe(0.15);
    expect(doc.settings.zone_configs[0].target_gender).toBe(gender);
  });
  it.each([
    { target_gender: 'all' }, { gender_confidence_threshold: 1.1 },
    { gender_age_min_confirmation_frames: 1.5 }, { face_crop_padding: -0.1 },
    { zone_configs: [{ name: 'Reception', target_gender: 'Unknown' }] },
  ])('rejects invalid detector settings %j', settings => {
    expect(settingsValidator.validateGenderAgeSettings('genderAgeDetectionSettings', settings).error).toBeTruthy();
  });
  it.each([
    { femaleCount: -1 }, { maleCount: 1.5 }, { triggerNotification: true },
    { zones: [{ zone_idx: 0, zone: 'Reception', female_count: -1, male_count: 0 }] },
  ])('rejects invalid count updates %j', fields => {
    expect(incidentsValidator.validateGenderAgeIncident({ ...counts, ...fields }).error).toBeTruthy();
  });
  it('rejects malformed alerts and leaves other incident types alone', () => {
    expect(incidentsValidator.validateGenderAgeIncident({ ...alert, details: [{ confidence: 2 }] }).error).toBeTruthy();
    expect(incidentsValidator.validateGenderAgeIncident({ ...alert, Image: '' }).error).toBeTruthy();
    expect(incidentsValidator.validateGenderAgeIncident({ incidentType: 'emotionDetection' }).error).toBeNull();
  });
});
