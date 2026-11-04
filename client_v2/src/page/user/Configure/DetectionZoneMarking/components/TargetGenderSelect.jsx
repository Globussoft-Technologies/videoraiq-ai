import { TARGET_GENDERS } from '../../../../../helpers/genderAgeDetection';

export default function TargetGenderSelect({ value = 'Female', onChange, disabled, id }) {
  return <div>
    <label htmlFor={id} style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Target Gender</label>
    <select id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}
      style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box', background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx)' }}>
      {TARGET_GENDERS.map(gender => <option key={gender} value={gender}>{gender}</option>)}
    </select>
  </div>;
}
