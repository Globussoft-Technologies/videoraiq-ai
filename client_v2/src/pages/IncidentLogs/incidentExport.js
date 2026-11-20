import { lightingCategoryLabel } from '@/helpers/lightingDetection';
import { MACHINE_OPS_LOG_FIELDS } from '../../helpers/machineOpsDetection?v=machine-ops-logs-2';
import { hygieneCategoryLabel } from '@/helpers/hygieneDetection';
import moment from 'moment-timezone';
import { getConfiguredTimezone } from '@/utils/timezone';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { fetchDoorStatusLogs, fetchIncidentLogs, getDetectionChannels, getNVRs, getchannels } from './Api';
import { formatDoorDuration, formatStatus } from './incidentColumns';
import { doorDurationLabel, doorStatusLabel, isDoorResolved } from './doorIncident';
import { boxSplitLabel } from './stockMovement';
import { BOX_PACKING_FIELDS, packingExportValues } from './boxPacking';
import { drawReportHeader, reportSubtitle, reportTableOptions } from './pdfReportTemplate';
import { mediaUrl } from '@/lib/format';
import { fetchIncidents } from '@/helpers/incidents';

const exportSeverityLabel = (severity) => (
  String(severity || '--').toLowerCase() === 'moderate' ? 'Medium' : severity || '--'
);

const exportSeverityColor = (severity) => {
  switch (String(severity || '').toLowerCase()) {
    case 'low': return [34, 197, 94];
    case 'moderate':
    case 'medium': return [245, 158, 11];
    case 'high':
    case 'critical': return [255, 77, 77];
    default: return [75, 85, 99];
  }
};

// API references are serialized IDs or populated documents with an _id.
const idKey = (value) => {
  const id = value?._id ?? value;
  return typeof id === 'string' ? id.trim().toLowerCase() : '';
};

const responseList = (response, keys = []) => {
  const body = response?.data?.body?.data;
  const nested = body?.data;
  const candidates = [
    body,
    nested,
    nested?.data,
    nested?.channels,
    nested?.cameras,
    nested?.result,
    nested?.items,
    body?.result,
    body?.items,
    ...keys.map((key) => body?.[key]),
    response?.data?.data,
  ];
  return candidates.find(Array.isArray) || [];
};

const flattenChannels = (items) => items.flatMap((item) => {
  if (!Array.isArray(item?.channels)) return [item];
  return item.channels.map((channel) => ({
    ...channel,
    nvrId: channel?.nvrId || item?.nvrId || item?._id,
    nvrName: channel?.nvrName || item?.nvrName || item?.name,
  }));
});

// Incident foreign keys reference the catalog documents' MongoDB _id.
const nvrIdOf = (row) => idKey(row?.nvrId);
const channelIdOf = (row) => idKey(row?.channelId);

const usableDeviceName = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && !['--', '-', 'n/a', 'na', 'unknown', 'undefined', 'null'].includes(text.toLowerCase()) ? text : '';
};

const nvrNameOf = (row) => [
  row?.nvrData?.nvrName, row?.nvrId?.nvrName, row?.nvrName,
].map(usableDeviceName).find(Boolean) || '';

const channelNameOf = (row) => [
  row?.channelData?.customName, row?.channelData?.name,
  row?.channelId?.customName, row?.channelId?.name, row?.channelName, row?.cameraName,
].map(usableDeviceName).find(Boolean) || '';

const enrichDeviceNames = async (rows) => {
  const needsNvr = rows.some((row) => nvrIdOf(row) && !nvrNameOf(row));
  const needsCamera = rows.some((row) => channelIdOf(row) && !channelNameOf(row));
  if (!needsNvr && !needsCamera) return rows;
  const nvrIds = [...new Set(rows.map(nvrIdOf).filter(Boolean))];
  const [nvrResponse, initialChannelResponse] = await Promise.all([
    needsNvr ? getNVRs().catch(() => null) : null,
    needsCamera ? getchannels(nvrIds.length ? { nvrIds } : {}).catch(() => null) : null,
  ]);
  let channels = flattenChannels(responseList(initialChannelResponse, ['channels', 'cameras']));
  if (needsCamera && !channels.length) {
    const fallback = await getDetectionChannels({ limit: 10000 }).catch(() => null);
    channels = flattenChannels(responseList(fallback, ['channels', 'cameras']));
  }

  const nvrNames = new Map();
  for (const channel of channels) {
    const id = idKey(channel.nvrId);
    const name = usableDeviceName(channel.nvrName);
    if (id && name) nvrNames.set(id, name);
  }
  for (const nvr of responseList(nvrResponse, ['nvrs', 'nvrList'])) {
    const id = idKey(nvr._id);
    const name = usableDeviceName(nvr.nvrName);
    if (id && name) nvrNames.set(id, name);
  }
  const channelNames = new Map();
  for (const channel of channels) {
    const id = idKey(channel._id);
    const name = usableDeviceName(channel.customName) || usableDeviceName(channel.name);
    if (id && name) channelNames.set(id, name);
  }
  return rows.map((row) => ({
    ...row,
    nvrName: nvrNameOf(row) || nvrNames.get(nvrIdOf(row)),
    channelName: channelNameOf(row) || channelNames.get(channelIdOf(row)),
  }));
};

