import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { fetchIncidentLogs } from './Api';
import { formatStatus } from './incidentColumns';

/**
 * Fetch the full (unpaginated) result set for export using the current filters,
 * mapped to the export row shape. Mirrors the V1 EmployeeLogs export.
 */
const fetchAllForExport = async (config, params) => {
  const { startDate, endDate, sortField, sortOrder, nvrIds, channelIds, severity, status, searchInput } = params;

  const res = await fetchIncidentLogs({
    endpoint: config.endpoint,
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
    search: searchInput,
  });

  const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
  const list = res?.data?.body?.data?.data || [];
  return list.map((item) => ({
    incidentName: item.incidentName || '--',
    currentStatus: formatStatus(item.currentStatus || '--', config),
    nvrName: item.nvrData?.nvrName || '--',
    channelName: item.channelData?.name || '--',
    createdAt: item.createdAt
      ? moment.utc(item.createdAt).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A')
      : '--',
    severity: item.severity || '--',
    incidentImageUrl: item.Image ? `${INCIDENT_URL}${item.Image}` : '',
  }));
};

// Column descriptors shared by the Excel + PDF exporters. The Status column is
// only present for log types that carry a current-status value.
const buildExportColumns = (config) => {
  const cols = [{ key: 'incidentName', label: 'Incident Name' }];
  if (config.showStatus) cols.push({ key: 'currentStatus', label: 'Current Status' });
  cols.push(
    { key: 'nvrName', label: 'NVR Name' },
    { key: 'channelName', label: 'Camera Name' },
    { key: 'severity', label: 'Severity' },
    { key: 'createdAt', label: 'Time of Incident' }
  );
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
    doc.setFont('helvetica');
    doc.setFontSize(12);
    doc.text(config.title, 14, 12);
    doc.setFontSize(9);
    doc.text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm')}`, 14, 18);

    const cols = buildExportColumns(config);
    const headers = ['#', ...cols.map((c) => c.label), 'Image'];
    const imageColIndex = headers.length - 1;
    const tableRows = allLogs.map((row, i) => [i + 1, ...cols.map((c) => row[c.key]), '']);

    autoTable(doc, {
      head: [headers],
      body: tableRows,
      startY: 24,
      styles: { fontSize: 7 },
      columnStyles: { [imageColIndex]: { cellWidth: 40 } },
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
    const details = [
      ['Incident', 'incidentName'],
      ['Severity', 'severity'],
      ['NVR', 'nvrName'],
      ['Camera', 'channelName'],
      ['Time', 'createdAt'],
    ];
    if (config.showStatus) details.splice(1, 0, ['Status', 'currentStatus']);
    const cardHeight = imageHeight + bodyTopGap + rowGap * details.length + 4;
    const firstPageStartY = 24;
    const nextPageStartY = 12;
    let x = margin;
    let y = firstPageStartY;
    let col = 0;

    doc.setFillColor(245, 247, 251);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 24, 40);
    doc.text(config.title, margin, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 100, 120);
    doc.text(
      `Generated on ${moment().format('DD/MM/YYYY hh:mm A')} | Total records: ${allLogs.length}`,
      margin,
      18
    );

    const addPageIfNeeded = () => {
      if (y + cardHeight <= pageHeight - 6) return;
      doc.addPage();
      doc.setFillColor(245, 247, 251);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      x = margin;
      y = nextPageStartY;
      col = 0;
    };

    for (let i = 0; i < allLogs.length; i += 1) {
      addPageIfNeeded();
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
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(5, 24, 55);
        doc.setFontSize(5.2);
        doc.text(label.toUpperCase(), labelX, textY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(26, 42, 103);
        doc.setFontSize(6.3);
        const valueText =
          doc.splitTextToSize(String(row[key] ?? '--'), cardWidth - 22).slice(0, 1)[0] || '--';
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
    const imageColIndex = cols.length + 1; // after '#' + all cols

    allLogs.forEach((row, i) => {
      if (row.incidentImageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: imageColIndex });
        worksheet[cellRef] = { t: 'f', f: `HYPERLINK("${row.incidentImageUrl}", "View Image")` };
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
