// Stable color per detection settingType, so the same detection always reads
// as the same color across the app (icon tiles, pills, chips). Purely
// presentational — order matches DETECTION_TYPES' rough declaration order so
// common types (PPE, ANPR, Intrusion...) get visually distinct early colors.
const PALETTE = [
  { fg: '#6366f1', bg: 'rgba(99,102,241,.14)', bd: 'rgba(99,102,241,.4)' },  // indigo
  { fg: '#10b981', bg: 'rgba(16,185,129,.14)', bd: 'rgba(16,185,129,.4)' },  // emerald
  { fg: '#a855f7', bg: 'rgba(168,85,247,.14)', bd: 'rgba(168,85,247,.4)' },  // violet
  { fg: '#8b5cf6', bg: 'rgba(139,92,246,.14)', bd: 'rgba(139,92,246,.4)' },  // purple (distinct from violet above)
  { fg: '#f59e0b', bg: 'rgba(245,158,11,.14)', bd: 'rgba(245,158,11,.4)' },  // amber
  { fg: '#eab308', bg: 'rgba(234,179,8,.14)', bd: 'rgba(234,179,8,.4)' },    // yellow (distinct from amber above)
  { fg: '#ec4899', bg: 'rgba(236,72,153,.14)', bd: 'rgba(236,72,153,.4)' },  // pink
  { fg: '#3b82f6', bg: 'rgba(59,130,246,.14)', bd: 'rgba(59,130,246,.4)' },  // blue
  { fg: '#06b6d4', bg: 'rgba(6,182,212,.14)', bd: 'rgba(6,182,212,.4)' },    // cyan
  { fg: '#f43f5e', bg: 'rgba(244,63,94,.14)', bd: 'rgba(244,63,94,.4)' },    // rose
];

function hashIndex(key, mod) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function detectionColor(settingType) {
  return PALETTE[hashIndex(settingType, PALETTE.length)];
}

// Short pill label: "unauthorizedAccessSettings" -> "Unauthorized Access" is
// too long for a compact chip row, so common types get a terser alias;
// anything unlisted falls back to the full humanized name.
const SHORT_LABELS = {
  personalProtectiveEquipmentSettings: 'PPE',
  vehicleDetectionSettings: 'ANPR',
  unauthorizedAccessSettings: 'Intrusion',
  crowdDetectionSettings: 'Crowd',
  lineCrossingSettings: 'Line Crossing',
  countVehiclesSettings: 'Vehicle Count',
  conveyorDetectionSettings: 'Conveyor',
  crusherDetectionSettings: 'Crusher',
  waterSpillageDetectionSettings: 'Water Spillage',
  doorDetectionSettings: 'Door',
  lightDetectionSettings: 'Light',
  vehicleObstructionSettings: 'Obstruction',
  deskAbsenceSettings: 'Desk Absence',
  guardAbsenceSettings: 'Guard Absence',
  countPersonsSettings: 'Count Persons',
  vehicleTypeDetectionSettings: 'Vehicle Type',
  loiteringDetectionSettings: 'Loitering',
  tableOccupancyDetectionSettings: 'Table Occupancy',
  foodServicePPEDetectionSettings: 'Food PPE',
  mobilePhoneDetectionSettings: 'Mobile Phone',
};

export function humanize(settingType) {
  return settingType
    .replace(/Settings$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

export function detectionShortLabel(settingType) {
  return SHORT_LABELS[settingType] || humanize(settingType);
}