const resolveIncidentImageUrl = (value) => {
  return mediaUrl(value);
};

/**
 * Fetch the full (unpaginated) result set for export using the current filters,
 * mapped to the export row shape. Mirrors the V1 EmployeeLogs export.
 */
const loadExportRows = async (config, params) => {
  const { startDate, endDate, sortField, sortOrder, nvrIds, channelIds, severity, status, doorStatus, searchInput, vehicleNumber, zone, posture, observedLayers, peopleCount, boxType, gender } = params;

  const query = {
    endpoint: config.endpoint,
    method: config.method,
    skip: 0,
    limit: 10000,
    startDate,
    endDate,
    sortField,
    sortOrder,
    nvrIds,
    channelIds,
    severity,
    status,
    doorStatus: config.showDoorFields ? doorStatus : undefined,
    search: searchInput,
    vehicleNumber,
    hygieneCategory: params.hygieneCategory,
    lightingCategory: params.lightingCategory,
    emotions: params.emotions,
    gender: params.gender,
    zone,
    posture,
    observedLayers,
    peopleCount,
    boxType,
  };

  // Gender logs are also present in the main incident feed, whose aggregation
  // always joins NVR and channel documents. Prefer that shape for this report;
  // older deployments of the gender-specific endpoint can return only the raw
  // ids, which is why the previous export showed `--` for both device fields.
  let list = [];
  if (config.showGenderAgeFields) {
    try {
      const generic = await fetchIncidents(
        { skip: 0, limit: 10000 },
        {
          incidentTypeFilter: ['genderAgeDetection'],
          statusFilter: ['new', 'resolved', 'reported'],
          startDate,
          endDate,
          ...(gender ? { gender } : {}),
          ...(zone ? { zone } : {}),
          ...(nvrIds?.length === 1 ? { nvrId: nvrIds[0] } : {}),
          ...(channelIds?.length === 1 ? { channelId: channelIds[0] } : {}),
        },
      );
      list = generic?.items || [];
      if (gender) list = list.filter((item) => String(item?.targetGender || '').toLowerCase() === String(gender).toLowerCase());
      if (zone) {
        const selectedZone = String(zone).trim().toLowerCase();
        list = list.filter((item) => String(item?.zone || item?.zoneName || '').trim().toLowerCase() === selectedZone || `zone ${Number(item?.zoneIdx) + 1}` === selectedZone);
      }
    } catch {
      list = [];
    }
  }
  if (!list.length) {
    list = config.showDoorFields && doorStatus
      ? await fetchDoorStatusLogs({ ...query, doorStatus })
      : (await fetchIncidentLogs(query))?.data?.body?.data?.data || [];
  }
  list = await enrichDeviceNames(list);
  const timezone = params.timezone || params.region || getConfiguredTimezone();
  return list.map((item) => {
    const incidentDateValue = item.timeOfIncident || item.createdAt;
    const incidentDate = incidentDateValue ? moment.utc(incidentDateValue).tz(timezone) : null;
    const targetGender = item.targetGender || item.gender || item.detectedGender || '--';
    const outcome = item.incidentName || item.eventName || (targetGender !== '--' ? `${targetGender} Detected` : '--');
    const zoneName = item.zone || item.zoneName || (item.zoneIdx != null ? `Zone ${Number(item.zoneIdx) + 1}` : '--');
    let evidenceScoreStr = '--';
    if (item.evidenceScore != null) {
      const n = Number(item.evidenceScore);
      evidenceScoreStr = Number.isNaN(n) ? String(item.evidenceScore) : n <= 1 ? `${Math.round(n * 100)}%` : `${Math.round(n)}%`;
    }
    return {
      ...(config.showBoxPackingFields ? packingExportValues(item) : {}),
      ...((config.showLightingFields || config.showHygieneFields) ? {
        zone: item.zoneName || item.zone || '--',
        selectedCategories: (item.selectedCategories || []).map(config.showLightingFields ? lightingCategoryLabel : hygieneCategoryLabel).join(', '),
        violationCount: item.violationCount ?? item.violations?.length ?? 0,
        violations: (item.violations || []).filter(Boolean).map(violation => [
          violation.categoryName || (config.showLightingFields ? lightingCategoryLabel : hygieneCategoryLabel)(violation.category),
          violation.description,
        ].filter(Boolean).join(' - ')).join('\n') || item.description || '--',
      } : {}),
      emotion: item.emotion || '--',
      ...(config.showGenderAgeFields ? { targetGender, zone: zoneName } : {}),
      ...(config.showMachineOpsFields ? { machineName: item.machineName || '--', machineState: item.machineState || '--' } : {}),
      incidentName: config.eventTitle?.(item.incidentType || config.logSettingType, outcome === '--' ? '' : outcome, '--') || outcome,
      currentStatus: formatStatus(item.currentStatus || item.status || (item.resolved ? 'Resolved' : 'New'), config),
      nvrName: nvrNameOf(item) || '--',
      channelName: channelNameOf(item) || '--',
      door: item.zoneName || item.zone || '--',
      doorStatus: doorStatusLabel(item),
      doorOpenDuration: `${doorDurationLabel(item)}: ${formatDoorDuration(item.durationSec)}`,
      doorDuration: formatDoorDuration(item.durationSec),
      doorDurationLabel: doorDurationLabel(item),
      doorPeriod: item.stateSince
        ? `${moment.utc(item.stateSince).tz(timezone).format('hh:mm A')}${isDoorResolved(item) && incidentDate ? ` - ${incidentDate.format('hh:mm A')}` : ''}`
        : '--',
      doorAlerts: item.alertCount == null ? '--' : isDoorResolved(item) ? `${item.alertCount} alerts raised` : `Alert ${item.alertCount}`,
      createdAt: incidentDate
        ? incidentDate.format('DD/MM/YYYY hh:mm A')
        : '--',
      incidentDate: incidentDate?.isValid() ? incidentDate.format('DD MMM YYYY') : '--',
      incidentTime: incidentDate?.isValid() ? incidentDate.format('hh:mm:ss A') : '--',
      severity: (config.showLightingFields || config.showHygieneFields || config.showDoorFields) && String(item.severity || item.riskLevel || '').toLowerCase() === 'moderate' ? 'Medium' : item.severity || item.riskLevel || item.alertSeverity || '--',
      incidentImageUrl: resolveIncidentImageUrl(item.Image),
      fireCount: item.fireCount ?? '--',
      smokeCount: item.smokeCount ?? '--',
      count: item.count ?? '--',
      alertThreshold: item.alertThreshold ?? '--',
      isFallDetected: item.isFallDetected === true || item.isFallDetected === 'true' ? 'Yes' : 'No',
      description: item.description || '--',
      posture: item.posture || '--',
      zone: zoneName,
      observedLayers: item.observedLayers ?? '--',
      evidenceScore: evidenceScoreStr,
      stockMovement: item.stockMovement || '--',
      stockCountBefore: item.stockCountBefore ?? '--',
      stockCountAfter: item.stockCountAfter ?? '--',
      vehicleNumber: item.vehicleNumber || (config.showStockCountingFields ? 'Unknown' : '--'),
      direction: item.direction || item.stockMovement || '--',
      boxTypes: boxSplitLabel(item),
      loadedBoxCount: item.loadedBoxCount ?? 0,
      unloadedBoxCount: item.unloadedBoxCount ?? 0,
      boxCount: item.boxCount ?? item.count ?? 0,
      eventCount: item.eventCount ?? 0,
      sessionCount: item.sessionCount ?? 0,
    };
  });
};

