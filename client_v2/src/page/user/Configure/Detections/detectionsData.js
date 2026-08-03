import { Users, ShieldAlert, Car, HardHat, Store, Factory, Settings2 } from 'lucide-react';

/** `tint` is the translucent wash used behind the category's icon tile. */
export const DETECTION_CATEGORIES = [
  { key: 'people', label: 'People & Crowd', color: 'var(--blue)', tint: 'rgba(59,130,246,.16)', icon: Users },
  { key: 'perimeter', label: 'Perimeter & Security', color: 'var(--crit)', tint: 'rgba(255,77,77,.15)', icon: ShieldAlert },
  { key: 'vehicles', label: 'Vehicles & Traffic', color: 'var(--violet)', tint: 'rgba(168,85,247,.16)', icon: Car },
  { key: 'safety', label: 'Safety & PPE', color: 'var(--warn)', tint: 'rgba(245,166,35,.15)', icon: HardHat },
  { key: 'workplace', label: 'Workplace & Retail', color: 'var(--cyan)', tint: 'rgba(34,211,238,.15)', icon: Store },
  { key: 'industrial', label: 'Industrial & Environment', color: 'var(--ok)', tint: 'rgba(34,197,94,.15)', icon: Factory },
  // { key: 'other', label: 'Other Models', color: 'var(--tx3)', tint: 'rgba(148,163,184,.15)', icon: Settings2 },
];

export const CATEGORY_BY_KEY = Object.fromEntries(DETECTION_CATEGORIES.map((c) => [c.key, c]));

export const SEVERITIES = [
  { key: 'critical', label: 'Critical', short: 'CRIT', color: 'var(--crit)', tint: 'rgba(255,77,77,.14)' },
  { key: 'high', label: 'High', short: 'HIGH', color: 'var(--warn)', tint: 'rgba(245,166,35,.15)' },
  { key: 'medium', label: 'Medium', short: 'MED', color: 'var(--blue)', tint: 'rgba(59,130,246,.16)' },
  { key: 'low', label: 'Low', short: 'LOW', color: 'var(--cyan)', tint: 'rgba(34,211,238,.14)' },
];

export const SEVERITY_BY_KEY = Object.fromEntries(SEVERITIES.map((s) => [s.key, s]));

export const INCIDENT_STATUS = {
  new: { label: 'New', color: 'var(--crit)' },
  acknowledged: { label: 'Acknowledged', color: 'var(--warn)' },
  resolved: { label: 'Resolved', color: 'var(--ok)' },
};

const CATEGORY_MATCHERS = [
  ['safety', ['ppe', 'protective', 'safety', 'helmet', 'vest', 'fire', 'smoke', 'weapon']],
  ['vehicles', ['vehicle', 'traffic', 'anpr', 'plate']],
  ['industrial', ['conveyor', 'crusher', 'spillage', 'spill', 'light']],
  ['perimeter', ['intrusion', 'unauthorized', 'access', 'line', 'crossing', 'loiter', 'bag', 'baggage']],
  ['people', ['person', 'people', 'crowd', 'face']],
  ['workplace', ['desk', 'guard', 'table', 'occupancy', 'door', 'phone', 'mobile', 'retail', 'food']],
];

function detectionEntries(detectionTypes) {
  if (Array.isArray(detectionTypes)) {
    return detectionTypes
      .map((item, index) => {
        if (typeof item === 'string') return [item, item];
        const key = item?.settingType || item?.detectionType || item?.key || item?.id || item?.value;
        return key ? [key, item] : [`type-${index}`, item];
      })
      .filter(([key]) => key);
  }

  if (detectionTypes && typeof detectionTypes === 'object') {
    return Object.entries(detectionTypes);
  }

  return [];
}

function detectionLabel(value, fallback) {
  if (typeof value === 'string') return value;
  return value?.displayName || value?.label || value?.name || value?.detectionName || fallback;
}

function numberFrom(...values) {
  const value = values.find((candidate) => Number.isFinite(Number(candidate)));
  return value == null ? null : Number(value);
}

function boolFrom(value, fallback) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function categoryFor(key, label) {
  const text = `${key} ${label}`.toLowerCase();
  const match = CATEGORY_MATCHERS.find(([, words]) => words.some((word) => text.includes(word)));
  return match?.[0] || 'other';
}

function subtitleFor(key, label) {
  const cleaned = String(label || key)
    .replace(/\s+detection\s*$/i, '')
    .replace(/\s+settings\s*$/i, '')
    .trim();
  return cleaned || key;
}

export function buildDetectionModels(detectionTypes) {
  return detectionEntries(detectionTypes).map(([key, value]) => {
    const label = detectionLabel(value, key);
    const data = value && typeof value === 'object' ? value : {};
    const settings = data.settings || {};
    const minConfidence = numberFrom(
      data.minConfidence,
      data.minimumConfidence,
      data.confidence,
      settings.minConfidence,
      settings.minimumConfidence,
      settings.confidence,
      settings.alertThreshold,
    );

    return {
      id: key,
      settingType: key,
      name: label,
      subtitle: data.subtitle || subtitleFor(key, label),
      category: data.category || categoryFor(key, label),
      active: boolFrom(data.active, boolFrom(data.enabled, true)),
      incidents24h: numberFrom(data.incidents24h, data.incidentCount24h, data.last24Hours, data.count24h) ?? 0,
      sensitivity: numberFrom(data.sensitivity, settings.sensitivity, minConfidence) ?? 70,
      schedule: data.schedule || settings.schedule || 'Set per camera',
      appliedCameras: numberFrom(
        data.appliedCameras,
        data.cameraCount,
        data.channelsCount,
        Array.isArray(data.channelId) ? data.channelId.length : null,
        Array.isArray(data.channels) ? data.channels.length : null,
      ),
      minConfidence,
    };
  });
}

export function emptyIncidents() {
  return [];
}
