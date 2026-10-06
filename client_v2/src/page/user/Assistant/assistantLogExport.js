import { handleAccessExport } from '@/pages/AccessLogs/accessExport';
import { handleANPRExport } from '@/pages/ANPRLogs/anprExport';
import { handleCarExport } from '@/pages/CarLogs/carExport';
import { handleIncidentExport } from '@/pages/IncidentLogs/incidentExport';
import { handleStockCountingExport } from '@/pages/IncidentLogs/stockCountingExport';
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
import { exportMeasurementRecords } from '@/pages/MeasurementLogs/export';
import { handleAssistantAttendanceExport } from './assistantAttendanceExport';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawReportHeader, reportSubtitle, reportTableOptions } from '@/pages/IncidentLogs/pdfReportTemplate';

// These are the same exporters used by the corresponding log screens. Keep
// the assistant aware of capabilities, but keep file creation/filter logic in
// the page exporters so chatbot downloads cannot drift from manual downloads.
const incident = (config) => ({
  formats: ['xlsx', 'pdf', 'pdf-grid'],
  run: (format, params) => config.useVehicleStyleExport
    ? (format === 'pdf-grid'
      ? genericExport(format, params.records || [], config.title)
      : handleStockCountingExport(format, config, params))
    : handleIncidentExport(format, config, params),
});

const exportFormats = () => ['xlsx', 'pdf', 'pdf-grid'];

const guardExport = {
  formats: ['xlsx', 'pdf', 'pdf-grid'],
  run: async (format, params) => {
    if (format === 'pdf' || format === 'pdf-grid') return genericExport(format, params.records || [], 'Guard Logs');
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

// The API/MCP response is the source of truth for resources that do not need
// a page-specific formatter. This keeps new log types exportable immediately
// while the richer screen exporters continue to handle their own layouts.
function scalar(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(scalar).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function genericRows(records) {
  return (Array.isArray(records) ? records : []).map((record) => {
    const source = record && typeof record === 'object' ? record : { value: record };
    return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, scalar(value)]));
  });
}