// The links in one Agent report share the same prepared data across formats.
const preparedReports = new WeakMap();
const fetchAllForExport = (config, { reportCacheKey, ...params }) => {
  if (!reportCacheKey) return loadExportRows(config, params);
  const signature = JSON.stringify([config.endpoint, params]);
  const cached = preparedReports.get(reportCacheKey);
  if (cached?.signature === signature && Date.now() < cached.expiresAt) return cached.rows;

  const entry = { signature, expiresAt: Infinity };
  entry.rows = loadExportRows(config, params).then((rows) => {
    entry.expiresAt = Date.now() + (rows.length ? 60_000 : 0);
    return rows;
  }).catch((error) => {
    if (preparedReports.get(reportCacheKey) === entry) preparedReports.delete(reportCacheKey);
    throw error;
  });
  preparedReports.set(reportCacheKey, entry);
  return entry.rows;
};

// Column descriptors shared by the Excel + PDF exporters. The Status column is
// only present for log types that carry a current-status value.
const buildExportColumns = (config) => {
  if (config.showMachineOpsFields) {
    const machineColumns = MACHINE_OPS_LOG_FIELDS.filter(field => field.key !== 'snap').map(({ key, label }) => ({ key: key === 'timeOfIncident' ? 'createdAt' : key, label }));
    if (config.showSeverity !== false) machineColumns.push({ key: 'severity', label: 'Severity' });
    return machineColumns;
  }
  // Keep Gender & Age exports aligned with the compact report used by the
  // reference workbook: split date/time fields, a readable incident label,
  // and a friendly image-link column. CSV uses this same column order.
  if (config.showGenderAgeFields) {
    return [
      { key: 'incidentDate', label: 'Date' },
      { key: 'incidentTime', label: 'Time' },
      { key: 'incidentName', label: 'Incident' },
      { key: 'nvrName', label: 'NVR Name' },
      { key: 'channelName', label: 'Camera Name' },
      { key: 'zone', label: 'Zone' },
      { key: 'severity', label: 'Severity' },
      { key: 'currentStatus', label: 'Status' },
      { key: 'targetGender', label: 'Gender' },
    ];
  }
  const cols = [];
  if (config.showIncidentName !== false) cols.push({ key: 'incidentName', label: 'Incident Name' });
  if (config.showStatus) cols.push({ key: 'currentStatus', label: 'Current Status' });
  cols.push(
    { key: 'nvrName', label: 'NVR Name' },
    { key: 'channelName', label: 'Camera Name' }
  );
  if (config.showDescription) cols.push({ key: 'description', label: 'Description' });
  if (config.showPostureFields) cols.push({ key: 'posture', label: 'Posture' });
  if (config.showCansStackFields) cols.push(
    { key: 'observedLayers', label: 'Observed Layers' },
  );
  if (config.showSittingOnCanFields) cols.push(
    { key: 'zone', label: 'Zone Name' },
    { key: 'count', label: 'People Detected' },
    { key: 'currentStatus', label: 'Detection Status' },
    { key: 'triggerNotification', label: 'Notification Enabled' },
  );
  else {
    if (config.showSittingOnCanZone) cols.push({ key: 'zone', label: 'Zone Name' });
    if (config.showSittingOnCanCount) cols.push({ key: 'count', label: 'People Detected' });
  }
  if (config.showEmotionFields) cols.push({ key: 'emotion', label: 'Emotion' });
  if (config.showGenderAgeFields) cols.push(
    { key: 'description', label: 'Description' }, { key: 'targetGender', label: 'Gender' }, { key: 'zone', label: 'Zone' },
  );
  if (config.showSeverity !== false) cols.push({ key: 'severity', label: 'Severity' });

  if (config.showDoorFields) {
    cols.push(
      { key: 'door', label: 'Door Name' },
      { key: 'doorStatus', label: 'Door Status' },
      { key: 'doorOpenDuration', label: 'Duration' },
      { key: 'doorPeriod', label: 'Since / Period' },
      { key: 'doorAlerts', label: 'Alerts' },
    );
  }

  if (config.showBoxPackingFields) cols.push(...BOX_PACKING_FIELDS.map(({ key, label }) => ({ key, label })));

  if (config.showFireSmokeFields) {
    cols.push(
      { key: 'fireCount', label: 'Fire Objects' },
      { key: 'smokeCount', label: 'Smoke Objects' }
    );
  }

  if (config.showPersonFallSickFields) {
    cols.push(
      { key: 'count', label: 'People Detected' },
      { key: 'isFallDetected', label: 'Fall Detected' },
      { key: 'evidenceScore', label: 'Evidence Score' }
    );
  }

  if (config.showBlurredCameraFields) {
    cols.push(
      { key: 'description', label: 'Description' },
    );
  }

  if (config.showLightingFields || config.showHygieneFields) {
    cols.push({ key: 'violationCount', label: 'Issues Detected' }, { key: 'zone', label: 'Zone Name' },
      { key: 'violations', label: config.showLightingFields ? 'Lighting / Site Condition Violations and Description' : 'Hygiene Violations and Description' });
  }

  if (config.showIndustrialFields) {
    cols.push(
      { key: 'count', label: 'Objects Detected' },
      ...(config.showAlertThreshold === false
        ? []
        : [{ key: 'alertThreshold', label: 'Alert Threshold' }])
    );
  }

  if (config.showStockCountingFields) {
    cols.push(
      { key: 'vehicleNumber', label: 'Vehicle Number' },
      { key: 'direction', label: 'Movement' },
      { key: 'boxTypes', label: 'Box Type' },
      { key: 'loadedBoxCount', label: 'Loaded Boxes' },
      { key: 'unloadedBoxCount', label: 'Unloaded Boxes' },
      { key: 'boxCount', label: 'Total Boxes' },
      { key: 'eventCount', label: 'Events' },
      { key: 'sessionCount', label: 'Sessions' }
    );
  }

  cols.push({ key: 'createdAt', label: 'Time of Incident' });
  if (config.showEmotionFields) return ['nvrName', 'channelName', 'incidentName', 'emotion', 'createdAt'].map(key => cols.find(column => column.key === key));
  return cols;
};

