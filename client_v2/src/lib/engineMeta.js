import { detectionLabel } from './format';

/** Stable color per engine index, shared by any widget that lists engines/detection types. */
export const ENGINE_PALETTE = ['var(--blue)', 'var(--violet)', 'var(--magenta)', 'var(--cyan)', 'var(--ok)', 'var(--warn)', 'var(--crit)', '#f472b6', '#60a5fa'];

const ENGINE_META = {
  facerecognition: { short: 'FACE', name: 'Face Recognition' },
  facedetection: { short: 'FACE', name: 'Face Recognition' },
  intrusiondetection: { short: 'INTR', name: 'Intrusion Detection' },
  intrusion: { short: 'INTR', name: 'Intrusion Detection' },
  firedetection: { short: 'FIRE', name: 'Fire & Smoke' },
  firesmoke: { short: 'FIRE', name: 'Fire & Smoke' },
  objectdetection: { short: 'OBJ', name: 'Object Detection' },
  object: { short: 'OBJ', name: 'Object Detection' },
  anpr: { short: 'ANPR', name: 'Number Plate (ANPR)' },
  numberplate: { short: 'ANPR', name: 'Number Plate (ANPR)' },
  linecrossing: { short: 'LINE', name: 'Line-Cross' },
  linecross: { short: 'LINE', name: 'Line-Cross' },
  unauthorizedaccess: { short: 'ACCS', name: 'Unauthorized Access' },
  accessviolation: { short: 'ACCS', name: 'Unauthorized Access' },
  unattendedbaggage: { short: 'BAG', name: 'Unattended Baggage' },
  baggage: { short: 'BAG', name: 'Unattended Baggage' },
  cashierabsence: { short: 'CASH', name: 'Cashier Absence' },
  deskabsence: { short: 'CASH', name: 'Cashier Absence' },
  absence: { short: 'CASH', name: 'Cashier Absence' },
  waterspillagedetection: { short: 'WATER', name: 'Water Spillage' },
  water: { short: 'WATER', name: 'Water Spillage' },
  vehicledetection: { short: 'VEH', name: 'Vehicle Detection' },
  vehicle: { short: 'VEH', name: 'Vehicle Detection' },
  persondetection: { short: 'PERSON', name: 'Person Detection' },
  person: { short: 'PERSON', name: 'Person Detection' },
};

/** Human-readable short/name for a raw incidentType/detection-type string. */
export function engineMeta(type) {
  const key = String(type || '').toLowerCase().replace(/[^a-z]/g, '');
  return ENGINE_META[key] || { short: key.slice(0, 4).toUpperCase() || 'DET', name: detectionLabel(type) };
}
