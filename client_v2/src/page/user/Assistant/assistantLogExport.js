import { handleAccessExport } from '@/pages/AccessLogs/accessExport';
import { handleANPRExport } from '@/pages/ANPRLogs/anprExport';
import { handleAttendanceExport } from '@/pages/AttendanceLogs/attendanceExport';
import { handleCarExport } from '@/pages/CarLogs/carExport';
import { handleIncidentExport } from '@/pages/IncidentLogs/incidentExport';
import { downloadLogsExcel } from '@/pages/GuardLog/guardExport';
import { getGuardChannelGraph } from '@/pages/GuardLog/Api';
import { buildSegmentsFromIncidents } from '@/pages/VisibilityLog/timelineUtils';
import {
  ANIMAL_ENTRY_CONFIG,
  BLURRED_CAMERA_CONFIG,
  CONVEYOR_CONFIG,
  CRUSHER_CONFIG,
  CYLINDER_STACKING_CONFIG,
  EQUIPMENT_OIL_LEAKAGE_CONFIG,
  FIRE_SMOKE_CONFIG,
  LINE_CROSSING_CONFIG,
  MESSY_AREA_CONFIG,
  OIL_LEAKAGE_CONFIG,
  PERSON_FALL_SICK_CONFIG,
  STOCK_COUNTING_CONFIG,
  UNAUTHORIZED_ACCESS_CONFIG,
  UNAUTHORIZED_PARKING_CONFIG,
  VEHICLE_FUEL_OIL_LEAKAGE_CONFIG,
  VEHICLE_OBSTRUCTION_CONFIG,
  WASTE_DISPOSAL_CONFIG,
  WATER_SPILL_CONFIG,
  WORKING_AT_HEIGHT_CONFIG,
  WRONG_LOCATION_CONFIG,
} from '@/pages/IncidentLogs/configs';
import { handleSleepActivityExport } from '@/pages/SleepActivityLogs/sleepActivityExport';
import { handleTaggedExport } from '@/pages/TaggedUsers/taggedExport';
import { handleVehicleCheckInOutExport } from '@/pages/VehicleCheckInOutLogs/vehicleCheckInOutExport';

// These are the same exporters used by the corresponding log screens. Keep
// the assistant aware of capabilities, but keep file creation/filter logic in
// the page exporters so chatbot downloads cannot drift from manual downloads.
const incident = (config) => ({
  formats: ['xlsx', 'pdf'],
  run: (format, params) => handleIncidentExport(format, config, params),
});

const guardExport = {
  formats: ['xlsx'],
  run: async (_format, params) => {
    const selectedDate = params.startDate || params.endDate;
    const response = await getGuardChannelGraph(params.searchInput || '', 0, 10000, { date: selectedDate });
    const result = response?.data?.body?.data?.result || [];
    const channels = result.map((channel) => ({
      channelId: channel?.incidents?.[0]?.channel?.name || `Channel ${channel?._id || ''}`,
      segments: buildSegmentsFromIncidents(channel?.incidents || []),
    }));
    return downloadLogsExcel(channels, selectedDate);
  },
};

export const assistantLogExportRegistry = {
  attendance_logs: { formats: ['xlsx', 'pdf'], run: handleAttendanceExport },
  car_logs: { formats: ['xlsx', 'pdf'], run: handleCarExport },
  access_logs: { formats: ['xlsx', 'pdf'], run: handleAccessExport },
  anpr_logs: { formats: ['xlsx', 'pdf'], run: handleANPRExport },
  tagged_users_logs: { formats: ['xlsx', 'pdf'], run: handleTaggedExport },
  vehicle_checkin_checkout_logs: { formats: ['xlsx', 'pdf'], run: handleVehicleCheckInOutExport },
  sleep_activity_logs: { formats: ['xlsx', 'pdf'], run: handleSleepActivityExport },
  guard_logs: guardExport,
  conveyor_logs: incident(CONVEYOR_CONFIG),
  crusher_logs: incident(CRUSHER_CONFIG),
  cylinder_logs: incident(CYLINDER_STACKING_CONFIG),
  vehicle_obstruction_logs: incident(VEHICLE_OBSTRUCTION_CONFIG),
  line_crossing_logs: incident(LINE_CROSSING_CONFIG),
  water_spill_logs: incident(WATER_SPILL_CONFIG),
  unauthorized_access_logs: incident(UNAUTHORIZED_ACCESS_CONFIG),
  fire_smoke_logs: incident(FIRE_SMOKE_CONFIG),
  person_fall_sick_logs: incident(PERSON_FALL_SICK_CONFIG),
  unauthorized_parking_logs: incident(UNAUTHORIZED_PARKING_CONFIG),
  working_at_height_logs: incident(WORKING_AT_HEIGHT_CONFIG),
  oil_leakage_logs: incident(OIL_LEAKAGE_CONFIG),
  equipment_oil_leakage_logs: incident(EQUIPMENT_OIL_LEAKAGE_CONFIG),
  vehicle_fuel_oil_leakage_logs: incident(VEHICLE_FUEL_OIL_LEAKAGE_CONFIG),
  wrong_location_logs: incident(WRONG_LOCATION_CONFIG),
  waste_disposal_logs: incident(WASTE_DISPOSAL_CONFIG),
  animal_entry_logs: incident(ANIMAL_ENTRY_CONFIG),
  messy_area_logs: incident(MESSY_AREA_CONFIG),
  stock_counting_logs: incident(STOCK_COUNTING_CONFIG),
  blurred_camera_logs: incident(BLURRED_CAMERA_CONFIG),
};

const toArray = (value) => (Array.isArray(value) ? value : value ? String(value).split(',').map((item) => item.trim()).filter(Boolean) : []);

export function assistantExportParams(ui) {
  const range = ui?.dateRange?.resolved || ui?.dateRange || {};
  const filters = ui?.filters || {};
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    region: range.timezone || ui?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezone: range.timezone || ui?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    searchInput: filters.search || filters.searchInput || '',
    nvrIds: toArray(filters.nvrIds),
    channelIds: toArray(filters.channelIds || filters.cameraId),
    cameraId: toArray(filters.cameraId || filters.channelIds),
    selectedDepartments: toArray(filters.selectedDepartments || filters.departmentIds),
    departmentIds: toArray(filters.departmentIds || filters.selectedDepartments),
    employeeLocations: toArray(filters.employeeLocations),
    statusFilter: filters.statusFilter || filters.status || '',
    status: filters.status || filters.statusFilter || '',
    resolved: filters.resolved,
    reportStatus: filters.reportStatus,
    severity: filters.severity,
    vehicleNumber: filters.vehicleNumber || filters.search || '',
    tagStatus: filters.tagStatus,
    checkInOrCheckOutCamera: filters.checkInOrCheckOutCamera,
    custody: filters.custody,
    isSleeping: filters.isSleeping,
    sortField: filters.sortField,
    sortOrder: filters.sortOrder,
    fromTime: filters.fromTime,
    toTime: filters.toTime,
  };
}

export async function runAssistantLogExport(ui, format) {
  const exporter = assistantLogExportRegistry[ui?.resource];
  if (!exporter) throw new Error(`No chatbot exporter is registered for ${ui?.resource || 'this log type'}.`);
  const normalizedFormat = format === 'csv' || format === 'xlsx' ? 'excel' : format;
  if (!exporter.formats.includes(format) && !exporter.formats.includes(normalizedFormat)) {
    throw new Error(`${format.toUpperCase()} export is not available for ${ui.resource}.`);
  }
  return exporter.run(normalizedFormat, assistantExportParams(ui));
}

