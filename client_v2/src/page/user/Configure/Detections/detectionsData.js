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

/**
 * Dummy threshold-key lists keyed by detection setting type. These will come
 * from the API response eventually. Each key in the array is rendered as its
 * own labelled slider/toggle row in the detail panel - one label → one row,
 * two labels → two rows, and so on.
 */
export const DETECTION_THRESHOLDS = {
  faceAuth: ['person_threshold'],
  faceRecognitionSettings: ['person_threshold'],
  faceDetectionSettings: ['person_threshold'],
  personalProtectiveEquipmentSettings: ['person_threshold', 'vest_threshold', 'helmet_threshold'],
  foodServicePPEDetection: ['person_threshold', 'emp_floor', 'glove_floor', 'apron_floor'],
  foodServicePPEDetectionSettings: ['person_threshold', 'emp_floor', 'glove_floor', 'apron_floor'],
  crowdDetectionSettings: ['person_threshold'],
  lineCrossingSettings: ['person_threshold'],
  countPersonsSettings: ['person_threshold'],
  unauthorizedAccessSettings: ['person_threshold'],
  intrusionDetectionSettings: ['person_threshold'],
  zoneIntrusionSettings: ['person_threshold'],
  deskAbsenceSettings: ['person_threshold'],
  deskAbsenceDetection: ['person_threshold'],
  guardSleepingDetectionSettings: ['person_threshold'],
  guardSleepingDetection: ['person_threshold'],
  tableOccupancyDetectionSettings: ['person_threshold'],
  tableOccupancySettings: ['person_threshold'],
  loiteringDetectionSettings: ['person_threshold'],
  countVehiclesSettings: ['vehicle_threshold'],
  vehicleObstructionSettings: ['vehicle_threshold'],
  vehicleTypeDetectionSettings: ['vehicle_threshold', 'forklift_threshold'],
  vehicleDetectionSettings: ['plate_confidence', 'ocr_min_confidence'],
  anprSettings: ['plate_confidence', 'ocr_min_confidence'],
  vehicleNumberPlateSettings: ['plate_confidence', 'ocr_min_confidence'],
  numberPlateDetectionSettings: ['plate_confidence', 'ocr_min_confidence'],
  mobilePhoneDetectionSettings: ['mobile_phone_confidence'],
  conveyorDetectionSettings: [],
  crusherDetectionSettings: [],
  waterSpillageDetectionSettings: [],
};

/** Human-friendly label for a threshold key; falls back to a title-cased key. */
export const THRESHOLD_LABELS = {
  person_threshold: 'Person',
  vest_threshold: 'Vest',
  helmet_threshold: 'Helmet',
  emp_floor: 'Employee',
  glove_floor: 'Glove',
  apron_floor: 'Apron',
  vehicle_threshold: 'Vehicle',
  forklift_threshold: 'Forklift',
  plate_confidence: 'Plate Confidence',
  ocr_min_confidence: 'OCR Min Confidence',
  mobile_phone_confidence: 'Mobile Phone Confidence',
};

export function thresholdLabel(key) {
  return THRESHOLD_LABELS[key] || String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const CATEGORY_MATCHERS = [
  ['safety', ['ppe', 'protective', 'safety', 'helmet', 'vest', 'fire', 'smoke', 'weapon']],
  ['vehicles', ['vehicle', 'traffic', 'anpr', 'plate', 'car']],
  ['industrial', ['conveyor', 'crusher', 'spillage', 'spill', 'light']],
  ['perimeter', ['intrusion', 'unauthorized', 'access', 'line', 'crossing', 'loiter', 'bag', 'baggage']],
  ['people', ['person', 'people', 'crowd', 'face', 'attendance']],
  ['workplace', ['desk', 'guard', 'table', 'occupancy', 'door', 'phone', 'mobile', 'retail', 'food']],
];

function isAttendanceDetection(value) {
  const normalized = String(value || '')
    .replace(/settings$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  return normalized === 'attendancedetection' || normalized === 'attendance';
}

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

/** Normalize a threshold value to the 0-100 slider range (0.7 → 70). */
export function toPercent(value) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num > 0 && num <= 1 ? Math.round(num * 100) : Math.round(num);
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

function camelize(key) {
  return String(key || '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function buildDetectionModels(detectionTypes) {
  return detectionEntries(detectionTypes).map(([key, value]) => {
    const rawLabel = detectionLabel(value, key);
    const label = isAttendanceDetection(key) || isAttendanceDetection(rawLabel)
      ? 'Attendance-detection'
      : rawLabel;
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

    // Threshold rows come from the API when available (`data.thresholds`),
    // otherwise fall back to the dummy config for this setting type.
    // `data.thresholds` can be an array of keys (`['person_threshold', ...]`)
    // or an object (`{ person_threshold: 0.75, vest_threshold: 80 }`).
    let thresholdKeys = [];
    let thresholdValues = {};
    if (Array.isArray(data.thresholds)) {
      thresholdKeys = data.thresholds;
    } else if (data.thresholds && typeof data.thresholds === 'object') {
      thresholdKeys = Object.keys(data.thresholds);
      thresholdValues = data.thresholds;
    } else {
      thresholdKeys = DETECTION_THRESHOLDS[key] || [];
    }

    const thresholds = {};
    for (const tk of thresholdKeys) {
      const raw = numberFrom(thresholdValues[tk], data[tk], settings[tk], settings[camelize(tk)]);
      thresholds[tk] = toPercent(raw) ?? 70;
    }

    const firstThreshold = Object.values(thresholds)[0];
    const sensitivity = firstThreshold
      ?? toPercent(numberFrom(data.sensitivity, settings.sensitivity, minConfidence))
      ?? 70;

    return {
      id: key,
      settingType: key,
      name: label,
      subtitle: data.subtitle || subtitleFor(key, label),
      category: data.category || categoryFor(key, label),
      active: boolFrom(data.active, boolFrom(data.enabled, true)),
      incidents24h: numberFrom(data.incidents24h, data.incidentCount24h, data.last24Hours, data.count24h) ?? 0,
      sensitivity,
      thresholds,
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
