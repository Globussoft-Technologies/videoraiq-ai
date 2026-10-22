import { useId } from 'react';
import MultiSelect from '../../../../../components/MultiSelect';
import { HYGIENE_CATEGORY_OPTIONS, HYGIENE_CONTROLS } from '../../../../../helpers/hygieneDetection';

export default function HygieneZoneFields({ zone, onChange, errors = {}, disabled = false }) {
  const id = useId();
  return (
    <fieldset disabled={disabled} style={{ margin: 0, padding: 0, border: 0, minWidth: 0, display: 'grid', gap: 12 }}>
      <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)', marginBottom: 8 }}>Hygiene &amp; food safety</legend>
      <div>
        <div id={`${id}-categories`} style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 5 }}>Hygiene categories *</div>
        <div role="group" aria-labelledby={`${id}-categories`}>
          <MultiSelect
            options={HYGIENE_CATEGORY_OPTIONS}
            value={zone.hygiene_categories || []}
            onChange={value => onChange('hygiene_categories', value)}
            placeholder="Select hygiene categories"
            searchable={false}
            inlinePanel
          />
        </div>
        {errors.hygiene_categories && <p role="alert" style={{ margin: '5px 0 0', color: '#ef4444', fontSize: 11 }}>{errors.hygiene_categories}</p>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => HYGIENE_CONTROLS.forEach(control => onChange(control.key, control.defaultValue))}
          aria-label="Reset all three hygiene sliders to defaults"
          title="Reset check interval, minimum confidence and alert cooldown to defaults"
          style={{ padding: '2px 0 2px 8px', border: 0, background: 'transparent', color: 'var(--blue)', fontSize: 11, cursor: disabled ? 'default' : 'pointer' }}
        >
          Reset
        </button>
      </div>
      {HYGIENE_CONTROLS.map(control => {
        const value = zone[control.key] ?? control.defaultValue;
        const inputId = `${id}-${control.key}`;
        return (
          <div key={control.key}>
            <label htmlFor={inputId} style={{ display: 'block', marginBottom: 5, fontSize: 11, color: 'var(--tx2)' }}>
              {control.label}{control.unit ? ' (seconds)' : ' (0.5–1)'}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id={inputId}
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={value === '' ? control.min : value}
                onChange={event => onChange(control.key, Number(event.target.value))}
                aria-invalid={Boolean(errors[control.key])}
                aria-describedby={errors[control.key] ? `${inputId}-error` : undefined}
                style={{ flex: 1, minWidth: 0, accentColor: 'var(--blue)' }}
              />
              <input
                type="number"
                aria-label={`${control.label} value`}
                min={control.min}
                max={control.max}
                step={control.step}
                value={value}
                onChange={event => onChange(control.key, event.target.value === '' ? '' : Number(event.target.value))}
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
