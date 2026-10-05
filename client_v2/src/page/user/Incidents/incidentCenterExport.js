import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { fetchIncidents } from '../../../helpers/incidents';
import { detectionLabel, mediaUrl } from '../../../lib/format';
import { formatUtcInConfiguredTimezone } from '../../../utils/timezone';

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

const hasVehicleNumber = (value) => Boolean(String(value ?? '').replace(/[^A-Za-z0-9]/g, ''));

const vehicleNumberRequired = (item) => (
  VEHICLE_NUMBER_INCIDENT_TYPES.has(item?.incidentType) || hasVehicleNumber(item?.vehicleNumber)
);

const statusOf = (item) => {
  if (item?.resolved) return 'Resolved';
  if (item?.report?.status === true) return 'Reported';
  return 'New';
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
  return {
    'Sl No': index + 1,
    Incident: text(item?.incidentName || detectionLabel(item?.incidentType || item?.displayName)),
    Detection: text(detectionLabel(item?.incidentType || item?.displayName)),
    NVR: text(item?.nvrData?.nvrName),
    Camera: text(item?.channelData?.customName || item?.channelData?.name),
    Severity: text(item?.severity),
    Status: statusOf(item),
    'Time of Incident': formatUtcInConfiguredTimezone(item?.timeOfIncident || item?.createdAt, 'DD/MM/YYYY hh:mm A'),
    'Vehicle Number': text(item?.vehicleNumber),
    Image: item?.Image ? mediaUrl(item.Image) : '--',
  };
};

const fileStamp = () => moment().format('YYYY-MM-DD_HH-mm');

const exportExcel = (rows, showVehicleNumber) => {
  const exportRows = showVehicleNumber
    ? rows
    : rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'Vehicle Number')));
  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  worksheet['!cols'] = Object.keys(exportRows[0]).map((key) => ({
    wch: Math.min(42, Math.max(key.length + 2, ...exportRows.map((row) => String(row[key] ?? '').length + 2))),
  }));

  const imageColumn = Object.keys(exportRows[0]).indexOf('Image');
  exportRows.forEach((row, index) => {
    const url = row.Image;
    if (!url || url === '--') return;
    const address = XLSX.utils.encode_cell({ r: index + 1, c: imageColumn });
    if (worksheet[address]) worksheet[address].l = { Target: url, Tooltip: 'Open incident image' };
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
    'Sl No', 'Incident', 'NVR', 'Camera', 'Severity', 'Status', 'Time of Incident',
    ...(showVehicleNumber ? ['Vehicle Number'] : []),
    'Image',
  ];
  const imageColumn = columns.length - 1;
  const columnWidths = {
    'Sl No': 12,
    Incident: showVehicleNumber ? 48 : 60,
    NVR: showVehicleNumber ? 30 : 34,
    Camera: showVehicleNumber ? 31 : 35,
    Severity: 18,
    Status: 18,
    'Time of Incident': 31,
    'Vehicle Number': 27,
    Image: 20,
  };
  autoTable(doc, {
    head: [columns],
    body: rows.map((row) => columns.map((column) => column === 'Image' ? (row.Image === '--' ? '--' : 'View image') : row[column])),
    startY: 24,
    margin: { left: 10, right: 10 },
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(columns.map((column, index) => [index, { cellWidth: columnWidths[column] }])),
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
  const details = [
    ['Incident', 'Incident'],
    ['NVR', 'NVR'],
    ['Camera', 'Camera'],
    ['Severity', 'Severity'],
    ['Status', 'Status'],
    ['Time', 'Time of Incident'],
    ...(showVehicleNumber ? [['Vehicle Number', 'Vehicle Number']] : []),
  ];
  const detailGap = 4.3;
  const cardHeight = imageHeight + 6 + details.length * detailGap + 4;
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
    details.forEach(([label, key]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.4);
      doc.setTextColor(5, 24, 55);
      doc.text(label.toUpperCase(), x + 3.5, textY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.3);
      doc.setTextColor(26, 42, 103);
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
