import moment from 'moment-timezone';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { fetchIncidents } from '../../../helpers/incidents';
import { detectionLabel, mediaUrl } from '../../../lib/format';
import { formatUtcInConfiguredTimezone } from '../../../utils/timezone';
import { incidentPackingExportFields, PACKING_INCIDENT_EXPORT_COLUMNS } from '../../../helpers/incidentPackingExport.js';

const EXPORT_BATCH_SIZE = 500;
const MAX_EXPORT_ROWS = 10000;
const VEHICLE_NUMBER_INCIDENT_TYPES = new Set([
  'vehicleDetection',
  'vehicleObstruction',
  'unauthorizedParkingDetection',
  'loadingUnloadingStockCountingDetection',
  'carModelDetection',
  'vehicleCheckInOut',
]);

const text = (value, fallback = '--') => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
};

const vehicleNumberRequired = (item) => VEHICLE_NUMBER_INCIDENT_TYPES.has(item?.incidentType);

const statusOf = (item) => {
  if (item?.resolved) return 'Resolved';
  if (item?.report?.status === true) return 'Reported';
  return 'New';
};

const formatDoorDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--';
  if (value >= 86400) {
    const days = value / 86400;
    return `${days.toFixed(value % 86400 ? 1 : 0)} day${days === 1 ? '' : 's'}`;
  }
  if (value >= 3600) {
    const hours = value / 3600;
    return `${hours.toFixed(value % 3600 ? 1 : 0)} hr${hours === 1 ? '' : 's'}`;
  }
  if (value >= 60) {
    const minutes = value / 60;
    return `${minutes.toFixed(value % 60 ? 1 : 0)} min${minutes === 1 ? '' : 's'}`;
  }
  return `${value} sec${value === 1 ? '' : 's'}`;
};

// The API stores the Medium severity under the `moderate` key. Keep exports
// consistent with the Incident Center's user-facing severity label.
const severityLabel = (severity) => {
  const value = text(severity);
  return value.toLowerCase() === 'moderate' ? 'Medium' : value;
};

const fetchAllFilteredIncidents = async (filter) => {
  const rows = [];
  const seen = new Set();
  let skip = 0;
  let expected = Infinity;

  while (skip < expected && rows.length < MAX_EXPORT_ROWS) {
    const result = await fetchIncidents(
      { skip, limit: Math.min(EXPORT_BATCH_SIZE, MAX_EXPORT_ROWS - rows.length) },
      filter
    );
    const batch = Array.isArray(result?.items) ? result.items : [];
    expected = Math.min(Number(result?.totalCount) || batch.length, MAX_EXPORT_ROWS);
    if (!batch.length) break;

    batch.forEach((item, index) => {
      const id = item?._id || item?.id || `${skip}-${index}`;
      if (!seen.has(String(id))) {
        seen.add(String(id));
        rows.push(item);
      }
    });
    skip += batch.length;
    if (batch.length < EXPORT_BATCH_SIZE && skip >= expected) break;
  }

  return rows;
};

const mapRow = (item, index) => {
  const isDoorDetection = item?.incidentType === 'doorDetection';
  return {
    'Sl No': index + 1,
    Incident: text(item?.incidentName || detectionLabel(item?.incidentType || item?.displayName)),
    Detection: text(detectionLabel(item?.incidentType || item?.displayName)),
    NVR: text(item?.nvrData?.nvrName),
    Camera: text(item?.channelData?.customName || item?.channelData?.name),
    ...(isDoorDetection ? {
      Door: text(item?.zoneName || item?.zone),
      'Door Status': text(item?.doorStatus),
      'Door Open Duration': formatDoorDuration(item?.durationSec),
    } : {}),
    ...incidentPackingExportFields(item),
    Severity: severityLabel(item?.severity),
    Status: statusOf(item),
    'Time of Incident': formatUtcInConfiguredTimezone(item?.timeOfIncident || item?.createdAt, 'DD/MM/YYYY hh:mm A'),
    'Vehicle Number': text(item?.vehicleNumber),
    Image: item?.Image ? mediaUrl(item.Image) : '--',
  };
};

const fileStamp = () => moment().format('YYYY-MM-DD_HH-mm');

