import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { fetchVehicleObstructionLogs } from './Api';
import { taggedUserName } from '@/helpers/vehicleTagging';
import logoUrl from '@/assets/videoraiq-logo-white.png';

/**
 * One source of truth for the export naming so the PDF title, the Excel sheet
 * name and every downloaded file name stay in sync. Previously the list PDF,
 * grid PDF and Excel each hard-coded their own "vehicle_obstruction_logs*"
 * string, so the three downloads landed with mismatched names.
 */
const REPORT_TITLE = 'ANPR Logs';
const FILE_BASE = 'anpr_logs';

/**
 * Fetch the full (unpaginated) result set for export using the current filters,
 * mapped to the export row shape. Mirrors the V1 ANPRLogs export exactly.
 */
const fetchAllForExport = async (params) => {
  const {
    startDate,
    endDate,
    sortField,
    sortOrder,
    nvrIds,
    channelIds,
    severity,
    resolved,
    reportStatus,
    vehicleNumber,
    tagStatus,
    searchInput,
  } = params;

  const res = await fetchVehicleObstructionLogs({
    skip: 0,
    limit: 10000,
    startDate,
    endDate,
    sortField,
    sortOrder,
    nvrIds,
    channelIds,
    severity,
    resolved,
    reportStatus,
    vehicleNumber,
    tagStatus,
    search: searchInput,
  });

  const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
  const list = res?.data?.body?.data?.data || [];
  return list.map((item) => ({
    incidentName: item.incidentName || '--',
    nvrName: item.nvrData?.nvrName || '--',
    channelName: item.channelData?.name || '--',
    vehicleNumber: item.vehicleNumber || '--',
    taggedUser: taggedUserName(item.taggedUser) || '--',
    createdAt: item.createdAt
      ? moment.utc(item.createdAt).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A')
      : '--',
    timeOfIncident: item.timeOfIncident
      ? moment.utc(item.timeOfIncident).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A')
      : '--',
    severity: item.severity || '--',
    incidentImageUrl: item.Image ? `${INCIDENT_URL}${item.Image}` : '',
  }));
};

/* ─────────────── shared image + header helpers ─────────────── */

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

const imageToDataUrl = rawImageToDataUrl;

const MAX_IMG_EDGE = 240;

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
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

const drawReportHeader = async (doc, title, totalRecords) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(245, 248, 255);
  doc.rect(0, 0, pageWidth, 210, 'F');
  doc.setFillColor(38, 17, 105);
  doc.roundedRect(8, 7, pageWidth - 16, 30, 2, 2, 'F');
  doc.setFillColor(49, 36, 137);
  doc.roundedRect(8, 7, pageWidth - 16, 30, 2, 2, 'F');
  doc.setFillColor(27, 18, 92);
  doc.triangle(8, 7, 92, 7, 8, 37, 'F');

  try {
    const logoDataUrl = await imageToDataUrl(logoUrl);
    doc.addImage(logoDataUrl, 'PNG', 17, 17, 50, 11);
  } catch {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('VideorAIQ', 18, 24);
  }

  doc.setDrawColor(70, 91, 178);
  doc.line(74, 14, 74, 31);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 82, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(220, 230, 255);
  doc.text(
    `Generated on ${moment().format('DD/MM/YYYY hh:mm A')} | Total records: ${totalRecords}`,
    82,
    27
  );
};

const getImageFormat = (dataUrl) => {
  const match = String(dataUrl || '').match(/^data:image\/([a-zA-Z0-9.+-]+);/);
  const type = match?.[1]?.toUpperCase();
  return type === 'JPG' ? 'JPEG' : type || 'JPEG';
};

const drawLinkedImageFallback = (doc, x, y, width, height, url) => {
  doc.setFillColor(10, 14, 21);
  doc.rect(x, y, width, height, 'F');
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const text = url ? 'Open Image' : 'No Image';
  doc.text(text, x + width / 2, y + height / 2 + 2, { align: 'center' });
  if (url) {
    const textWidth = doc.getTextWidth(text);
    doc.line(x + (width - textWidth) / 2, y + height / 2 + 3, x + (width + textWidth) / 2, y + height / 2 + 3);
  }
  doc.setTextColor(0, 0, 0);
};