const exportToPDF = async (config, params) => {
  try {
    const allLogs = await fetchAllForExport(config, params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF('landscape');
    await drawReportHeader(doc, {
      title: config.displayTitle || config.title,
      subtitle: reportSubtitle({
        startDate: params.startDate,
        endDate: params.endDate,
        allVehicles: params.vehicleNumber ? `Vehicle: ${params.vehicleNumber}` : 'All vehicles',
        total: allLogs.length,
      }),
    });

    const cols = buildExportColumns(config);
    const headers = [config.showGenderAgeFields ? 'S No' : '#', ...cols.map((c) => c.label), 'Image'];
    const imageColIndex = headers.length - 1;
    const violationsColIndex = cols.findIndex((column) => column.key === 'violations') + 1;
    const tableRows = allLogs.map((row, i) => [i + 1, ...cols.map((c) => row[c.key]), '']);

    autoTable(doc, {
      ...reportTableOptions,
      head: [headers],
      body: tableRows,
      columnStyles: {
        [imageColIndex]: { cellWidth: 30 },
        ...(violationsColIndex > 0 ? { [violationsColIndex]: { cellWidth: 65, overflow: 'linebreak' } } : {}),
      },
      didParseCell: (data) => {
        const statusColumnIndex = cols.findIndex((column) => column.key === 'doorStatus') + 1;
        if (config.showDoorFields && statusColumnIndex > 0 && data.section === 'body' && data.column.index === statusColumnIndex) {
          const isOpen = String(data.cell.raw || '').toLowerCase() === 'open';
          const resolved = String(data.cell.raw || '').toLowerCase() === 'resolved';
          data.cell.styles.textColor = resolved ? [124, 58, 237] : isOpen ? [220, 38, 38] : [22, 163, 74];
          data.cell.styles.fillColor = resolved ? [237, 233, 254] : isOpen ? [254, 226, 226] : [220, 252, 231];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawCell: (data) => {
        if (data.column.index === imageColIndex && data.section === 'body') {
          const url = allLogs[data.row.index]?.incidentImageUrl;
          if (url) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
            doc.setTextColor(0, 0, 255);
            const text = 'View Image';
            const textX = data.cell.x + 4;
            const textY = data.cell.y + data.cell.height / 2 + 2;
            doc.text(text, textX, textY);
            const textWidth = doc.getTextWidth(text);
            doc.setLineWidth(0.3);
            doc.line(textX, textY + 1, textX + textWidth, textY + 1);
            doc.setTextColor(0, 0, 0);
          }
        }
      },
    });
    doc.save(`${config.fileName}.pdf`);
  } catch {
    toast.error('Failed to export PDF');
  }
};

/* ─────────────── Grid PDF (card layout with images) ─────────────── */

// Downscale each image to a small JPEG before embedding. Cards render ~65mm
// wide, so 240px is plenty and keeps the download + PDF size small.
const MAX_IMG_EDGE = 240;

const rawImageToDataUrl = async (url) => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const fetchDownscaledImage = async (url) => {
  const dataUrl = await rawImageToDataUrl(url);
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_IMG_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return dataUrl;
  }
};

// Resolve up to `concurrency` image fetches at a time instead of one-by-one.
const mapWithConcurrency = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const runNext = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
};

