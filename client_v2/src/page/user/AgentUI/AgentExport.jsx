import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { assistantExportParams, runAssistantLogExport } from '@/page/user/Assistant/assistantLogExport';
import { fetchIncidents } from '@/helpers/incidents';
import { getSleepActivityLogs } from '@/pages/SleepActivityLogs/Api';
import { mediaUrl } from '@/lib/format';
import moment from 'moment-timezone';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawSplitReportHeader } from './splitReportHeader.js';
import { exportAgentCrowdPdf } from './agentCrowdPdf.js';
import { saveBlob, yieldToBrowser } from './downloadUtils.js';

const formatsFor = (item) => {
  const formats = Array.isArray(item?.formats) ? item.formats : [item?.format];
  return formats.map((format) => format === 'excel' ? 'xlsx' : format).filter((format) => ['csv', 'pdf', 'xlsx'].includes(format));
};

const reportDate = (value) => String(value || '').slice(0, 10);

const SLEEP_REPORT_COLORS = {
  blue: '7092EA',
  purple: '9C68E0',
  navy: '293579',
  ink: [32, 38, 68],
};

async function exportAgentLog(ui, format, options) {
  if (ui.resource === 'crowd_detection_logs' && format === 'pdf') {
    if (!ui.records?.length) {
      const range = ui.dateRange?.resolved || ui.dateRange || {};
      return downloadAgentReport({ ...range, ...ui }, format, options);
    }
    const result = exportAgentCrowdPdf(ui);
    options?.onProgress?.({ phase: 'complete', progress: 1 });
    return result;
  }
  if (ui.resource !== 'sleep_activity_logs' || !['csv', 'xlsx', 'pdf'].includes(format)) {
    return runAssistantLogExport(ui, format, options);
  }
  const params = assistantExportParams(ui);
  const response = await getSleepActivityLogs({ ...params, skip: 0, limit: 10000 });
  const rows = response?.data?.body?.data?.data || [];
  if (!rows.length) throw new Error('No matching sleep activity records were found.');

  const headers = ['S No', 'Date', 'Time', 'Status', 'Camera', 'NVR', 'Zone', 'Severity', 'Alert Status', 'Image'];
  const title = 'Sleep Detection Report';
  const period = [params.startDate, params.endDate].filter(Boolean).map((date) => moment(reportDate(date), 'YYYY-MM-DD').format('DD MMM YYYY')).join(' – ');
  const records = rows.map((row, index) => {
    const time = moment.utc(row.timeOfIncident || row.createdAt || null).tz(params.timezone);
    const image = mediaUrl(row.Image || row.image || row.imageUrl);
    return {
      image: /^https?:\/\/[^\s"\u0000-\u001f]+$/i.test(image) ? image : '',
      cells: [
        index + 1,
        time.isValid() ? time.format('DD MMM YYYY') : '',
        time.isValid() ? time.format('hh:mm:ss A') : '',
        row.isSleeping === true ? 'Sleeping' : 'Awake',
        row.channelData?.customName || row.channelData?.name || '',
        row.nvrData?.nvrName || '',
        row.zoneName || row.zone || '',
        row.severity || '',
        row.resolved === true ? 'Resolved' : row.report?.status === true ? 'Reported' : row.currentStatus || (row.resolved === false ? 'New' : ''),
      ],
    };
  });
  const table = records.map(({ cells, image }) => [...cells, image ? 'View Image' : '']);
  const summary = `${params.timezone} | ${records.length} records`;
  if (format === 'xlsx') {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['VideoraIQ', '', '', '', '', '', '', '', title, ''],
      ['Smart Surveillance Powered by AI', '', '', '', '', '', '', '', 'Detection Report', ''],
      [period, summary],
      headers,
      ...table,
    ]);
    sheet['!merges'] = [
      XLSX.utils.decode_range('A1:H1'),
      XLSX.utils.decode_range('I1:J1'),
      XLSX.utils.decode_range('A2:H2'),
      XLSX.utils.decode_range('I2:J2'),
    ];
    sheet['!rows'] = [{ hpt: 24 }, { hpt: 16 }, { hpt: 18 }, { hpt: 22 }];
    sheet['!cols'] = [8, 16, 15, 13, 28, 22, 30, 14, 16, 16].map((wch) => ({ wch }));
    sheet['!autofilter'] = { ref: `A4:J${records.length + 4}` };
    for (let col = 0; col < 8; col += 1) {
      sheet[XLSX.utils.encode_cell({ r: 0, c: col })].s = {
        fill: { fgColor: { rgb: SLEEP_REPORT_COLORS.blue } },
        font: { name: 'Arial', bold: true, color: { rgb: 'FFFFFF' }, sz: 16 },
        alignment: { horizontal: 'left', vertical: 'center' },
      };
      sheet[XLSX.utils.encode_cell({ r: 1, c: col })].s = {
        fill: { fgColor: { rgb: SLEEP_REPORT_COLORS.blue } },
        font: { name: 'Arial', color: { rgb: 'EAF0FF' }, sz: 8 },
        alignment: { horizontal: 'left', vertical: 'center' },
      };
    }
    for (let col = 8; col < 10; col += 1) {
      sheet[XLSX.utils.encode_cell({ r: 0, c: col })].s = {
        fill: { fgColor: { rgb: SLEEP_REPORT_COLORS.purple } },
        font: { name: 'Arial', bold: true, color: { rgb: 'FFFFFF' }, sz: 14 },
        alignment: { horizontal: 'right', vertical: 'center' },
      };
      sheet[XLSX.utils.encode_cell({ r: 1, c: col })].s = {
        fill: { fgColor: { rgb: SLEEP_REPORT_COLORS.purple } },
        font: { name: 'Arial', color: { rgb: 'F7F0FF' }, sz: 8 },
        alignment: { horizontal: 'right', vertical: 'center' },
      };
    }
    [0, 1].forEach((col) => {
      sheet[XLSX.utils.encode_cell({ r: 2, c: col })].s = {
        font: { name: 'Arial', bold: col === 0, color: { rgb: '202644' }, sz: col === 0 ? 11 : 8 },
        alignment: { vertical: 'center' },
      };
    });
    headers.forEach((_, col) => {
      sheet[XLSX.utils.encode_cell({ r: 3, c: col })].s = {
        fill: { fgColor: { rgb: SLEEP_REPORT_COLORS.navy } },
        font: { name: 'Arial', bold: true, color: { rgb: 'FFFFFF' }, sz: 8 },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      };
    });
    records.forEach(({ image }, index) => {
      if (!image) return;
      const cell = sheet[`J${index + 5}`];
      cell.l = { Target: image };
      cell.s = { font: { name: 'Arial', underline: true, color: { rgb: '365FC7' }, sz: 8 } };
    });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sleep Detection');
    XLSX.writeFile(book, 'sleep_activity_logs.xlsx');
  } else if (format === 'pdf') {
    const doc = new jsPDF('landscape');
    autoTable(doc, {
      head: [headers], body: table, startY: 46, margin: { top: 46, left: 10, right: 10 },
      styles: {
        font: 'helvetica',
        fontSize: 7.3,
        fontStyle: 'normal',
        cellPadding: { top: 2.1, right: 2.5, bottom: 2.1, left: 2.5 },
        lineColor: [218, 225, 236],
        lineWidth: 0.1,
        textColor: SLEEP_REPORT_COLORS.ink,
        overflow: 'linebreak',
        valign: 'middle',
        minCellHeight: 7,
      },
      headStyles: {
        fillColor: [41, 53, 121],
        textColor: [255, 255, 255],
        font: 'helvetica',
        fontStyle: 'bold',
        fontSize: 7.1,
        cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
        minCellHeight: 8,
        halign: 'center',
      },
      alternateRowStyles: { fillColor: [239, 242, 252] },
      willDrawPage: () => {
        drawSplitReportHeader(doc, { title });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(period.replace('–', '-'), 10, 35);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(summary, 10, 41);
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 9) data.cell.styles.textColor = [54, 95, 199];
      },
      didDrawCell: (data) => {
        const image = records[data.row.index]?.image;
        if (data.section === 'body' && data.column.index === 9 && image) {
          const { x, y, width, height } = data.cell;
          doc.link(x, y, width, height, { url: image });
        }
      },
    });
    doc.save('sleep_activity_logs.pdf');
  } else {
    const quoteCsv = (text) => `"${text.replace(/"/g, '""')}"`;
    const escape = (value) => {
      const text = String(value ?? '');
      const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
      return quoteCsv(safe);
    };
    const lines = [
      headers.map(escape).join(','),
      ...records.map(({ cells, image }) => cells.map(escape)
        .concat(quoteCsv(image ? `=HYPERLINK("${image}","View Image")` : '')).join(',')),
    ];
    saveBlob(new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'sleep_activity_logs.csv');
  }
  options?.onProgress?.({ phase: 'complete', progress: 1 });
}

