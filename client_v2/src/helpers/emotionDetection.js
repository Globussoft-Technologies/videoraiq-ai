export const EMOTION_SETTING_TYPE = 'emotionDetectionSettings';
export const EMOTION_ALERT_GROUPS = Object.freeze(['positive', 'neutral', 'negative', 'surprise']);
export const EMOTION_LOG_GROUPS = Object.freeze([
  { id: 'positive', label: 'Positive', emotions: ['Happiness'] },
  { id: 'negative', label: 'Negative', emotions: ['Anger', 'Contempt', 'Disgust', 'Fear', 'Sadness'] },
  { id: 'surprise', label: 'Surprise', emotions: ['Surprise'] },
  { id: 'neutral', label: 'Neutral', emotions: ['Neutral'] },
]);

export function selectedEmotionGroup(emotions = []) {
  if (!emotions.length) return '';
  const selected = new Set(emotions);
  return EMOTION_LOG_GROUPS.find(group => group.emotions.length === selected.size && group.emotions.every(emotion => selected.has(emotion)))?.id || '';
}

export function emotionZoneSettings(zone = {}, shared = {}) {
  return {
    emotion_alert_groups: [...(zone.emotion_alert_groups ?? shared.emotion_alert_groups ?? EMOTION_ALERT_GROUPS)],
  };
}

export function emotionGroupsForSelection(value) {
  return value === 'all' ? [...EMOTION_ALERT_GROUPS] : [value];
}

export function emotionAlertGroupsError(groups) {
  if (!Array.isArray(groups) || !groups.length) return 'Emotion Alert Group is required.';
  if (groups.some(group => !EMOTION_ALERT_GROUPS.includes(group)) || new Set(groups).size !== groups.length) {
    return 'Select a valid emotion alert group.';
  }
  return '';
}
