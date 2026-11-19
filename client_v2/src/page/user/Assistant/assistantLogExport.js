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
  BOX_PACKING_CONFIG,
  CANS_STACK_CONFIG,
  CONVEYOR_CONFIG,
  CRUSHER_CONFIG,
  CYLINDER_STACKING_CONFIG,
  DOOR_DETECTION_CONFIG,
  EMOTION_CONFIG,
  EQUIPMENT_OIL_LEAKAGE_CONFIG,
  FIRE_SMOKE_CONFIG,
  LINE_CROSSING_CONFIG,
  LIGHTING_CONFIG,
  MESSY_AREA_CONFIG,
  MACHINE_OPS_CONFIG,
  OIL_LEAKAGE_CONFIG,
  PERSON_FALL_SICK_CONFIG,
  PERSON_POSTURE_CONFIG,
  PERSON_SITTING_ON_CAN_CONFIG,
  SACK_LOADING_CONFIG,
  STOCK_COUNTING_CONFIG,
  UNAUTHORIZED_ACCESS_CONFIG,
  UNAUTHORIZED_PARKING_CONFIG,
  VEHICLE_FUEL_OIL_LEAKAGE_CONFIG,
  VEHICLE_OBSTRUCTION_CONFIG,
  WASTE_DISPOSAL_CONFIG,
  WATER_SPILL_CONFIG,
  WORKING_AT_HEIGHT_CONFIG,
  WRONG_LOCATION_CONFIG,
  GENDER_AGE_CONFIG,
  HYGIENE_CONFIG,
  UNIFORM_CONFIG,
} from '@/pages/IncidentLogs/configs';
import { handleSleepActivityExport } from '@/pages/SleepActivityLogs/sleepActivityExport';
import { handleTaggedExport } from '@/pages/TaggedUsers/taggedExport';
import { handleVehicleCheckInOutExport } from '@/pages/VehicleCheckInOutLogs/vehicleCheckInOutExport';
import { exportMeasurementRecords } from '@/pages/MeasurementLogs/export';
import { handleAssistantAttendanceExport } from './assistantAttendanceExport';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment-timezone';
import { drawReportHeader, reportSubtitle, reportTableOptions } from '@/pages/IncidentLogs/pdfReportTemplate';
import { mediaUrl } from '@/lib/format';