const AGENT_EXPORT_TYPES = [
  { resource: 'sleep_activity_logs', incidentType: 'guardSleeping', title: 'Sleep Activity Logs', pattern: /guard\s*sleep(?:ing)?|sleep[ _-]*(?:activity|detection|logs)/i },
  { resource: 'crowd_detection_logs', incidentType: 'crowdDetection', title: 'Crowd Detection Report', pattern: /crowd\s*detect/i },
  { resource: 'gender_age_logs', incidentType: 'genderAgeDetection', title: 'Gender & Age Logs', pattern: /gender\s*(?:and|&)\s*age|gender[_ -]?age/i },
  { resource: 'fire_smoke_logs', incidentType: 'fireSmokeDetection', title: 'Fire & Smoke Logs', pattern: /fire\s*(?:and|&)\s*smoke|fire[_ -]?smoke/i },
  { resource: 'person_posture_logs', incidentType: 'personPostureDetection', title: 'Person Posture Logs', pattern: /person\s*posture|posture\s*logs/i },
  { resource: 'emotion_detection_logs', incidentType: 'emotionDetection', title: 'Emotion Detection Logs', pattern: /emotion\s*detect/i },
  { resource: 'uniform_detection_logs', incidentType: 'uniformDetection', title: 'Uniform Detection Logs', pattern: /uniform\s*detect/i },
  { resource: 'machine_operations_logs', incidentType: 'machineOpsDetection', title: 'Machine Operations Logs', pattern: /machine\s*oper/i },
  { resource: 'box_packing_logs', incidentType: 'boxPackingDetection', title: 'Box Packing Logs', pattern: /box\s*packing/i },
  { resource: 'stock_counting_logs', incidentType: 'loadingUnloadingStockCountingDetection', title: 'Stock Counting Logs', pattern: /stock\s*count|loading\s*\/?\s*unloading/i },
  { resource: 'blurred_camera_logs', incidentType: 'blurredCameraDetection', title: 'Blurred Camera Logs', pattern: /blurred\s*camera/i },
  { resource: 'water_spill_logs', incidentType: 'waterSpillageDetection', title: 'Water Spillage Logs', pattern: /water\s*(?:spill|spillage)/i },
  { resource: 'conveyor_logs', incidentType: 'conveyorDetection', title: 'Conveyor Detection Logs', pattern: /conveyor\s*detect/i },
  { resource: 'crusher_logs', incidentType: 'crusherDetection', title: 'Crusher Detection Logs', pattern: /crusher\s*detect/i },
  { resource: 'cylinder_logs', incidentType: 'cylinderDetection', title: 'Cylinder Stacking Detection Logs', pattern: /cylinder\s*(?:stack|detect)/i },
  { resource: 'vehicle_obstruction_logs', incidentType: 'vehicleObstruction', title: 'Vehicle & Obstruction Detection Logs', pattern: /vehicle\s*(?:and\s*)?obstruction|vehicle\s*detect/i },
  { resource: 'line_crossing_logs', incidentType: 'lineCrossing', title: 'Line Crossing Logs', pattern: /line\s*cross/i },
  { resource: 'unauthorized_access_logs', incidentType: 'unauthorizedAccess', title: 'Unauthorized Access Logs', pattern: /unauthori[sz]ed\s*access/i },
  { resource: 'person_fall_sick_logs', incidentType: 'personFallSickDetection', title: 'Person Fall/Sick Detection Logs', pattern: /person\s*(?:fall|sick)/i },
  { resource: 'unauthorized_parking_logs', incidentType: 'unauthorizedParkingDetection', title: 'Unauthorized Parking Detection Logs', pattern: /unauthori[sz]ed\s*parking/i },
  { resource: 'working_at_height_logs', incidentType: 'workingAtHeightDetection', title: 'Working at Height Detection Logs', pattern: /working\s*at\s*height/i },
  { resource: 'oil_leakage_logs', incidentType: 'oilLeakageDetection', title: 'Oil Leakage Detection Logs', pattern: /oil\s*leakage/i },
  { resource: 'equipment_oil_leakage_logs', incidentType: 'equipmentOilLeakageDetection', title: 'Equipment Oil Leakage Detection Logs', pattern: /equipment\s*oil/i },
  { resource: 'vehicle_fuel_oil_leakage_logs', incidentType: 'vehicleFuelOilLeakageDetection', title: 'Vehicle Fuel/Oil Leakage Detection Logs', pattern: /vehicle\s*fuel|fuel\s*oil/i },
  { resource: 'wrong_location_logs', incidentType: 'gunnyBagsMaterialsWrongLocationDetection', title: 'Wrong Location Detection Logs', pattern: /wrong\s*location/i },
  { resource: 'waste_disposal_logs', incidentType: 'sandDustWasteScrapDisposalDetection', title: 'Waste Disposal Detection Logs', pattern: /waste\s*(?:disposal|scrap)|sand\s*dust/i },
  { resource: 'animal_entry_logs', incidentType: 'unauthorizedAnimalEntryDetection', title: 'Unauthorized Animal Entry Logs', pattern: /animal\s*entry/i },
  { resource: 'messy_area_logs', incidentType: 'spillsDirtyMessyAreasDetection', title: 'Messy Area Detection Logs', pattern: /messy\s*area|dirty\s*area/i },
  { resource: 'door_detection_logs', incidentType: 'doorDetection', title: 'Door Logs', pattern: /door\s*detect|door\s*logs/i },
  { resource: 'person_sitting_on_can_logs', incidentType: 'personSittingOnCan', title: 'Person Sitting On Can Logs', pattern: /person\s*sitting\s*on\s*can/i },
  { resource: 'cans_stack_logs', incidentType: 'cansStackDetection', title: 'Cans Stack Detection Logs', pattern: /cans?\s*stack/i },
  { resource: 'lighting_visibility_site_conditions_logs', incidentType: 'lightingVisibilitySiteConditionsDetection', title: 'Lighting / Visibility / Site Conditions Logs', pattern: /lighting|visibility|site\s*condition/i },
  { resource: 'hygiene_food_safety_logs', incidentType: 'hygieneSanitationFoodSafetyDetection', title: 'Hygiene & Food Safety Logs', pattern: /hygiene|sanitation|food\s*safety/i },
  { resource: 'sack_loading_unloading_logs', incidentType: 'sackLoadingUnloadingDetection', title: 'Sack Loading/Unloading Logs', pattern: /sack\s*(?:loading|unloading)/i },
];

