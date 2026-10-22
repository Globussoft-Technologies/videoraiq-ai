import { describe, expect, it } from 'vitest';
import validator from '../../../core/v2/detectionSettings/detectionSettings.validate.js';
import { lightingErrors, lightingSettings } from '../../../../client_v2/src/helpers/lightingDetection.js';

const settingType = 'lightingVisibilitySiteConditionsDetectionSettings';

describe('lighting settings detector limits', () => {
  it.each([
    ['lighting_interval_sec', 599], ['lighting_interval_sec', 86401],
    ['lighting_min_confidence', 0.49], ['lighting_min_confidence', 1.01],
    ['lighting_cooldown_sec', -1], ['lighting_cooldown_sec', 86401],
  ])('rejects unsupported %s=%s in the form and API', (field, value) => {
    const settings = lightingSettings({ [field]: value });
    expect(lightingErrors(settings)[field]).toBeTruthy();
    expect(validator.validateLightingSettings(settingType, settings).error).toBeTruthy();
    expect(validator.validateLightingSettings(settingType, { zone_configs: [settings] }).error).toBeTruthy();
  });

  it.each([[600, 0.5, 0], [86400, 1, 86400], [3600, 0.6, 21600]])(
    'accepts boundaries and defaults %s / %s / %s', (interval, confidence, cooldown) => {
      const settings = lightingSettings({ lighting_interval_sec: interval, lighting_min_confidence: confidence, lighting_cooldown_sec: cooldown });
      expect(lightingErrors(settings)).toEqual({});
      expect(validator.validateLightingSettings(settingType, settings).error).toBeUndefined();
      expect(validator.validateLightingSettings(settingType, { zone_configs: [settings] }).error).toBeUndefined();
    },
  );
});