// These are the same exporters used by the corresponding log screens. Keep
// the assistant aware of capabilities, but keep file creation/filter logic in
// the page exporters so chatbot downloads cannot drift from manual downloads.
const incident = (config) => ({
  formats: ['xlsx', 'pdf', 'pdf-grid', 'csv'],
  isIncident: true,
  run: (format, params) => config.useVehicleStyleExport
    ? (format === 'csv'
      ? handleIncidentExport('csv', config, params)
      : format === 'pdf-grid'
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

const crowdColumns = [
  ['sNo', 'S No'], ['date', 'Date'], ['time', 'Time'], ['incident', 'Incident'],
  ['camera', 'Camera'], ['nvr', 'NVR'], ['location', 'Location'], ['zone', 'Zone'],
  ['severity', 'Severity'], ['status', 'Status'], ['people', 'People'], ['image', 'Image'],
];

const display = (value, fallback = '--') => value == null || String(value).trim() === '' ? fallback : String(value);
const readable = (value) => {
  const text = value == null ? '' : String(value).trim();
  return text && !['--', '-', 'n/a', 'na', 'unknown', 'undefined', 'null'].includes(text.toLowerCase()) ? text : '';
};
const imageUrl = (value) => {
  return mediaUrl(value);
};

function crowdRows(records, timezone = 'Asia/Kolkata') {
  return (Array.isArray(records) ? records : []).map((record, index) => {
    const dateValue = record?.timeOfIncident || record?.createdAt || record?.updatedAt;
    const date = dateValue ? moment.utc(dateValue).tz(timezone) : null;
    const channel = { ...(record?.channel || {}), ...(record?.channelData || {}) };
    const nvr = { ...(record?.nvr || {}), ...(record?.nvrData || {}) };
    const resolved = record?.resolved === true || String(record?.currentStatus || '').toLowerCase() === 'resolved';
    const location = [
      nvr.locationName,
      nvr.location,
      nvr.siteName,
      channel.locationName,
      channel.location,
      channel.siteName,
      record?.locationName,
      record?.location,
      record?.siteName,
      record?.site?.locationName,
      record?.site?.name,
    ].map(readable).find(Boolean) || '--';
    return {
      sNo: index + 1,
      date: date?.isValid() ? date.format('DD MMM YYYY') : display(dateValue),
      time: date?.isValid() ? date.format('hh:mm:ss A') : '--',
      incident: display(record?.incidentName || record?.description, 'Crowd Detected'),
      camera: display(channel.name || channel.cameraName || channel.channelName || record?.cameraName || record?.channelName),
      nvr: display(nvr.nvrName || nvr.name || record?.nvrName),
      location,
      zone: display(record?.zoneName || record?.zone),
      severity: display(record?.severity ? String(record.severity).replace(/^moderate$/i, 'Medium') : '', '--'),
      status: resolved ? 'Resolved' : 'New',
      people: display(record?.crowdCount ?? record?.count ?? record?.peopleCount ?? record?.totalPeople, '0'),
      image: imageUrl(record?.Image || record?.incidentImageUrl || record?.imageUrl || record?.image),
    };
  });
}

function crowdExportTitle(ui) {
  return ui?.title || 'Crowd Detection Report';
}

function crowdRange(ui) {
  const range = ui?.dateRange?.resolved || ui?.dateRange || {};
  return {
    startDate: ui?.startDate || range.startDate || range.start,
    endDate: ui?.endDate || range.endDate || range.end,
    timezone: ui?.timezone || range.timezone || 'Asia/Kolkata',
  };
}

function saveCsv(rows, fileName) {
  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const imageLinkFormula = (url) => url
    ? `=HYPERLINK("${String(url).replace(/"/g, '""')}","View Image")`
    : '';
  const headers = crowdColumns.map(([, label]) => label);
  const lines = [headers.map(escape).join(','), ...rows.map((row) => crowdColumns.map(([key]) => escape(key === 'image' ? imageLinkFormula(row[key]) : row[key])).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function crowdDetectionExport(ui, format) {
  const sourceRecords = Array.isArray(ui?.records) && format === 'pdf' ? ui.records.slice(0, 3000) : ui?.records;
  const records = crowdRows(sourceRecords, crowdRange(ui).timezone);
  if (!records.length) throw new Error('No crowd detection records to export');
  const { startDate, endDate, timezone } = crowdRange(ui);
  const title = crowdExportTitle(ui);
  const totalRecords = Number(ui?.totalRecords ?? ui?.totalCount ?? ui?.recordsAnalyzed ?? records.length) || records.length;
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const headers = crowdColumns.map(([, label]) => label);

  if (format === 'csv') {
    saveCsv(records, `${safeTitle}.csv`);
    return true;
  }

  if (format === 'xlsx') {
    const rows = [
      [`VideoraIQ • ${title}`],
      ['Period', startDate && endDate ? `${moment(startDate).format('DD MMM YYYY')} – ${moment(endDate).format('DD MMM YYYY')}` : 'All dates'],
      ['Timezone', timezone],
      ['Records', totalRecords],
      ['Generated', moment().format('DD MMM YYYY hh:mm A')],
      [],
      headers,
      ...records.map((row) => crowdColumns.map(([key]) => key === 'image' ? (row[key] ? 'View Image' : '') : row[key])),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const headerRow = 6;
    sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
    sheet['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 };
    sheet['!autofilter'] = { ref: `A${headerRow + 1}:L${rows.length}` };
    sheet['!cols'] = [8, 15, 14, 20, 24, 18, 18, 14, 13, 13, 10, 24].map((wch) => ({ wch }));
    sheet['A1'].s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 16 }, fill: { fgColor: { rgb: '4F81BD' } }, alignment: { horizontal: 'left' } };
    for (let c = 0; c < headers.length; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
      if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F4E78' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    }
    records.forEach((row, index) => {
      if (!row.image) return;
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRow + 1 + index, c: 11 })];
      if (cell) {
        const target = String(row.image).replace(/"/g, '""');
        cell.v = 'View Image';
        cell.f = `HYPERLINK("${target}","View Image")`;
        cell.l = { Target: row.image, Tooltip: 'Open incident image' };
      }
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Crowd Detection');
    XLSX.writeFile(workbook, `${safeTitle}.xlsx`);
    return true;
  }

  const doc = new jsPDF('landscape');
  await drawReportHeader(doc, { title, subtitle: reportSubtitle({ startDate, endDate, allVehicles: timezone, total: totalRecords }) });
  if (startDate && endDate) {
    const period = `${moment(startDate).format('DD MMM YYYY')} - ${moment(endDate).format('DD MMM YYYY')}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(35, 49, 78);
    doc.text(period, 10, 47);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Timezone: ${timezone} | ${totalRecords.toLocaleString()} incidents`, 10, 52);
    if (records.length < totalRecords) {
      doc.setTextColor(80, 91, 112);
      doc.text(`PDF includes the first ${records.length.toLocaleString()} incidents; Excel and CSV include all records.`, 10, 57);
    }
    doc.setTextColor(0, 0, 0);
  }
  const tableRows = records.map((row) => crowdColumns.map(([key]) => key === 'image' ? '' : row[key]));
  autoTable(doc, {
    ...reportTableOptions,
    startY: startDate && endDate ? (records.length < totalRecords ? 63 : 58) : reportTableOptions.startY,
    head: [headers],
    body: tableRows,
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 22 }, 2: { cellWidth: 20 }, 3: { cellWidth: 30 }, 4: { cellWidth: 28 }, 5: { cellWidth: 18 }, 6: { cellWidth: 22 }, 7: { cellWidth: 16 }, 8: { cellWidth: 17 }, 9: { cellWidth: 17 }, 10: { cellWidth: 12 }, 11: { cellWidth: 28 } },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 11) {
        const url = records[data.row.index]?.image;
        if (url) {
          doc.setTextColor(0, 0, 255);
          doc.text('View Image', data.cell.x + 2, data.cell.y + data.cell.height / 2 + 2);
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
          doc.setTextColor(0, 0, 0);
        }
      }
    },
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
  door_detection_logs: incident(DOOR_DETECTION_CONFIG),
  person_posture_logs: incident(PERSON_POSTURE_CONFIG),
  person_sitting_on_can_logs: incident(PERSON_SITTING_ON_CAN_CONFIG),
  cans_stack_logs: incident(CANS_STACK_CONFIG),
  lighting_visibility_site_conditions_logs: incident(LIGHTING_CONFIG),
  hygiene_food_safety_logs: incident(HYGIENE_CONFIG),
  box_packing_logs: incident(BOX_PACKING_CONFIG),
  uniform_detection_logs: incident(UNIFORM_CONFIG),
  gender_age_logs: incident(GENDER_AGE_CONFIG),
  machine_operations_logs: incident(MACHINE_OPS_CONFIG),
  emotion_detection_logs: incident(EMOTION_CONFIG),
  sack_loading_unloading_logs: incident(SACK_LOADING_CONFIG),
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
    gender: filters.gender,
    zone: filters.zone,
    emotions: toArray(filters.emotions),
    hygieneCategory: toArray(filters.hygieneCategory),
    lightingCategory: toArray(filters.lightingCategory),
    posture: filters.posture,
    observedLayers: filters.observedLayers,
    peopleCount: filters.peopleCount,
    boxType: filters.boxType,
    doorStatus: filters.doorStatus,
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

export async function runAssistantLogExport(ui, format, { onProgress } = {}) {
  onProgress?.({ phase: 'generating', progress: null });
  if (ui?.resource === 'crowd_detection_logs' || /crowd[ _-]*detection/i.test(`${ui?.resource || ''} ${ui?.title || ''}`)) {
    const result = await crowdDetectionExport(ui, format);
    onProgress?.({ phase: 'complete', progress: 1 });
    return result;
  }
  const exporter = assistantLogExportRegistry[ui?.resource] ?? {
    formats: ['xlsx', 'pdf', 'pdf-grid'],
    run: (requestedFormat, params) => genericExport(requestedFormat, ui?.records, ui?.resource || 'logs'),
  };
  if (ui?.resource === 'measurement_logs') {
    if (format === 'xlsx' || format === 'pdf' || format === 'csv') {
      const result = await exportMeasurementRecords(format, ui?.records || []);
      onProgress?.({ phase: 'complete', progress: 1 });
      return result;
    }
  }
  // Non-incident resources use their returned records directly. Incident log
  // resources use the same config-specific normalizer as their log pages so
  // gender, fire, crowd, and other reports do not share raw headers or names.
  if (format === 'csv' && !exporter.isIncident) return genericExport('csv', ui?.records || [], ui?.resource || 'logs');
  const normalizedFormat = format === 'xlsx' ? 'excel' : format;
  if (!exporter.formats.includes(format) && !exporter.formats.includes(normalizedFormat)) {
    throw new Error(`${format.toUpperCase()} export is not available for ${ui.resource}.`);
  }
  const result = await exporter.run(normalizedFormat, { ...assistantExportParams(ui), records: ui?.records || [], reportCacheKey: ui?.reportCacheKey });
  onProgress?.({ phase: 'complete', progress: 1 });
  return result;
}