const getImageFormat = (dataUrl) => {
  const match = String(dataUrl || '').match(/^data:image\/([a-zA-Z0-9.+-]+);/);
  const type = match?.[1]?.toUpperCase();
  return type === 'JPG' ? 'JPEG' : type || 'JPEG';
};

const exportToGridPDF = async (config, params) => {
  const progressToastId = 'incident-grid-pdf-progress';
  try {
    const allLogs = await fetchAllForExport(config, params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    // Prefetch and downscale every card image up front, many at a time, so the
    // render loop below never blocks on the network.
    let done = 0;
    toast.loading(`Preparing grid PDF... 0/${allLogs.length}`, { id: progressToastId });
    const imageData = await mapWithConcurrency(allLogs, 20, async (log) => {
      let result = null;
      if (log.incidentImageUrl) {
        try {
          result = await fetchDownscaledImage(log.incidentImageUrl);
        } catch {
          result = null;
        }
      }
      done += 1;
      if (done % 10 === 0 || done === allLogs.length) {
        toast.loading(`Preparing grid PDF... ${done}/${allLogs.length}`, { id: progressToastId });
      }
      return result;
    });

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 6;
    const gap = 4;
    const columns = 4;
    const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
    const imageHeight = cardWidth / 2;
    const rowGap = 5.2;
    const bodyTopGap = 5.4;
    const details = [];
    if (config.showIncidentName !== false && !config.showDoorFields && !config.showMachineOpsFields) details.push(['Incident', 'incidentName']);
    if (config.showMachineOpsFields) details.push(
      ['Machine Name', 'machineName'],
      ['Machine State', 'machineState'],
      ['Description', 'description'],
    );
    else if (config.showDescription) details.push(['Description', 'description']);
    if (config.showPostureFields) details.push(['Posture', 'posture']);
    if (config.showCansStackFields) details.push(['Observed Layers', 'observedLayers']);
    if (config.showSittingOnCanZone) details.push(['Zone Name', 'zone']);
    if (config.showSittingOnCanCount) details.push(['People Detected', 'count']);
    if (config.showEmotionFields) details.push(['Emotion', 'emotion']);
    if (config.showGenderAgeFields) details.push(['Gender', 'targetGender'], ['Zone', 'zone'], ['Description', 'description']);
    if (config.showStatus) details.push(['Status', 'currentStatus']);
    // A grid export is a card layout too. When the card hides the severity
    // detail row, keep severity visible in the same place as the UI card: as a
    // badge over the image (drawn below).
    if (config.showSeverity !== false && !config.showDoorFields && !config.hideSeverityCardLabel) details.push(['Severity', 'severity']);
    if (config.showFireSmokeFields) {
      details.push(['Fire Objects', 'fireCount'], ['Smoke Objects', 'smokeCount']);
    }
    if (config.showPersonFallSickFields) {
      details.push(
        ['People Detected', 'count'],
        ['Fall Detected', 'isFallDetected'],
        ['Evidence Score', 'evidenceScore']
      );
    }
    if (config.showBlurredCameraFields) {
      details.push(
        ['Description', 'description'],
      );
    }
    if (config.showDoorFields) {
      details.push(
        ['Door Name', 'door'],
        ['Door Status', 'doorStatus'],
        ['Duration', 'doorDuration'],
        ['Since / Period', 'doorPeriod'],
        ['Alerts', 'doorAlerts'],
      );
    }
    if (config.showLightingFields || config.showHygieneFields) {
      details.push(['Issues Detected', 'violationCount'], ['Zone Name', 'zone'], ['Violations and Description', 'violations']);
    }
    if (config.showIndustrialFields) {
      details.push(['Objects Detected', 'count']);
      if (config.showAlertThreshold !== false) details.push(['Alert Threshold', 'alertThreshold']);
    }
    if (config.showStockCountingFields) {
      details.push(
        ['Vehicle', 'vehicleNumber'],
        ['Movement', 'direction'],
        ['Box Type', 'boxTypes'],
        ['Loaded', 'loadedBoxCount'],
        ['Unloaded', 'unloadedBoxCount'],
        ['Total Boxes', 'boxCount'],
        ['Events', 'eventCount']
      );
    }
    details.push(['NVR', 'nvrName'], ['Camera', 'channelName'], [config.timeLabel || (config.showDoorFields ? 'Time of Incident' : 'Time'), 'createdAt']);
    const cardHeight = imageHeight + bodyTopGap + rowGap * details.length + (config.showLightingFields || config.showHygieneFields ? 17 : 4);
    const firstPageStartY = 42;
    const nextPageStartY = 12;
    let x = margin;
    let y = firstPageStartY;
    let col = 0;

    await drawReportHeader(doc, {
      title: config.displayTitle || config.title,
      subtitle: reportSubtitle({
        startDate: params.startDate,
        endDate: params.endDate,
        allVehicles: params.vehicleNumber ? `Vehicle: ${params.vehicleNumber}` : 'All vehicles',
        total: allLogs.length,
      }),
    });

    const addPageIfNeeded = async () => {
      if (y + cardHeight <= pageHeight - 6) return;
      doc.addPage();
      await drawReportHeader(doc, {
        title: config.displayTitle || config.title,
        subtitle: reportSubtitle({ total: allLogs.length, allVehicles: 'All vehicles' }),
      });
      x = margin;
      y = nextPageStartY;
      col = 0;
    };

    for (let i = 0; i < allLogs.length; i += 1) {
      await addPageIfNeeded();
      const row = allLogs[i];

      doc.setDrawColor(224, 228, 236);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');

      doc.setFillColor(10, 14, 21);
      doc.roundedRect(x, y, cardWidth, imageHeight, 2.5, 2.5, 'F');

      const imageDataUrl = imageData[i];
      if (imageDataUrl) {
        try {
          doc.addImage(imageDataUrl, getImageFormat(imageDataUrl), x, y, cardWidth, imageHeight, undefined, 'FAST');
        } catch {
          /* leave the dark placeholder */
        }
      }
      if (row.incidentImageUrl) {
        doc.link(x, y, cardWidth, imageHeight, { url: row.incidentImageUrl });
      }

      if (config.showSeverity !== false && config.hideSeverityCardLabel) {
        const [red, green, blue] = exportSeverityColor(row.severity);
        const label = String(exportSeverityLabel(row.severity)).toUpperCase();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        const badgeWidth = doc.getTextWidth(label) + 6;
        const badgeX = x + cardWidth - badgeWidth - 3;
        const badgeY = y + 3;
        doc.setFillColor(red, green, blue);
        doc.roundedRect(badgeX, badgeY, badgeWidth, 5.5, 1.2, 1.2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(label, badgeX + badgeWidth / 2, badgeY + 3.8, { align: 'center' });
      }

      const labelX = x + 3.5;
      const valueX = x + cardWidth - 3.5;
      let textY = y + imageHeight + bodyTopGap;
      details.forEach(([label, key]) => {
        const isDoorStatus = config.showDoorFields && key === 'doorStatus';
        const isOpen = String(row[key] || '').toLowerCase() === 'open';
        const resolved = isDoorStatus && String(row[key] || '').toLowerCase() === 'resolved';
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(5, 24, 55);
        doc.setFontSize(5.2);
        doc.text(key === 'doorDuration' ? row.doorDurationLabel.toUpperCase() : label.toUpperCase(), labelX, textY);

        doc.setFont('helvetica', isDoorStatus ? 'bold' : 'normal');
        doc.setTextColor(isDoorStatus ? (resolved ? 124 : isOpen ? 220 : 22) : 26, isDoorStatus ? (resolved ? 58 : isOpen ? 38 : 163) : 42, isDoorStatus ? (resolved ? 237 : isOpen ? 38 : 74) : 103);
        doc.setFontSize(6.3);
        if (key === 'violations') {
          const lines = doc.splitTextToSize(String(row[key] ?? '--'), cardWidth - 7).slice(0, 5);
          doc.text(lines, labelX, textY + 3.2);
          textY += rowGap + lines.length * 2.5;
          return;
        }
        const valueText =
          doc.splitTextToSize(String(row[key] ?? '--'), cardWidth - 22).slice(0, 1)[0] || '--';
        if (isDoorStatus) {
          const pillWidth = doc.getTextWidth(valueText) + 6;
          doc.setFillColor(resolved ? 237 : isOpen ? 254 : 220, resolved ? 233 : isOpen ? 226 : 252, resolved ? 254 : isOpen ? 226 : 231);
          doc.roundedRect(valueX - pillWidth, textY - 3.2, pillWidth, 4.8, 1.4, 1.4, 'F');
        }
        doc.text(valueText, valueX, textY, { align: 'right' });
        textY += rowGap;
      });

      col += 1;
      if (col >= columns) {
        col = 0;
        x = margin;
        y += cardHeight + gap;
      } else {
        x += cardWidth + gap;
      }
    }

    doc.save(`${config.fileName}_grid.pdf`);
    toast.dismiss(progressToastId);
    toast.success('Grid PDF downloaded');
  } catch (error) {
    console.log('Failed to export incident grid PDF:', error);
    toast.dismiss(progressToastId);
    toast.error('Failed to export grid PDF');
  }
};

const exportToExcel = async (config, params) => {
  try {
    const allLogs = await fetchAllForExport(config, params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const cols = buildExportColumns(config);
    const reportTitle = config.displayTitle || (config.showGenderAgeFields ? 'Gender and Age Report' : (config.title || 'Incident Logs'));
    const headers = [config.showGenderAgeFields ? 'S No' : '#', ...cols.map((column) => column.label), 'Image'];
    const timezone = params.timezone || params.region || getConfiguredTimezone();
    const startDate = params.startDate;
    const endDate = params.endDate;
    const period = startDate && endDate
      ? `${moment(startDate).format('DD MMM YYYY')} - ${moment(endDate).format('DD MMM YYYY')}`
      : 'All dates';
    const rows = [
      [`VideoraIQ • ${reportTitle}`],
      ['Period', period],
      ['Timezone', timezone],
      ['Records', `${allLogs.length} incidents`],
      ['Generated', moment().format('DD MMM YYYY hh:mm A')],
      [],
      headers,
      ...allLogs.map((row, index) => [
        index + 1,
        ...cols.map((column) => row[column.key] ?? ''),
        row.incidentImageUrl ? 'View Image' : '',
      ]),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const headerRow = 6;
    const imageColIndex = headers.length - 1;
    const statusColIndex = cols.findIndex((column) => column.key === 'doorStatus') + 1;
    const violationsColIndex = cols.findIndex((column) => column.key === 'violations') + 1;
    const widthFor = (column) => {
      if (!column) return 8;
      if (column.key === 'violations') return 54;
      if (column.key === 'nvrName') return 24;
      if (column.key === 'channelName') return 28;
      if (column.key === 'createdAt') return 24;
      if (column.key === 'description') return 38;
      return Math.min(28, Math.max(14, String(column.label || '').length + 4));
    };
    worksheet['!cols'] = [8, ...cols.map(widthFor), 16].map((wch) => ({ wch }));
    worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
    worksheet['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 };
    worksheet['!autofilter'] = { ref: `A${headerRow + 1}:${XLSX.utils.encode_col(headers.length - 1)}${rows.length}` };
    worksheet['!rows'] = [{ hpt: 26 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 8 }, { hpt: 22 }];

    const titleStyle = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 16 }, fill: { patternType: 'solid', fgColor: { rgb: '4F81BD' } }, alignment: { horizontal: 'left', vertical: 'center' } };
    const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { patternType: 'solid', fgColor: { rgb: '1F4E78' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { bottom: { style: 'thin', color: { rgb: 'FFFFFF' } } } };
    for (let column = 0; column < headers.length; column += 1) {
      const titleCell = worksheet[XLSX.utils.encode_cell({ r: 0, c: column })];
      if (titleCell) titleCell.s = titleStyle;
      const headerCell = worksheet[XLSX.utils.encode_cell({ r: headerRow, c: column })];
      if (headerCell) headerCell.s = headerStyle;
    }
    allLogs.forEach((row, index) => {
      const excelRow = headerRow + 1 + index;
      for (let column = 0; column < headers.length; column += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: excelRow, c: column })];
        if (cell) cell.s = { fill: { patternType: 'solid', fgColor: { rgb: index % 2 ? 'F7F9FC' : 'FFFFFF' } }, alignment: { vertical: 'top', wrapText: true }, border: { bottom: { style: 'hair', color: { rgb: 'D9E2F3' } } } };
      }
      if (violationsColIndex > 0) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: excelRow, c: violationsColIndex })];
        if (cell) cell.s = { alignment: { wrapText: true, vertical: 'top' } };
      }
      if (config.showDoorFields && statusColIndex > 0) {
        const statusCell = worksheet[XLSX.utils.encode_cell({ r: excelRow, c: statusColIndex })];
        if (statusCell) {
          const isOpen = String(row.doorStatus || '').toLowerCase() === 'open';
          const resolved = String(row.doorStatus || '').toLowerCase() === 'resolved';
          statusCell.s = { fill: { patternType: 'solid', fgColor: { rgb: resolved ? 'EDE9FE' : isOpen ? 'FEE2E2' : 'DCFCE7' } }, font: { bold: true, color: { rgb: resolved ? '7C3AED' : isOpen ? 'DC2626' : '16A34A' } }, alignment: { horizontal: 'center', vertical: 'center' } };
        }
      }
      if (row.incidentImageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: excelRow, c: imageColIndex });
        const target = String(row.incidentImageUrl).replace(/"/g, '""');
        worksheet[cellRef] = {
          t: 's',
          v: 'View Image',
          f: `HYPERLINK("${target}","View Image")`,
          l: { Target: row.incidentImageUrl, Tooltip: 'Open incident image' },
          s: { font: { color: { rgb: '0563C1' }, underline: true }, alignment: { horizontal: 'center' } },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, config.sheetName || 'Logs');
    XLSX.writeFile(workbook, `${config.fileName}.xlsx`);
  } catch {
    toast.error('Failed to export Excel');
  }
};

