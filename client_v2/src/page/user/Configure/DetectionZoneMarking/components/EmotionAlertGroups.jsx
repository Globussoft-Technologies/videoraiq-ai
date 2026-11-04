import { EMOTION_ALERT_GROUPS, emotionGroupsForSelection } from '../../../../../helpers/emotionDetection';

export default function EmotionAlertGroups({ value = EMOTION_ALERT_GROUPS, onChange, disabled, id }) {
  const selected = value.length === EMOTION_ALERT_GROUPS.length ? 'all' : value[0];
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>
        Emotion Alert Group
      </label>
      <select id={id} value={selected} disabled={disabled}
        onChange={event => onChange(emotionGroupsForSelection(event.target.value))}
        style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box', background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx)', outline: 'none' }}>
        <option value="all">All</option>
        {EMOTION_ALERT_GROUPS.map(group => <option key={group} value={group}>{group[0].toUpperCase() + group.slice(1)}</option>)}
      </select>
    </div>
  );
}
