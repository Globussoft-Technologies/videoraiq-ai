import { lightingCategoryLabel } from '@/helpers/lightingDetection';
import { hygieneCategoryLabel } from '@/helpers/hygieneDetection';
import moment from 'moment-timezone';
import { getConfiguredTimezone } from '@/utils/timezone';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { fetchDoorStatusLogs, fetchIncidentLogs } from './Api';
import { formatDoorDuration, formatStatus } from './incidentColumns';
import { doorDurationLabel, doorStatusLabel, isDoorResolved } from './doorIncident';
import { boxSplitLabel } from './stockMovement';
import { BOX_PACKING_FIELDS, packingExportValues } from './boxPacking';
import { drawReportHeader, reportSubtitle, reportTableOptions } from './pdfReportTemplate';

const resolveIncidentImageUrl = (value) => {
  if (!value) return '';
  const image = String(value).trim();
  if (/^(https?:|data:|blob:)/i.test(image)) return image;
  return `${import.meta.env.VITE_INCIDENT_URL || ''}${image}`;
};

/**
 * Fetch the full (unpaginated) result set for export using the current filters,
 * mapped to the export row shape. Mirrors the V1 EmployeeLogs export.
 */
const fetchAllForExport = async (config, params) => {
  const { startDate, endDate, sortField, sortOrder, nvrIds, channelIds, severity, status, doorStatus, searchInput, vehicleNumber } = params;

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
  };

  const list = config.showDoorFields && doorStatus
    ? await fetchDoorStatusLogs({ ...query, doorStatus })
    : (await fetchIncidentLogs(query))?.data?.body?.data?.data || [];
  return list.map((item) => {
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
      incidentName: item.incidentName || '--',
      currentStatus: formatStatus(item.currentStatus || '--', config),
      nvrName: item.nvrData?.nvrName || '--',
      channelName: item.channelData?.name || '--',
      door: item.zoneName || item.zone || '--',
      doorStatus: doorStatusLabel(item),
      doorOpenDuration: `${doorDurationLabel(item)}: ${formatDoorDuration(item.durationSec)}`,
      doorDuration: formatDoorDuration(item.durationSec),
      doorDurationLabel: doorDurationLabel(item),
      doorPeriod: item.stateSince
        ? `${moment.utc(item.stateSince).tz(getConfiguredTimezone()).format('hh:mm A')}${isDoorResolved(item) && (item.timeOfIncident || item.createdAt) ? ` - ${moment.utc(item.timeOfIncident || item.createdAt).tz(getConfiguredTimezone()).format('hh:mm A')}` : ''}`
        : '--',
      doorAlerts: item.alertCount == null ? '--' : isDoorResolved(item) ? `${item.alertCount} alerts raised` : `Alert ${item.alertCount}`,
      createdAt: item.timeOfIncident || item.createdAt
        ? moment.utc(item.timeOfIncident || item.createdAt).tz(getConfiguredTimezone()).format('DD/MM/YYYY hh:mm A')
        : '--',
      severity: (config.showLightingFields || config.showHygieneFields || config.showDoorFields) && String(item.severity || '').toLowerCase() === 'moderate' ? 'Medium' : item.severity || '--',
      incidentImageUrl: resolveIncidentImageUrl(item.Image),
      fireCount: item.fireCount ?? '--',
      smokeCount: item.smokeCount ?? '--',
      count: item.count ?? '--',
      alertThreshold: item.alertThreshold ?? '--',
      isFallDetected: item.isFallDetected === true || item.isFallDetected === 'true' ? 'Yes' : 'No',
      description: item.description || '--',
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

// Column descriptors shared by the Excel + PDF exporters. The Status column is
// only present for log types that carry a current-status value.
const buildExportColumns = (config) => {
  const cols = [];
  if (config.showIncidentName !== false) cols.push({ key: 'incidentName', label: 'Incident Name' });
  if (config.showStatus) cols.push({ key: 'currentStatus', label: 'Current Status' });
  cols.push(
    { key: 'nvrName', label: 'NVR Name' },
    { key: 'channelName', label: 'Camera Name' }
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
      title: config.title,
      subtitle: reportSubtitle({
        startDate: params.startDate,
        endDate: params.endDate,
        allVehicles: params.vehicleNumber ? `Vehicle: ${params.vehicleNumber}` : 'All vehicles',
        total: allLogs.length,
      }),
    });

    const cols = buildExportColumns(config);
    const headers = ['#', ...cols.map((c) => c.label), 'Image'];
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
    if (config.showIncidentName !== false && !config.showDoorFields) details.push(['Incident', 'incidentName']);
    if (config.showStatus) details.push(['Status', 'currentStatus']);
    if (config.showSeverity !== false && !config.showDoorFields) details.push(['Severity', 'severity']);
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
    details.push(['NVR', 'nvrName'], ['Camera', 'channelName'], [config.showDoorFields ? 'Time of Incident' : 'Time', 'createdAt']);
    const cardHeight = imageHeight + bodyTopGap + rowGap * details.length + (config.showLightingFields || config.showHygieneFields ? 17 : 4);
    const firstPageStartY = 42;
    const nextPageStartY = 12;
    let x = margin;
    let y = firstPageStartY;
    let col = 0;

    await drawReportHeader(doc, {
      title: config.title,
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
        title: config.title,
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
    const data = allLogs.map((row, i) => {
      const rec = { '#': i + 1 };
      cols.forEach((c) => {
        rec[c.label] = row[c.key];
      });
      rec.Image = '';
      return rec;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = [{ wch: 6 }, ...cols.map((column) => ({ wch: column.key === 'violations' ? 70 : column.key === 'nvrName' ? 34 : column.key === 'createdAt' ? 23 : 20 })), { wch: 16 }];
    const imageColIndex = cols.length + 1; // after '#' + all cols
    const statusColIndex = cols.findIndex((column) => column.key === 'doorStatus') + 1;
    const violationsColIndex = cols.findIndex((column) => column.key === 'violations') + 1;

    allLogs.forEach((row, i) => {
      if (violationsColIndex > 0) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: violationsColIndex });
        if (worksheet[cellRef]) worksheet[cellRef].s = { alignment: { wrapText: true, vertical: 'top' } };
      }
      if (config.showDoorFields && statusColIndex > 0) {
        const statusCellRef = XLSX.utils.encode_cell({ r: i + 1, c: statusColIndex });
        const statusCell = worksheet[statusCellRef];
        if (statusCell) {
          const isOpen = String(row.doorStatus || '').toLowerCase() === 'open';
          const resolved = String(row.doorStatus || '').toLowerCase() === 'resolved';
          statusCell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: resolved ? 'EDE9FE' : isOpen ? 'FEE2E2' : 'DCFCE7' } },
            font: { bold: true, color: { rgb: resolved ? '7C3AED' : isOpen ? 'DC2626' : '16A34A' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          };
        }
      }
      if (row.incidentImageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: imageColIndex });
        worksheet[cellRef] = {
          t: 's',
          v: 'View Image',
          l: { Target: row.incidentImageUrl, Tooltip: 'Open incident image' },
          s: { font: { color: { rgb: '0563C1' }, underline: true } },
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

/** Entry point used by the page's Export buttons. */
export const handleIncidentExport = async (format, config, params) => {
  if (format === 'excel') await exportToExcel(config, params);
  if (format === 'pdf') await exportToPDF(config, params);
  if (format === 'pdf-grid') await exportToGridPDF(config, params);
};