const exportExcel = (rows, showVehicleNumber) => {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => showVehicleNumber || key !== 'Vehicle Number');
  const exportRows = rows.map((row) => Object.fromEntries(columns.map((key) => [key, row[key] ?? '--'])));
  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  worksheet['!cols'] = Object.keys(exportRows[0]).map((key) => ({
    wch: key === 'Image'
      ? 20
      : Math.min(42, Math.max(key.length + 2, ...exportRows.map((row) => String(row[key] ?? '').length + 2))),
  }));

  const imageColumn = Object.keys(exportRows[0]).indexOf('Image');
  exportRows.forEach((row, index) => {
    const url = row.Image;
    if (url && url !== '--') {
      const address = XLSX.utils.encode_cell({ r: index + 1, c: imageColumn });
      if (worksheet[address]) {
        worksheet[address] = {
          t: 's',
          v: 'View image',
          l: { Target: url, Tooltip: 'Open incident image' },
          s: { font: { color: { rgb: '000080' }, underline: true } },
        };
      }
    }

    ['Status', 'Door Status'].forEach((key) => {
      const columnIndex = columns.indexOf(key);
      if (columnIndex < 0) return;
      const address = XLSX.utils.encode_cell({ r: index + 1, c: columnIndex });
      const cell = worksheet[address];
      if (!cell) return;

      const value = String(row[key] || '').toLowerCase();
      const isGreen = value === 'resolved' || value === 'closed';
      const isAmber = value === 'reported';
      const color = isGreen ? '166534' : isAmber ? '92400E' : 'B91C1C';
      const fill = isGreen ? 'DCFCE7' : isAmber ? 'FEF3C7' : 'FEE2E2';
      cell.s = {
        ...(cell.s || {}),
        font: { ...(cell.s?.font || {}), bold: true, color: { rgb: color } },
        fill: { patternType: 'solid', fgColor: { rgb: fill } },
        alignment: { horizontal: 'center' },
      };
    });
  });

  // Keep the header readable when the export contains the optional Door
  // Detection fields.
  columns.forEach((key, columnIndex) => {
    const address = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    if (worksheet[address]) {
      worksheet[address].s = {
        ...(worksheet[address].s || {}),
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: '3B82F6' } },
      };
    }
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Incidents');
  XLSX.writeFile(workbook, `incident-center_${fileStamp()}.xlsx`);
};

const exportListPdf = (rows, showVehicleNumber) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Incident Center Report', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Generated: ${moment().format('DD/MM/YYYY hh:mm A')}  |  Records: ${rows.length}`, 14, 19);

  const columns = [
    'Sl No', 'Incident', 'NVR', 'Camera',
    ...(rows.some((row) => Object.hasOwn(row, 'Door')) ? ['Door', 'Door Status', 'Door Open Duration'] : []),
    ...(rows.some((row) => Object.hasOwn(row, 'Box ID')) ? PACKING_INCIDENT_EXPORT_COLUMNS : []),
    'Severity', 'Status', 'Time of Incident',
    ...(showVehicleNumber ? ['Vehicle Number'] : []),
    'Image',
  ];
  const imageColumn = columns.length - 1;
  const columnWidths = {
    'Sl No': 12,
    Incident: showVehicleNumber ? 48 : 60,
    NVR: showVehicleNumber ? 30 : 34,
    Camera: showVehicleNumber ? 31 : 35,
    Door: 24,
    'Door Status': 24,
    'Door Open Duration': 30,
    Severity: 18,
    Status: 18,
    'Time of Incident': 31,
    'Vehicle Number': 27,
    Image: 20,
    'Box ID': 28,
    'Completed by': 26,
    'Time to complete': 24,
  };
  const totalWidth = columns.reduce((sum, column) => sum + columnWidths[column], 0);
  const widthScale = Math.min(1, (doc.internal.pageSize.getWidth() - 20) / totalWidth);
  autoTable(doc, {
    head: [columns],
    body: rows.map((row) => columns.map((column) => column === 'Image' ? (row.Image === '--' ? '--' : 'View image') : row[column] ?? '--')),
    startY: 24,
    margin: { left: 10, right: 10 },
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(columns.map((column, index) => [index, { cellWidth: columnWidths[column] * widthScale }])),
    didParseCell: (data) => {
      if (data.section !== 'body') return;

      if (data.column.index === imageColumn) {
        const url = rows[data.row.index]?.Image;
        if (url && url !== '--') data.cell.styles.textColor = [0, 0, 128];
      }

      const column = columns[data.column.index];
      if (column === 'Door Status') {
        const isOpen = String(data.cell.raw || '').toLowerCase() === 'open';
        data.cell.styles.textColor = isOpen ? [220, 38, 38] : [22, 163, 74];
        data.cell.styles.fillColor = isOpen ? [254, 226, 226] : [220, 252, 231];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== imageColumn) return;
      const url = rows[data.row.index]?.Image;
      if (!url || url === '--') return;
      doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
    },
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(`Page ${doc.getNumberOfPages()}`, doc.internal.pageSize.getWidth() - 22, doc.internal.pageSize.getHeight() - 5);
      doc.setTextColor(0);
    },
  });
  doc.save(`incident-center_list_${fileStamp()}.pdf`);
};

const MAX_IMAGE_EDGE = 240;

const rawImageToDataUrl = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new window.Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const fetchDownscaledImage = async (url) => {
  const dataUrl = await rawImageToDataUrl(url);
  try {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return dataUrl;
  }
};

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

const imageFormat = (dataUrl) => {
  const type = String(dataUrl).match(/^data:image\/([^;,]+)/i)?.[1]?.toUpperCase();
  return type === 'JPG' ? 'JPEG' : type || 'JPEG';
};

