import { describe, expect, it } from 'vitest';
import validator from '../../../core/v2/detectionSettings/detectionSettings.validate.js';
import { EmotionDetectionSetting, BoxPackingDetectionSetting } from '../../../core/v1/detectionSettings/detectionSettings.model.js';
import { EMOTION_ALERT_GROUPS } from '../../../constants/emotionDetection.js';

const makeSetting = zone_configs => new EmotionDetectionSetting({
  userId: 'emotion-user', name: 'Emotion', enabled: true, settings: { zone_configs },
});

describe('per-zone emotion alert groups', () => {
  it('preserves independent selections and defaults legacy zones to all groups', () => {
    const setting = makeSetting([{ name: 'Reception', emotion_alert_groups: ['negative'] }, { name: 'Lobby' }]);
    expect(setting.validateSync()).toBeUndefined();
    const zones = setting.toObject().settings.zone_configs;
    expect(zones[0].emotion_alert_groups).toEqual(['negative']);
    expect(zones[1].emotion_alert_groups).toEqual(EMOTION_ALERT_GROUPS);
    expect(validator.validateEmotionSettings('emotionDetectionSettings', { zone_configs: zones }).error).toBeUndefined();
  });

  it.each([[], ['all'], ['negative', 'negative'], ['invalid'], null, 'negative'])(
    'rejects invalid zone selections: %j', groups => {
      const zone = { name: 'Reception', emotion_alert_groups: groups };
      expect(validator.validateEmotionSettings('emotionDetectionSettings', { zone_configs: [zone] }).error).toBeTruthy();
    },
  );

  it('accepts every selectable group and the explicit all array', () => {
    for (const groups of [...EMOTION_ALERT_GROUPS.map(group => [group]), [...EMOTION_ALERT_GROUPS]]) {
      const settings = { zone_configs: [{ name: 'Reception', emotion_alert_groups: groups }] };
      expect(validator.validateEmotionSettings('emotionDetectionSettings', settings).error).toBeUndefined();
      expect(makeSetting(settings.zone_configs).validateSync()).toBeUndefined();
    }
  });

  it('does not add emotion groups to other named-zone detections', () => {
    const setting = new BoxPackingDetectionSetting({ settings: { zone_configs: [{ name: 'Desk' }] } });
    expect(setting.toObject().settings.zone_configs[0]).not.toHaveProperty('emotion_alert_groups');
  });
});