// Simple 4x4mm line icons for the grid card labels.
const drawCardIcon = (doc, type, x, y) => {
  doc.setDrawColor(71, 85, 117);
  doc.setLineWidth(0.3);

  switch (type) {
    case 'user':
      doc.circle(x + 2, y + 1.3, 0.9);
      doc.line(x + 0.4, y + 3.8, x + 3.6, y + 3.8);
      doc.line(x + 0.4, y + 3.8, x + 1, y + 2.4);
      doc.line(x + 3.6, y + 3.8, x + 3, y + 2.4);
      break;
    case 'clock':
      doc.circle(x + 2, y + 2, 1.8);
      doc.line(x + 2, y + 2, x + 2, y + 0.7);
      doc.line(x + 2, y + 2, x + 3, y + 2.6);
      break;
    case 'alert':
      doc.line(x + 2, y + 0.3, x + 3.8, y + 3.7);
      doc.line(x + 3.8, y + 3.7, x + 0.2, y + 3.7);
      doc.line(x + 0.2, y + 3.7, x + 2, y + 0.3);
      doc.line(x + 2, y + 1.6, x + 2, y + 2.7);
      break;
    case 'server':
      doc.roundedRect(x + 0.2, y + 0.4, 3.6, 1.4, 0.25, 0.25);
      doc.roundedRect(x + 0.2, y + 2.3, 3.6, 1.4, 0.25, 0.25);
      doc.line(x + 1, y + 1.1, x + 1.4, y + 1.1);
      doc.line(x + 1, y + 3, x + 1.4, y + 3);
      break;
    case 'video':
      doc.roundedRect(x + 0.2, y + 1, 2.8, 2, 0.35, 0.35);
      doc.line(x + 3, y + 1.5, x + 3.9, y + 1);
      doc.line(x + 3, y + 2.5, x + 3.9, y + 3);
      doc.line(x + 3.9, y + 1, x + 3.9, y + 3);
      break;
    default: // 'car'
      doc.roundedRect(x + 0.1, y + 1.6, 3.8, 1.6, 0.5, 0.5);
      doc.line(x + 0.9, y + 1.6, x + 1.5, y + 0.6);
      doc.line(x + 1.5, y + 0.6, x + 2.6, y + 0.6);
      doc.line(x + 2.6, y + 0.6, x + 3.2, y + 1.6);
      doc.circle(x + 1.2, y + 3.3, 0.4);
      doc.circle(x + 2.8, y + 3.3, 0.4);
  }

  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
};

/* ─────────────── list PDF ─────────────── */

const exportToPDF = async (params) => {
  try {
    const allLogs = await fetchAllForExport(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF('landscape');
    await drawReportHeader(doc, REPORT_TITLE, allLogs.length);

    const headers = [
      '#',
      'Incident Name',
      'NVR Name',
      'Camera Name',
      'Vehicle Number',
      'Tagged User',
      'Time of Incident',
      'Severity',
      'Image',
    ];
    const tableRows = allLogs.map((row, i) => [
      i + 1,
      row.incidentName,
      row.nvrName,
      row.channelName,
      row.vehicleNumber,
      row.taggedUser,
      row.timeOfIncident,
      row.severity,
      '',
    ]);

    autoTable(doc, {
      head: [headers],
      body: tableRows,
      startY: 45,
      margin: { left: 10, right: 10 },
      styles: {
        fontSize: 7,
        cellPadding: 2.2,
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [35, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 9 },
        8: { cellWidth: 25 },
      },
      didDrawCell: (data) => {
        if (data.column.index === 8 && data.section === 'body') {
          const url = allLogs[data.row.index]?.incidentImageUrl;
          if (url) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
            doc.setTextColor(37, 99, 235);
            const text = 'View Image';
            const textX = data.cell.x + 3;
            const textY = data.cell.y + data.cell.height / 2 + 2;
            doc.text(text, textX, textY);
            doc.setDrawColor(37, 99, 235);
            doc.line(textX, textY + 1, textX + doc.getTextWidth(text), textY + 1);
            doc.setTextColor(0, 0, 0);
          }
        }
      },
    });
    doc.save(`${FILE_BASE}.pdf`);
  } catch {
    toast.error('Failed to export PDF');
  }
};

/* ─────────────── grid PDF ─────────────── */

