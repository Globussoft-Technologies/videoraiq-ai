export const EMOTION_SETTING_TYPE = 'emotionDetectionSettings';
export const EMOTION_ALERT_GROUPS = Object.freeze(['positive', 'neutral', 'negative', 'surprise']);

export function emotionZoneSettings(zone = {}, shared = {}) {
  return {
    emotion_alert_groups: [...(zone.emotion_alert_groups ?? shared.emotion_alert_groups ?? EMOTION_ALERT_GROUPS)],
  };
}

export function emotionGroupsForSelection(value) {
  return value === 'all' ? [...EMOTION_ALERT_GROUPS] : [value];
}