const exportGridPdf = async (rows, showVehicleNumber) => {
  const imageData = await mapWithConcurrency(rows, 20, async (row) => {
    if (!row.Image || row.Image === '--') return null;
    try {
      return await fetchDownscaledImage(row.Image);
    } catch {
      return null;
    }
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;
  const gap = 4;
  const columns = 4;
  const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
  const imageHeight = cardWidth * 0.52;
  const detailsFor = (row) => [
    ['Incident', 'Incident'],
    ['NVR', 'NVR'],
    ['Camera', 'Camera'],
    ...(Object.hasOwn(row, 'Door') ? [
      ['Door', 'Door'],
      ['Status', 'Door Status'],
      ['Door Open Duration', 'Door Open Duration'],
    ] : []),
    ...(Object.hasOwn(row, 'Box ID') ? PACKING_INCIDENT_EXPORT_COLUMNS.map((key) => [key, key]) : []),
    ['Severity', 'Severity'],
    ['Status', 'Status'],
    ['Time', 'Time of Incident'],
    ...(showVehicleNumber ? [['Vehicle Number', 'Vehicle Number']] : []),
  ];
  const detailGap = rows.some((row) => Object.hasOwn(row, 'Box ID')) ? 3.7 : 4.3;
  const cardHeight = imageHeight + 6 + Math.max(...rows.map((row) => detailsFor(row).length)) * detailGap + 4;
  const firstPageY = 25;
  const nextPageY = 10;
  let x = margin;
  let y = firstPageY;
  let column = 0;

  const drawPageBackground = (showHeader = false) => {
    doc.setFillColor(245, 247, 251);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    if (!showHeader) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20, 24, 40);
    doc.text('Incident Center Report - Grid View', margin, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(90, 100, 120);
    doc.text(`Generated: ${moment().format('DD/MM/YYYY hh:mm A')}  |  Records: ${rows.length}`, margin, 19);
  };

  drawPageBackground(true);

  rows.forEach((row, index) => {
    if (column === 0 && y + cardHeight > pageHeight - 8) {
      doc.addPage();
      drawPageBackground();
      y = nextPageY;
      x = margin;
    }

    doc.setDrawColor(224, 228, 236);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');
    doc.setFillColor(10, 14, 21);
    doc.roundedRect(x, y, cardWidth, imageHeight, 2.5, 2.5, 'F');

    if (imageData[index]) {
      try {
        doc.addImage(imageData[index], imageFormat(imageData[index]), x, y, cardWidth, imageHeight, undefined, 'FAST');
      } catch {
        // Keep the dark image placeholder when an image cannot be embedded.
      }
    }
    if (row.Image && row.Image !== '--') {
      doc.link(x, y, cardWidth, imageHeight, { url: row.Image });
    }

    let textY = y + imageHeight + 6;
    detailsFor(row).forEach(([label, key]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.4);
      doc.setTextColor(5, 24, 55);
      doc.text(label.toUpperCase(), x + 3.5, textY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.3);
      const isDoorStatus = key === 'Door Status';
      const isOpen = String(row[key] || '').toLowerCase() === 'open';
      doc.setTextColor(isDoorStatus ? (isOpen ? 220 : 22) : 26, isDoorStatus ? (isOpen ? 38 : 163) : 42, isDoorStatus ? (isOpen ? 38 : 74) : 103);
      const value = doc.splitTextToSize(text(row[key]), cardWidth - 24).slice(0, 1)[0] || '--';
      doc.text(value, x + cardWidth - 3.5, textY, { align: 'right' });
      textY += detailGap;
    });

    column += 1;
    if (column === columns) {
      column = 0;
      x = margin;
      y += cardHeight + gap;
    } else {
      x += cardWidth + gap;
    }
  });

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 4, { align: 'right' });
  }

  doc.save(`incident-center_grid_${fileStamp()}.pdf`);
};

export async function exportIncidentCenter(format, filter = {}, options = {}) {
  const incidents = await fetchAllFilteredIncidents(filter);
  if (!incidents.length) {
    toast.error('No incidents to export for the selected filters');
    return 0;
  }

  const rows = incidents.map(mapRow);
  const showVehicleNumber = incidents.some(vehicleNumberRequired);
  if (format === 'excel') exportExcel(rows, showVehicleNumber);
  else if (format === 'pdf' && options.viewMode === 'grid') await exportGridPdf(rows, showVehicleNumber);
  else if (format === 'pdf') exportListPdf(rows, showVehicleNumber);
  else throw new Error(`Unsupported export format: ${format}`);

  toast.success(`${format === 'excel' ? 'Excel' : 'PDF'} downloaded (${rows.length} incidents)`);
  if (incidents.length >= MAX_EXPORT_ROWS) {
    toast.info(`Export limited to the first ${MAX_EXPORT_ROWS.toLocaleString()} incidents`);
  }
  return rows.length;
}
