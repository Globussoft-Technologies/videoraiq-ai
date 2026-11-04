import { describe, expect, it } from 'vitest';
import validator from '../../../core/v2/incidents/incidents.validate.js';
import { EmotionDetectionIncident } from '../../../core/v1/incidents/incidents.model.js';

const payload = {
  incidentType: 'emotionDetection',
  timeOfIncident: '2026-11-03T10:15:30Z',
  incidentName: 'Negative Expression Detected',
  Image: 'https://nas.example.com/emotion.jpg',
  emotion: 'Sadness',
  emotionGroup: 'negative',
  confidence: 0.908,
  durationSec: 5,
  trackId: 'f0f947a7-track',
  model: 'emotion_b0',
  description: 'A person showed a negative expression (Sadness) for 5 s.',
  zone: 'Reception',
  zoneName: 'Reception',
  userId: 'emotion-user',
  nvrId: '69ce7069d5b1b9d2ca500457',
  channelId: '69ce7069d5b1b9d2ca500459',
};

describe('required DS emotion incident fields', () => {
  it('accepts a complete payload', () => {
    expect(validator.validateEmotionIncident(payload).error).toBeUndefined();
    expect(new EmotionDetectionIncident(payload).validateSync()).toBeUndefined();
    expect(new EmotionDetectionIncident(payload).toObject()).toMatchObject({
      emotion: 'Sadness', emotionGroup: 'negative', confidence: 0.908,
      durationSec: 5, trackId: 'f0f947a7-track', model: 'emotion_b0', zoneName: 'Reception',
    });
  });

  for (const field of ['timeOfIncident', 'incidentName', 'Image']) {
    it.each([undefined, null, '', '   '])(`rejects missing or empty ${field}: %s`, value => {
      const body = { ...payload, [field]: value };
      expect(validator.validateEmotionIncident(body).error).toBeTruthy();
      expect(new EmotionDetectionIncident(body).validateSync()?.errors[field]).toBeTruthy();
    });
  }

  it('rejects an invalid timestamp', () => {
    expect(validator.validateEmotionIncident({ ...payload, timeOfIncident: 'invalid' }).error).toBeTruthy();
  });

  it('leaves other detection payloads unaffected', () => {
    expect(validator.validateEmotionIncident({ incidentType: 'oilLeakageDetection' }).error).toBeNull();
  });
});