const exportToGridPDF = async (params) => {
  const progressToastId = 'anpr-grid-pdf-progress';
  try {
    const allLogs = await fetchAllForExport(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

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
    const margin = 5;
    const gap = 4;
    const columns = 4;
    const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
    const imageHeight = (cardWidth * 3) / 4;
    const rowGap = 4.8;
    const bodyTopGap = 5.2;
    const detailRows = 5;
    const cardHeight = imageHeight + bodyTopGap + rowGap * detailRows + 5.5;
    const firstPageStartY = 42;
    const nextPageStartY = 12;
    let x = margin;
    let y = firstPageStartY;
    let col = 0;
    let pageIndex = 0;

    doc.setFillColor(245, 247, 251);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    await drawReportHeader(doc, REPORT_TITLE, allLogs.length);

    const addPageIfNeeded = () => {
      if (y + cardHeight <= pageHeight - 6) return;
      doc.addPage();
      pageIndex += 1;
      doc.setFillColor(245, 247, 251);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      x = margin;
      y = pageIndex === 0 ? firstPageStartY : nextPageStartY;
      col = 0;
    };

    for (let i = 0; i < allLogs.length; i += 1) {
      addPageIfNeeded();
      const row = allLogs[i];

      doc.setDrawColor(224, 228, 236);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');

      const imageX = x;
      const imageY = y;
      const imageWidth = cardWidth;
      doc.setFillColor(10, 14, 21);
      doc.roundedRect(imageX, imageY, imageWidth, imageHeight, 2.5, 2.5, 'F');

      if (row.incidentImageUrl) {
        const imageDataUrl = imageData[i];
        if (imageDataUrl) {
          try {
            doc.addImage(imageDataUrl, getImageFormat(imageDataUrl), imageX, imageY, imageWidth, imageHeight, undefined, 'FAST');
          } catch {
            drawLinkedImageFallback(doc, imageX, imageY, imageWidth, imageHeight, row.incidentImageUrl);
          }
        } else {
          drawLinkedImageFallback(doc, imageX, imageY, imageWidth, imageHeight, row.incidentImageUrl);
        }
        doc.link(imageX, imageY, imageWidth, imageHeight, { url: row.incidentImageUrl });
      } else {
        drawLinkedImageFallback(doc, imageX, imageY, imageWidth, imageHeight, '');
      }

      const labelX = x + 12;
      const valueX = x + cardWidth - 4;
      let textY = y + imageHeight + bodyTopGap;
      const details = [
        ['car', 'VEHICLE NO.', row.vehicleNumber],
        ['user', 'TAGGED USER', row.taggedUser],
        ['alert', 'SEVERITY', row.severity],
        ['server', 'NVR / CAMERA', `${row.nvrName} / ${row.channelName}`],
        ['clock', 'TIME', row.timeOfIncident],
      ];

      details.forEach(([icon, label, value]) => {
        drawCardIcon(doc, icon, x + 4.2, textY - 2.8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(5, 24, 55);
        doc.setFontSize(5.1);
        doc.text(label, labelX, textY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(26, 42, 103);
        doc.setFontSize(6.3);
        const valueText = doc.splitTextToSize(String(value ?? '--'), cardWidth - 33).slice(0, 1)[0] || '--';
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

    doc.save(`${FILE_BASE}_grid.pdf`);
    toast.dismiss(progressToastId);
    toast.success('Grid PDF downloaded');
  } catch (error) {
    console.log('Failed to export ANPR grid PDF:', error);
    toast.dismiss(progressToastId);
    toast.error('Failed to export grid PDF');
  }
};

/* ─────────────── Excel ─────────────── */

const exportToExcel = async (params) => {
  try {
    const allLogs = await fetchAllForExport(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const data = allLogs.map((row, i) => ({
      '#': i + 1,
      'Incident Name': row.incidentName,
      'NVR Name': row.nvrName,
      'Camera Name': row.channelName,
      'Vehicle Number': row.vehicleNumber,
      'Tagged User': row.taggedUser,
      'Time of Incident': row.timeOfIncident,
      Severity: row.severity,
      Image: '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    allLogs.forEach((row, i) => {
      if (row.incidentImageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: 8 });
        worksheet[cellRef] = { t: 'f', f: `HYPERLINK("${row.incidentImageUrl}", "View Image")` };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ANPR Logs');
    XLSX.writeFile(workbook, `${FILE_BASE}.xlsx`);
  } catch {
    toast.error('Failed to export Excel');
  }
};

/** Entry point used by the page's Export buttons. */
export const handleANPRExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
  if (format === 'pdf-grid') await exportToGridPDF(params);
};