async function genericExport(format, records, title) {
  const rows = genericRows(records);
  if (!rows.length) throw new Error('No data to export');
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 30);
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (format === 'csv') {
    const escapeCsv = (value) => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [
      keys.map(escapeCsv).join(','),
      ...rows.map((row) => keys.map((key) => escapeCsv(row[key])).join(',')),
    ];
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${safeTitle}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
  }
  if (format === 'xlsx') {
    const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? '']))));
    worksheet['!cols'] = keys.map((key) => ({ wch: Math.min(40, Math.max(12, key.length + 2)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31));
    XLSX.writeFile(workbook, `${safeTitle}.xlsx`);
    return true;
  }
  const doc = new jsPDF('landscape');
  await drawReportHeader(doc, {
    title,
    subtitle: reportSubtitle({ total: rows.length, allVehicles: 'All vehicles' }),
  });
  const columns = keys.slice(0, 12);
  if (format === 'pdf-grid') {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const gap = 5;
    const count = 3;
    const cardWidth = (pageWidth - margin * 2 - gap * (count - 1)) / count;
    const cardHeight = 58;
    const imageKeys = ['Image', 'image', 'imageUrl', 'incidentImageUrl', 'snapshotUrl', 'photoUrl'];
    let x = margin;
    let y = 44;
    let col = 0;
    for (let index = 0; index < rows.length; index += 1) {
      if (y + cardHeight > pageHeight - 10) {
        doc.addPage();
        await drawReportHeader(doc, { title, subtitle: reportSubtitle({ total: rows.length, allVehicles: 'All vehicles' }) });
        x = margin;
        y = 44;
        col = 0;
      }
      const row = rows[index];
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(218, 225, 236);
      doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
      doc.setFillColor(241, 244, 249);
      doc.roundedRect(x + 1, y + 1, cardWidth - 2, 14, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(71, 105, 178);
      doc.text(`#${index + 1}`, x + 4, y + 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(54, 70, 99);
      const visible = columns.filter((key) => !imageKeys.includes(key)).slice(0, 6);
      visible.forEach((key, detailIndex) => {
        const lineY = y + 22 + detailIndex * 5.2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.4);
        doc.setTextColor(90, 100, 120);
        doc.text(String(key).replace(/([A-Z])/g, ' $1').toUpperCase().slice(0, 22), x + 4, lineY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(35, 49, 78);
        const value = String(row[key] ?? '--');
        doc.text(doc.splitTextToSize(value, cardWidth - 38).slice(0, 1)[0] || '--', x + cardWidth - 4, lineY, { align: 'right' });
      });
      const imageUrl = imageKeys.map((key) => row[key]).find((value) => /^https?:\/\//i.test(String(value || '')));
      if (imageUrl) {
        doc.setTextColor(37, 99, 235);
        doc.setFontSize(6);
        doc.text('View Image', x + 4, y + cardHeight - 5);
        doc.link(x + 3, y + cardHeight - 10, 25, 7, { url: imageUrl });
      }
      col += 1;
      if (col === count) { col = 0; x = margin; y += cardHeight + gap; } else x += cardWidth + gap;
    }
    doc.save(`${safeTitle}_grid.pdf`);
    return true;
  }
  autoTable(doc, {
    ...reportTableOptions,
    head: [columns],
    body: rows.map((row) => columns.map((key) => row[key] ?? '')),
  });
  doc.save(`${safeTitle}.pdf`);
  return true;
}

export const assistantLogExportRegistry = {
  attendance_logs: { formats: exportFormats(), run: (format, params) => format === 'pdf-grid' ? genericExport(format, params.records || [], 'Attendance Logs') : handleAssistantAttendanceExport(format, params) },
  car_logs: { formats: exportFormats(), run: handleCarExport },
  access_logs: { formats: exportFormats(), run: (format, params) => format === 'pdf-grid' ? genericExport(format, params.records || [], 'Access Logs') : handleAccessExport(format, params) },
  anpr_logs: { formats: exportFormats(), run: handleANPRExport },
  tagged_users_logs: { formats: exportFormats(), run: (format, params) => format === 'pdf-grid' ? genericExport(format, params.records || [], 'Tagged Users Logs') : handleTaggedExport(format, params) },
  vehicle_checkin_checkout_logs: { formats: exportFormats(), run: (format, params) => format === 'pdf-grid' ? genericExport(format, params.records || [], 'Vehicle Check-In / Check-Out Logs') : handleVehicleCheckInOutExport(format, params) },
  sleep_activity_logs: { formats: exportFormats(), run: handleSleepActivityExport },
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
  const exporter = assistantLogExportRegistry[ui?.resource] ?? {
    formats: ['xlsx', 'pdf', 'pdf-grid'],
    run: (requestedFormat, params) => genericExport(requestedFormat, ui?.records, ui?.resource || 'logs'),
  };
  if (ui?.resource === 'measurement_logs') {
    if (format === 'xlsx' || format === 'pdf' || format === 'csv') return exportMeasurementRecords(format, ui?.records || []);
  }
  // CSV is generated from the authorized records returned by MCP. Incident
  // page exporters historically support only Excel/PDF, so this gives every
  // chatbot-supported log resource a real CSV download without a second API
  // request that could drift from the MCP result.
  if (format === 'csv') return genericExport('csv', ui?.records || [], ui?.resource || 'logs');
  const normalizedFormat = format === 'csv' || format === 'xlsx' ? 'excel' : format;
  if (!exporter.formats.includes(format) && !exporter.formats.includes(normalizedFormat)) {
    throw new Error(`${format.toUpperCase()} export is not available for ${ui.resource}.`);
  }
  return exporter.run(normalizedFormat, { ...assistantExportParams(ui), records: ui?.records || [] });
}