const exportToCsv = async (config, params) => {
  try {
    const allLogs = await fetchAllForExport(config, params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }
    const cols = buildExportColumns(config);
    const reportTitle = config.displayTitle || (config.showGenderAgeFields ? 'Gender and Age Report' : (config.title || 'Incident Logs'));
    const headers = [config.showGenderAgeFields ? 'S No' : '#', ...cols.map((column) => column.label), 'Image'];
    const timezone = params.timezone || params.region || getConfiguredTimezone();
    const period = params.startDate && params.endDate
      ? `${moment(params.startDate).format('DD MMM YYYY')} - ${moment(params.endDate).format('DD MMM YYYY')}`
      : 'All dates';
    const escapeCsv = (value) => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const imageLinkFormula = (url) => url
      ? `=HYPERLINK("${String(url).replace(/"/g, '""')}","View Image")`
      : '';
    const metadata = [
      [`VideoraIQ • ${reportTitle}`],
      ['Period', period],
      ['Timezone', timezone],
      ['Records', `${allLogs.length} incidents`],
      ['Generated', moment().format('DD MMM YYYY hh:mm A')],
      [],
    ];
    const lines = [
      ...metadata.map((row) => row.map(escapeCsv).join(',')),
      headers.map(escapeCsv).join(','),
      ...allLogs.map((row, index) => [
        index + 1,
        ...cols.map((column) => row[column.key] ?? ''),
        imageLinkFormula(row.incidentImageUrl),
      ].map(escapeCsv).join(',')),
    ];
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.fileName || 'incident_logs'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    toast.error('Failed to export CSV');
  }
};

/** Entry point used by the page's Export buttons. */
export const handleIncidentExport = async (format, config, params) => {
  if (format === 'excel') await exportToExcel(config, params);
  if (format === 'pdf') await exportToPDF(config, params);
  if (format === 'csv') await exportToCsv(config, params);
  if (format === 'pdf-grid') await exportToGridPDF(config, params);
};
