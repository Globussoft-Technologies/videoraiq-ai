export const LIGHTING_SETTING_TYPE = 'lightingVisibilitySiteConditionsDetectionSettings';
export const LIGHTING_INCIDENT_TYPE = 'lightingVisibilitySiteConditionsDetection';
export const LIGHTING_LABEL = 'Lighting / Visibility / Site Conditions Detection';

export const LIGHTING_CATEGORY_OPTIONS = [
  { id: 'lowVisibility', label: 'Low Visibility (Fog / Rain / Poor Light)' },
  { id: 'roadSurfaceDamage', label: 'Road Surface Damage' },
  { id: 'weatherSiteHazard', label: 'Weather-Related Site Hazard' },
];

export const LIGHTING_CONTROLS = [
  { key: 'lighting_interval_sec', label: 'Check interval', defaultValue: 3600, min: 600, max: 86400, step: 1 },
  { key: 'lighting_min_confidence', label: 'Minimum confidence', defaultValue: 0.6, min: 0.5, max: 1, step: 0.01 },
  { key: 'lighting_cooldown_sec', label: 'Alert cooldown', defaultValue: 21600, min: 0, max: 86400, step: 1 },
];

export const lightingInputScale = key => key === 'lighting_min_confidence' ? 1 : 60;
export const lightingInputValue = (key, value) => value === '' ? '' : lightingInputScale(key) === 60 ? Math.round(Number(value) / 60) : Number(value);
export const lightingStoredValue = (key, value) => value === '' ? '' : lightingInputScale(key) === 60 ? Math.round(Number(value)) * 60 : Number(value);

export function lightingSettings(settings = {}) {
  return {
    zone_name: settings.zone_name ?? 'Scrap Yard',
    trigger_notification: settings.trigger_notification ?? true,
    lighting_categories: [...(settings.lighting_categories ?? LIGHTING_CATEGORY_OPTIONS.map(option => option.id))],
    ...Object.fromEntries(LIGHTING_CONTROLS.map(control => [control.key, settings[control.key] ?? control.defaultValue])),
  };
}

export function lightingErrors(settings) {
  const errors = {};
  if (!String(settings.zone_name || '').trim()) errors.zone_name = 'Enter a zone name.';
  const categories = settings.lighting_categories;
  if (!Array.isArray(categories) || !categories.length
    || new Set(categories).size !== categories.length
    || categories.some(category => !LIGHTING_CATEGORY_OPTIONS.some(option => option.id === category))) {
    errors.lighting_categories = 'Select at least one lighting category.';
  }
  for (const control of LIGHTING_CONTROLS) {
    const raw = settings[control.key];
    const value = Number(raw);
    if (raw == null || String(raw).trim() === '' || !Number.isFinite(value) || value < control.min || value > control.max) {
      const scale = lightingInputScale(control.key);
      errors[control.key] = `Enter a value between ${control.min / scale} and ${control.max / scale}${scale === 60 ? ' minutes' : ''}.`;
    }
  }
  return errors;
}

export function lightingPayload(settings) {
  return {
    ...lightingSettings(settings),
    zone_name: settings.zone_name.trim(),
    ...Object.fromEntries(LIGHTING_CONTROLS.map(control => [control.key, lightingStoredValue(control.key, lightingInputValue(control.key, settings[control.key]))])),
  };
}

export function lightingCategoryLabel(category) {
  return LIGHTING_CATEGORY_OPTIONS.find(option => option.id === category)?.label || category;
}

export function lightingZoneSettings(zone = {}, settings = {}) {
  return {
    lighting_categories: [...(zone.lighting_categories ?? settings.lighting_categories ?? LIGHTING_CATEGORY_OPTIONS.map(option => option.id))],
    ...Object.fromEntries(LIGHTING_CONTROLS.map(control => [control.key, zone[control.key] ?? settings[control.key] ?? control.defaultValue])),
  };
}

export function lightingZoneErrors(zone) {
  const { zone_name, ...errors } = lightingErrors({ ...zone, zone_name: zone.name || 'Zone' });
  return errors;
}

export function lightingZonePayload(zone) {
  return {
    lighting_categories: [...zone.lighting_categories],
    ...Object.fromEntries(LIGHTING_CONTROLS.map(control => [control.key, Number(zone[control.key])])),
  };
}
