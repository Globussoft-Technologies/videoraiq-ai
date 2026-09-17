/**
 * Config for each stevinrock incident-log page. All pages share the same
 * IncidentLogsPage component; only these values differ.
 *
 * Fields:
 *  - endpoint       API path under VITE_BACKEND
 *  - title          header + PDF/toast title
 *  - fileName       export file base name
 *  - sheetName      Excel sheet name
 *  - storagePrefix  localStorage key prefix for auto-refresh persistence
 *  - permissionKey  logs.<key>.view gate (falls back to logs.global.view)
 *  - accessDenied   message shown when the user lacks the permission
 *  - showStatus     render a Current Status column/badge
 *  - formatStatus   map ON/OFF → Loaded/Not-Loaded (conveyor only)
 *  - sortable       enable table header sorting (line-crossing = false)
 */

export const CONVEYOR_CONFIG = {
  endpoint: '/incidents/logs/conveyor-detection',
  title: 'Conveyor Detection Logs',
  fileName: 'conveyor_logs',
  sheetName: 'Conveyor Logs',
  storagePrefix: 'conveyor',
  permissionKey: 'conveyorLogs',
  accessDenied: "You don't have permission to view Conveyor Logs.",
  showStatus: true,
  formatStatus: true,
  sortable: true,
  datePickerVariant: 'preset',
};

export const CRUSHER_CONFIG = {
  endpoint: '/incidents/logs/crusher-detection',
  title: 'Crusher Detection Logs',
  fileName: 'crusher_logs',
  sheetName: 'Crusher Logs',
  storagePrefix: 'crusher',
  permissionKey: 'crusherLogs',
  accessDenied: "You don't have permission to view Crusher Logs.",
  showStatus: true,
  formatStatus: false,
  sortable: true,
  datePickerVariant: 'preset',
};

export const CYLINDER_STACKING_CONFIG = {
  endpoint: '/incidents/logs/cylinder-detection',
  method: 'post',
  title: 'Cylinder Stacking Detection Logs',
  fileName: 'cylinder_stacking_logs',
  sheetName: 'Cylinder Stacking Logs',
  storagePrefix: 'cylinder_stacking',
  permissionKey: 'cylinderLogs',
  accessDenied: "You don't have permission to view Cylinder Stacking Logs.",
  showStats: false,
  showIncidentName: false,
  showStatus: false,
  showSeverity: false,
  showSeverityFilter: false,
  formatStatus: false,
  sortable: true,
  datePickerVariant: 'preset',
};

export const VEHICLE_OBSTRUCTION_CONFIG = {
  endpoint: '/incidents/logs/vehicle-detection',
  title: 'Vehicle & Obstruction Detection Logs',
  fileName: 'vehicle_obstruction_logs',
  sheetName: 'Vehicle Obstruction Logs',
  storagePrefix: 'vehicle_obstruction',
  permissionKey: 'vehicleObstructionLogs',
  accessDenied: "You don't have permission to view Vehicle Obstruction Logs.",
  showStatus: false,
  sortable: true,
  datePickerVariant: 'preset',
};

export const LINE_CROSSING_CONFIG = {
  endpoint: '/incidents/logs/line-crossing',
  title: 'Line Crossing Logs',
  fileName: 'line_crossing_logs',
  sheetName: 'Line Crossing Logs',
  storagePrefix: 'line_crossing',
  permissionKey: 'lineCrossingLogs',
  accessDenied: "You don't have permission to view Line Crossing Logs.",
  showStatus: false,
  sortable: false,
};

export const WATER_SPILL_CONFIG = {
  endpoint: '/incidents/logs/water-spillage-detection',
  title: 'Water Spillage Detection Logs',
  fileName: 'water_spillage_logs',
  sheetName: 'Water Spillage Logs',
  storagePrefix: 'water_spillage',
  permissionKey: 'waterSpillLogs',
  accessDenied: "You don't have permission to view Water Spillage Logs.",
  showStatus: false,
  sortable: true,
  datePickerVariant: 'preset',
};

export const UNAUTHORIZED_ACCESS_CONFIG = {
  endpoint: '/incidents/logs/unauthorized-access',
  title: 'Unauthorized Access Logs',
  fileName: 'unauthorized_access_logs',
  sheetName: 'Unauthorized Access Logs',
  storagePrefix: 'unauthorized_access',
  permissionKey: 'unauthorizedAccessLogs',
  accessDenied: "You don't have permission to view Unauthorized Access Logs.",
  showStatus: false,
  sortable: true,
  gridVariant: 'details',
  datePickerVariant: 'preset',
};

export const FIRE_SMOKE_CONFIG = {
  endpoint: '/incidents/logs/fire-smoke-detection',
  title: 'Fire & Smoke Detection Logs',
  fileName: 'fire_smoke_logs',
  sheetName: 'Fire & Smoke Logs',
  storagePrefix: 'fire_smoke',
  permissionKey: 'fireSmokeLogs',
  accessDenied: "You don't have permission to view Fire & Smoke Logs.",
  showIncidentName: false,
  showStatus: false,
  sortable: true,
  showFireSmokeFields: true,
  gridVariant: 'details',
  datePickerVariant: 'preset',
};

export const PERSON_FALL_SICK_CONFIG = {
  endpoint: '/incidents/logs/person-fall-sick-detection',
  title: 'Person Fall/Sick Detection Logs',
  fileName: 'person_fall_sick_logs',
  sheetName: 'Person Fall/Sick Logs',
  storagePrefix: 'person_fall_sick',
  permissionKey: 'personFallSickLogs',
  accessDenied: "You don't have permission to view Person Fall/Sick Logs.",
  showStatus: false,
  sortable: true,
  showPersonFallSickFields: true,
  datePickerVariant: 'preset',
};