export function resolveAgentExportMeta({ resource = '', title = '', text = '' } = {}) {
  const source = `${resource} ${title} ${text}`;
  return AGENT_EXPORT_TYPES.find((item) => item.resource === resource || item.pattern.test(source)) || null;
}

export async function downloadAgentReport({ startDate, endDate, timezone = 'Asia/Kolkata', title, resource, incidentType, filters = {}, reportCacheKey } = {}, format, { onProgress } = {}) {
  const reportProgress = (progress) => onProgress?.({ ...progress, elapsedMs: progress?.elapsedMs ?? 0 });
  const meta = resolveAgentExportMeta({ resource, title });
  const selected = meta || { resource: resource || 'crowd_detection_logs', incidentType: incidentType || 'crowdDetection', title: title || 'Crowd Detection Report' };
  reportProgress({ phase: 'preparing', progress: null });
  // Dedicated incident-log endpoints return the joined camera/NVR records
  // used by the reference exports. Do not substitute the generic incidents
  // feed here, because it omits those display fields.
  if (selected.resource !== 'crowd_detection_logs') {
    return exportAgentLog({
      resource: selected.resource,
      startDate,
      endDate,
      timezone,
      reportCacheKey,
      title: title || selected.title,
      dateRange: { startDate, endDate, timezone },
      filters: { ...(selected.resource === 'sleep_activity_logs' ? { isSleeping: true } : {}), ...filters, incidentTypeFilter: [incidentType || selected.incidentType] },
    }, format, { onProgress: reportProgress });
  }
  const rows = [];
  let totalRecords = 0;
  // Fetch a large export page so the backend does not repeat its expensive
  // total-count aggregation once for every 500-row batch.
  const pageSize = 10000;
  const filter = {
    incidentTypeFilter: [incidentType || selected.incidentType],
    statusFilter: ['new', 'resolved', 'reported'],
    ...filters,
    startDate: reportDate(startDate),
    endDate: reportDate(endDate),
  };
  for (let skip = 0; ; skip += pageSize) {
    const page = await fetchIncidents({ skip, limit: pageSize }, filter);
    rows.push(...(page.items || []));
    totalRecords = Number(page.totalCount || totalRecords || rows.length);
    reportProgress({ phase: 'preparing', unit: 'records', loaded: rows.length, total: totalRecords, progress: totalRecords ? rows.length / totalRecords : null });
    if (!page.items?.length || rows.length >= Number(page.totalCount || rows.length)) break;
  }
  const exportRows = format === 'pdf' ? rows.slice(0, 3000) : rows;
  if (!exportRows.length) throw new Error('No matching incidents were found.');
  return exportAgentLog({
    resource: selected.resource,
    records: exportRows,
    totalRecords,
    startDate,
    endDate,
    timezone,
    title: title || selected.title,
    dateRange: { startDate, endDate, timezone },
    filters: filter,
  }, format, { onProgress: reportProgress });
}

