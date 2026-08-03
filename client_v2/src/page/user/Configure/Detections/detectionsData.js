import { Users, ShieldAlert, Car, HardHat, Store, Factory } from 'lucide-react';

/**
 * Static catalogue backing the Detections page.
 *
 * Nothing here is wired to the backend yet — the page is UI-only until the
 * detections API lands. Every shape below is deliberately flat and id-keyed so
 * hooking it up is a straight swap:
 *
 *   DETECTION_CATEGORIES  -> GET /detection/categories   (or derived client-side)
 *   DETECTION_MODELS      -> GET /detection/models
 *   getIncidents(model)   -> GET /detection/:id/incidents
 *
 * Keep `id` matching whatever the API calls its detection/settingType key so
 * selection, toggles and the incident lookup keep working unchanged.
 */

/** `tint` is the translucent wash used behind the category's icon tile. */
export const DETECTION_CATEGORIES = [
  { key: 'people', label: 'People & Crowd', color: 'var(--blue)', tint: 'rgba(59,130,246,.16)', icon: Users },
  { key: 'perimeter', label: 'Perimeter & Security', color: 'var(--crit)', tint: 'rgba(255,77,77,.15)', icon: ShieldAlert },
  { key: 'vehicles', label: 'Vehicles & Traffic', color: 'var(--violet)', tint: 'rgba(168,85,247,.16)', icon: Car },
  { key: 'safety', label: 'Safety & PPE', color: 'var(--warn)', tint: 'rgba(245,166,35,.15)', icon: HardHat },
  { key: 'workplace', label: 'Workplace & Retail', color: 'var(--cyan)', tint: 'rgba(34,211,238,.15)', icon: Store },
  { key: 'industrial', label: 'Industrial & Environment', color: 'var(--ok)', tint: 'rgba(34,197,94,.15)', icon: Factory },
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

/** Face Recognition is the landing selection, so its feed is spelled out. */
const FACE_INCIDENTS = [
  { severity: 'medium', zone: 'Exec Floor', camera: 'CAM-011', site: 'HQ Tower', confidence: 82, time: '14:25:10', status: 'resolved' },
  { severity: 'low', zone: 'Warehouse Bay B', camera: 'CAM-003', site: 'Metro Mall', confidence: 73, time: '14:07:41', status: 'new' },
  { severity: 'medium', zone: 'Main Entrance', camera: 'CAM-010', site: 'Riverside Campus', confidence: 93, time: '13:38:12', status: 'acknowledged' },
  { severity: 'low', zone: 'Checkout Lane 4', camera: 'CAM-002', site: 'Westside Plant', confidence: 84, time: '13:58:43', status: 'resolved' },
  { severity: 'low', zone: 'Reception Lobby', camera: 'CAM-007', site: 'HQ Tower', confidence: 78, time: '13:07:14', status: 'resolved' },
  { severity: 'medium', zone: 'Loading Dock 2', camera: 'CAM-015', site: 'North Plant', confidence: 88, time: '12:44:29', status: 'acknowledged' },
  { severity: 'high', zone: 'Gate 3 — North', camera: 'CAM-021', site: 'Metro Mall', confidence: 71, time: '12:19:57', status: 'resolved' },
];

/**
 * `event` is the incident headline this model raises (the zone is appended to
 * it), `recent` how many incidents the detail panel lists for it.
 */
export const DETECTION_MODELS = [
  // People & Crowd
  { id: 'countPersons', name: 'Count Person Detection', subtitle: 'Occupancy', category: 'people', active: true, incidents24h: 184, sensitivity: 65, schedule: '24 / 7', appliedCameras: 38, minConfidence: 70, event: 'Occupancy threshold crossed', recent: 6 },
  { id: 'crowdDetection', name: 'Crowd Detection', subtitle: 'Density', category: 'people', active: true, incidents24h: 46, sensitivity: 78, schedule: '24 / 7', appliedCameras: 42, minConfidence: 78, event: 'High crowd density', recent: 7 },
  { id: 'faceRecognition', name: 'Face Recognition', subtitle: 'Biometric', category: 'people', active: true, incidents24h: 212, sensitivity: 86, schedule: '24 / 7', appliedCameras: 42, minConfidence: 86, event: 'Watchlist face match', recent: 7, sample: FACE_INCIDENTS },

  // Perimeter & Security
  { id: 'zoneIntrusion', name: 'Zone Intrusion Detection', subtitle: 'Perimeter', category: 'perimeter', active: true, incidents24h: 38, sensitivity: 74, schedule: '18:00 – 06:00', appliedCameras: 27, minConfidence: 72, event: 'Restricted zone entry', recent: 6 },
  { id: 'lineCrossing', name: 'Line Crossing Detection', subtitle: 'Tripwire', category: 'perimeter', active: true, incidents24h: 57, sensitivity: 70, schedule: '24 / 7', appliedCameras: 31, minConfidence: 68, event: 'Tripwire crossed', recent: 7 },
  { id: 'loitering', name: 'Loitering Detection', subtitle: 'Dwell time', category: 'perimeter', active: true, incidents24h: 29, sensitivity: 58, schedule: '20:00 – 05:00', appliedCameras: 19, minConfidence: 64, event: 'Loitering detected', recent: 5 },
  { id: 'bagDetection', name: 'Bag Detection', subtitle: 'Unattended object', category: 'perimeter', active: true, incidents24h: 12, sensitivity: 62, schedule: '24 / 7', appliedCameras: 14, minConfidence: 66, event: 'Unattended bag', recent: 4 },

  // Vehicles & Traffic
  { id: 'countVehicles', name: 'Count Vehicles Detection', subtitle: 'Flow', category: 'vehicles', active: true, incidents24h: 141, sensitivity: 68, schedule: '24 / 7', appliedCameras: 22, minConfidence: 71, event: 'Vehicle flow spike', recent: 6 },
  { id: 'anpr', name: 'Num Plate Detection (ANPR)', subtitle: 'ANPR', category: 'vehicles', active: true, incidents24h: 96, sensitivity: 80, schedule: '24 / 7', appliedCameras: 18, minConfidence: 84, event: 'Plate match', recent: 7 },
  { id: 'vehicleType', name: 'Vehicle Type Detection', subtitle: 'Classification', category: 'vehicles', active: true, incidents24h: 64, sensitivity: 66, schedule: '24 / 7', appliedCameras: 18, minConfidence: 69, event: 'Heavy vehicle identified', recent: 5 },
  { id: 'vehicleObstruction', name: 'Vehicle Traffic Obstruction', subtitle: 'Blockage', category: 'vehicles', active: true, incidents24h: 8, sensitivity: 72, schedule: '06:00 – 22:00', appliedCameras: 11, minConfidence: 74, event: 'Path obstruction', recent: 3 },

  // Safety & PPE
  { id: 'ppeDetection', name: 'PPE Detection', subtitle: 'Hard hat / vest', category: 'safety', active: true, incidents24h: 73, sensitivity: 76, schedule: '06:00 – 22:00', appliedCameras: 34, minConfidence: 79, event: 'PPE violation', recent: 7 },
  { id: 'foodServicePpe', name: 'Food Service PPE Detection', subtitle: 'Hygiene', category: 'safety', active: true, incidents24h: 21, sensitivity: 69, schedule: '05:00 – 23:00', appliedCameras: 9, minConfidence: 73, event: 'Hygiene gear missing', recent: 4 },
  { id: 'fireSmoke', name: 'Fire & Smoke Detection', subtitle: 'Hazard', category: 'safety', active: true, incidents24h: 5, sensitivity: 88, schedule: '24 / 7', appliedCameras: 46, minConfidence: 90, event: 'Smoke signature', recent: 3 },

  // Workplace & Retail
  { id: 'deskAbsence', name: 'Desk Absence Detection', subtitle: 'Workstation', category: 'workplace', active: true, incidents24h: 34, sensitivity: 60, schedule: '09:00 – 19:00', appliedCameras: 28, minConfidence: 65, event: 'Workstation vacant', recent: 6 },
  { id: 'guardAbsence', name: 'Guard Absence Detection', subtitle: 'Post coverage', category: 'workplace', active: true, incidents24h: 9, sensitivity: 72, schedule: '24 / 7', appliedCameras: 12, minConfidence: 74, event: 'Guard post unmanned', recent: 4 },
  { id: 'restaurantTable', name: 'Restaurant Table Occupancy', subtitle: 'Seating', category: 'workplace', active: true, incidents24h: 118, sensitivity: 64, schedule: '08:00 – 23:00', appliedCameras: 21, minConfidence: 68, event: 'Table occupancy change', recent: 6 },
  { id: 'doorDetection', name: 'Door Detection', subtitle: 'Open / closed', category: 'workplace', active: true, incidents24h: 52, sensitivity: 67, schedule: '24 / 7', appliedCameras: 24, minConfidence: 70, event: 'Door left open', recent: 5 },

  // Industrial & Environment
  { id: 'waterSpillage', name: 'Water Spillage Detection', subtitle: 'Floor hazard', category: 'industrial', active: true, incidents24h: 7, sensitivity: 67, schedule: '24 / 7', appliedCameras: 13, minConfidence: 71, event: 'Water spill', recent: 4 },
  { id: 'oilSpillage', name: 'Oil Spillage Detection', subtitle: 'Floor hazard', category: 'industrial', active: true, incidents24h: 4, sensitivity: 69, schedule: '24 / 7', appliedCameras: 11, minConfidence: 73, event: 'Oil spill', recent: 3 },
  { id: 'conveyorStatus', name: 'Conveyor Belt Status Detection', subtitle: 'Equipment', category: 'industrial', active: true, incidents24h: 16, sensitivity: 73, schedule: '24 / 7', appliedCameras: 12, minConfidence: 75, event: 'Conveyor idle', recent: 5 },
  { id: 'crusherStatus', name: 'Crusher Status Detection', subtitle: 'Equipment', category: 'industrial', active: false, incidents24h: 3, sensitivity: 70, schedule: 'Paused', appliedCameras: 8, minConfidence: 72, event: 'Crusher stopped', recent: 3 },
  { id: 'lightDetection', name: 'Light Detection', subtitle: 'Illumination', category: 'industrial', active: true, incidents24h: 22, sensitivity: 64, schedule: '24 / 7', appliedCameras: 10, minConfidence: 68, event: 'Illumination drop', recent: 4 },
];

const ZONES = [
  'Warehouse Bay B', 'Main Entrance', 'Checkout Lane 4', 'Loading Dock 2', 'Parking Level P1',
  'Gate 3 — North', 'Assembly Line A', 'Reception Lobby', 'Exec Floor', 'Cold Storage 1',
];
const SITES = ['HQ Tower', 'Metro Mall', 'Riverside Campus', 'Westside Plant', 'North Plant'];
const SEVERITY_ORDER = ['medium', 'low', 'medium', 'high', 'low', 'critical', 'medium', 'low', 'high'];
const STATUS_ORDER = ['acknowledged', 'resolved', 'new', 'resolved', 'acknowledged', 'new', 'resolved', 'acknowledged', 'new'];

/** Tiny deterministic hash so the sample rows stay stable across re-renders. */
function seedOf(text) {
  let seed = 7;
  for (let i = 0; i < text.length; i += 1) seed = (seed * 31 + text.charCodeAt(i)) % 9973;
  return seed;
}

function clockAt(minutesBefore) {
  // Fixed 14:52 baseline (not `now`) so the list never reshuffles between
  // renders — the real feed will carry its own timestamps.
  const total = 14 * 60 + 52 - minutesBefore;
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  const s = String((minutesBefore * 7 + 9) % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** Sample incident feed for one detection model. Replace with the API call. */
export function getIncidents(model) {
  if (!model?.recent) return [];
  if (model.sample) {
    return model.sample.map((row, i) => ({
      ...row,
      id: `${model.id}-${i}`,
      title: `${model.event} — ${row.zone}`,
    }));
  }
  const seed = seedOf(model.id);
  return Array.from({ length: model.recent }, (_, i) => {
    const step = seed + i * 13;
    return {
      id: `${model.id}-${i}`,
      severity: SEVERITY_ORDER[(step + i) % SEVERITY_ORDER.length],
      title: `${model.event} — ${ZONES[step % ZONES.length]}`,
      camera: `CAM-${String((step % 60) + 1).padStart(3, '0')}`,
      site: SITES[step % SITES.length],
      confidence: 68 + ((step * 3) % 29),
      time: clockAt(i * 11 + (step % 9)),
      status: STATUS_ORDER[(step + i * 2) % STATUS_ORDER.length],
    };
  });
}
