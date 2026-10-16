export const HYGIENE_SETTING_TYPE = 'hygieneSanitationFoodSafetyDetectionSettings';
export const HYGIENE_INCIDENT_TYPE = 'hygieneSanitationFoodSafetyDetection';
export const HYGIENE_LABEL = 'Hygiene, Sanitation & Food Safety Detection';

export const HYGIENE_CATEGORY_OPTIONS = [
  { id: 'handHygieneBypass', label: 'Hand Hygiene Bypass' },
  { id: 'productContact', label: 'Product on Floor / Unclean Surface' },
  { id: 'contaminationRisk', label: 'Contamination Risk / Spillage' },
];

export const HYGIENE_CONTROLS = [
  { key: 'hygiene_interval_sec', label: 'Check interval', defaultValue: 180, min: 1, max: 600, step: 1, unit: 's' },
  { key: 'hygiene_min_confidence', label: 'Minimum confidence', defaultValue: 0.6, min: 0, max: 1, step: 0.01, unit: '' },
  { key: 'hygiene_cooldown_sec', label: 'Alert cooldown', defaultValue: 1800, min: 0, max: 7200, step: 1, unit: 's' },
];

// Zone overrides win over detection-wide values. Keep zero confidence and
// cooldown values, and copy category arrays so editing one zone cannot edit another.
export function hygieneZoneSettings(zone = {}, settings = {}) {
  return {
    hygiene_categories: [...(zone.hygiene_categories ?? settings.hygiene_categories ?? HYGIENE_CATEGORY_OPTIONS.map(option => option.id))],
    ...Object.fromEntries(HYGIENE_CONTROLS.map(control => [
      control.key, zone[control.key] ?? settings[control.key] ?? control.defaultValue,
    ])),
  };
}

export function hygieneZoneErrors(zone = {}) {
  const errors = {};
  const categories = zone.hygiene_categories;
  if (!Array.isArray(categories) || !categories.length
    || categories.some(category => !HYGIENE_CATEGORY_OPTIONS.some(option => option.id === category))
    || new Set(categories).size !== categories.length) {
    errors.hygiene_categories = 'Select at least one hygiene category.';
  }
  for (const control of HYGIENE_CONTROLS) {
    const raw = zone[control.key];
    const value = Number(raw);
    if (raw == null || String(raw).trim() === '' || !Number.isFinite(value) || value < control.min
      || (control.key === 'hygiene_min_confidence' && value > 1)) {
      errors[control.key] = control.key === 'hygiene_min_confidence'
        ? 'Enter a confidence between 0 and 1.'
        : `Enter a value of at least ${control.min} seconds.`;
    }
  }
  return errors;
}

export function hygieneZonePayload(zone) {
  return {
    hygiene_categories: [...zone.hygiene_categories],
    ...Object.fromEntries(HYGIENE_CONTROLS.map(control => [control.key, Number(zone[control.key])])),
  };
}

export function hygieneCategoryLabel(category) {
  return HYGIENE_CATEGORY_OPTIONS.find(option => option.id === category)?.label || category;
}