export default function AgentExport({ ui, exportText = '' }) {
  const isExport = Boolean(ui && ['export', 'multi_export'].includes(ui.type));
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const rawItems = ui?.type === 'multi_export' ? (ui.exports || []) : ui ? [ui] : [];
  const items = rawItems.map((item) => {
    const meta = resolveAgentExportMeta({ resource: item?.resource, title: item?.title, text: exportText });
    return meta ? { ...item, ...meta } : item;
  });

  const download = async (requestedFormat = null) => {
    if (busy || !items.length) return;
    const targets = items.flatMap((item) => formatsFor(item)
      .filter((format) => !requestedFormat || format === requestedFormat)
      .map((format) => ({ item, format })));
    if (!targets.length) return;
    setBusy(true);
    setStatus('Preparing download...');
    try {
      await yieldToBrowser();
      const results = [];
      for (let index = 0; index < targets.length; index += 1) {
        const { item, format } = targets[index];
        setStatus(`Preparing ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}...`);
        results.push(await exportAgentLog(item, format));
      }
      if (!results.length) throw new Error('No export format was returned.');
      setStatus('Downloaded successfully');
    } catch {
      setStatus('Download failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!isExport || !ui?.autoDownload || started.current) return;
    started.current = true;
    download();
  }, [isExport, ui]);

  if (!isExport || !items.length) return null;
  const formats = [...new Set(items.flatMap(formatsFor))];

  return <div className="agent-export-card" role="group" aria-label="Report downloads">
    <div className="agent-export-actions">
      {formats.map((format) => <button key={format} type="button" disabled={busy} onClick={() => download(format)} aria-busy={busy}>{busy ? <LoaderCircle className="agent-download-spinner" size={13} /> : <Download size={13} />}{busy ? 'Downloading...' : format === 'xlsx' ? 'Excel' : format.toUpperCase()}</button>)}
    </div>
    {status && <small role="status" aria-live="polite">{busy && <LoaderCircle className="agent-download-spinner" size={12} />}{status}</small>}
  </div>;
}
