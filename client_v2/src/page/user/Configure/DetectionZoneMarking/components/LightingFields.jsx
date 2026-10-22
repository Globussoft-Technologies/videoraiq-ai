import { useId } from 'react';
import MultiSelect from '../../../../../components/MultiSelect';
import { LIGHTING_CATEGORY_OPTIONS, LIGHTING_CONTROLS, lightingInputScale, lightingInputValue, lightingStoredValue } from '../../../../../helpers/lightingDetection';

export default function LightingFields({ value: zone, onChange, errors = {}, disabled = false, showZoneName = true }) {
  const id = useId();
  return (
    <fieldset disabled={disabled} style={{ margin: 0, padding: 0, border: 0, minWidth: 0, display: 'grid', gap: 12 }}>
      <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)', marginBottom: 8 }}>Lighting / Visibility / Site Conditions</legend>
      {showZoneName && <div>
        <label htmlFor={`${id}-zone`} style={{ display: 'block', marginBottom: 5, fontSize: 11, color: 'var(--tx2)' }}>Zone name *</label>
        <input id={`${id}-zone`} value={zone.zone_name} disabled={disabled} onChange={event => onChange('zone_name', event.target.value)} aria-invalid={Boolean(errors.zone_name)} style={{ width: '100%', height: 36, padding: '0 11px', borderRadius: 8, boxSizing: 'border-box', background: 'var(--bg2)', border: `1px solid ${errors.zone_name ? '#ef4444' : 'var(--bd)'}`, fontSize: 12.5, color: 'var(--tx)' }} />
        {errors.zone_name && <p role="alert" style={{ margin: '5px 0 0', color: '#ef4444', fontSize: 11 }}>{errors.zone_name}</p>}
      </div>}
      <div>
        <div id={`${id}-categories`} style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 5 }}>Lighting categories *</div>
        <div role="group" aria-labelledby={`${id}-categories`}>
          <MultiSelect
            options={LIGHTING_CATEGORY_OPTIONS}
            value={zone.lighting_categories || []}
            onChange={value => onChange('lighting_categories', value)}
            placeholder="Select lighting categories"
            searchable={false}
            inlinePanel
          />
        </div>
        {errors.lighting_categories && <p role="alert" style={{ margin: '5px 0 0', color: '#ef4444', fontSize: 11 }}>{errors.lighting_categories}</p>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => LIGHTING_CONTROLS.forEach(control => onChange(control.key, control.defaultValue))}
          aria-label="Reset all three lighting sliders to defaults"
          title="Reset check interval, minimum confidence and alert cooldown to defaults"
          style={{ padding: '2px 0 2px 8px', border: 0, background: 'transparent', color: 'var(--blue)', fontSize: 11, cursor: disabled ? 'default' : 'pointer' }}
        >
          Reset
        </button>
      </div>
      {LIGHTING_CONTROLS.map(control => {
        const storedValue = zone[control.key] ?? control.defaultValue;
        const scale = lightingInputScale(control.key);
        const value = lightingInputValue(control.key, storedValue);
        const inputId = `${id}-${control.key}`;
        return (
          <div key={control.key}>
            <label htmlFor={inputId} style={{ display: 'block', marginBottom: 5, fontSize: 11, color: 'var(--tx2)' }}>
              {control.label}{scale === 60 ? ' (minutes)' : ' (0.5-1)'}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id={inputId}
                type="range"
                min={control.min / scale}
                max={control.max / scale}
                step={scale === 60 ? 1 : control.step}
                value={value === '' ? control.min / scale : value}
                onChange={event => onChange(control.key, lightingStoredValue(control.key, event.target.value))}
                aria-invalid={Boolean(errors[control.key])}
                aria-describedby={errors[control.key] ? `${inputId}-error` : undefined}
                style={{ flex: 1, minWidth: 0, accentColor: 'var(--blue)' }}
              />
              <input
                type="number"
                aria-label={`${control.label}${scale === 60 ? ' in minutes' : ' value'}`}
                min={control.min / scale}
                max={control.max / scale}
                step={scale === 60 ? 1 : control.step}
                value={value}
                onChange={event => onChange(control.key, lightingStoredValue(control.key, event.target.value))}
                aria-invalid={Boolean(errors[control.key])}
                aria-describedby={errors[control.key] ? `${inputId}-error` : undefined}
                style={{ width: 76, height: 32, boxSizing: 'border-box', padding: '0 7px', borderRadius: 7, background: 'var(--bg2)', color: 'var(--tx)', border: `1px solid ${errors[control.key] ? '#ef4444' : 'var(--bd)'}`, fontSize: 12 }}
              />
            </div>
            {errors[control.key] && <p id={`${inputId}-error`} role="alert" style={{ margin: '5px 0 0', color: '#ef4444', fontSize: 11 }}>{errors[control.key]}</p>}
          </div>
        );
      })}
    </fieldset>
  );
}
