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

export function emotionGroupForFilter(emotions = []) {
  if (!emotions.length) return '';
  return EMOTION_LOG_GROUPS.find(group => emotions.every(emotion => group.emotions.includes(emotion)))?.id || '';
}

export function emotionOptionsForFilter(groupId = '', availableEmotions = []) {
  const group = EMOTION_LOG_GROUPS.find(item => item.id === groupId);
  const values = group
    ? group.emotions
    : [...EMOTION_LOG_GROUPS.flatMap(item => item.emotions), ...availableEmotions];
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()))]
    .map(value => ({ id: value, label: value }));
}

export function emotionAlertLabel(item) {
  if (item?.incidentType !== 'emotionDetection') return '';
  const emotion = String(item.emotion || '').trim();
  if (!emotion) return '';
  const group = EMOTION_LOG_GROUPS.find(candidate =>
    candidate.emotions.some(value => value.toLowerCase() === emotion.toLowerCase()));
  return group && group.label.toLowerCase() !== emotion.toLowerCase()
    ? `${group.label} · ${emotion}`
    : emotion;
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
