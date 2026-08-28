import axios from 'axios';
import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import getAccessToken from '@/utils/getAccessToken';
import logoUrl from '@/assets/videoraiq-logo-white.png';

const HOST = import.meta.env.VITE_BACKEND;

const getHeaders = () => ({
  Accept: 'application/json',
  'x-access-token': getAccessToken(),
});

const getCarImageUrl = (item) => {
  const path = item.Image || item.image || item.imageUrl || item.carImage || item.carImageUrl || '';
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
  return `${INCIDENT_URL}${path}`;
};

const getModelName = (item) =>
  item.modelName ||
  item.modelname ||
  item.model_name ||
  item.carModelName ||
  item.carModel ||
  item.model ||
  '--';

const getYear = (item) => item.year || item.modelYear || item.carYear || '--';
const getColor = (item) => item.color || item.colour || item.carColor || '--';
const getCompany = (item) => item.company || item.make || item.carCompany || '--';

const formatIncidentTime = (value) =>
  value ? moment.utc(value).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A') : '--';

const fetchAllForExport = async ({
  startDate,
  endDate,
  sortField,
  sortOrder,
  nvrIds,
  channelIds,
  vehicleNumber,
  searchInput,
}) => {
  const res = await axios.post(
    `${HOST}/incidents/logs/car-model-detection`,
    {},
    {
      params: {
        skip: 0,
        limit: 10000,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(sortField && { sortField }),
        ...(sortOrder && { sortOrder }),
        ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
        ...(channelIds?.length && { channelIds: channelIds.join(',') }),
        ...(vehicleNumber && { vehicleNumber }),
        ...(searchInput && { search: searchInput }),
      },
      headers: getHeaders(),
    }
  );

  const list = res?.data?.body?.data?.data || [];
  return list.map((item) => ({
    modelName: getModelName(item),
    vehicleNumber: item.vehicleNumber || '--',
    vehicleVisitCount: Number(item.vehicleLogCount || 0),
    company: getCompany(item),
    color: getColor(item),
    year: getYear(item),
    nvrName: item.nvrData?.nvrName || '--',
    channelName: item.channelData?.name || '--',
    incidentTime: formatIncidentTime(item.timeOfIncident || item.createdAt),
    imageUrl: getCarImageUrl(item),
  }));
};

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

// Backwards-compatible alias used by the logo + list-view export.
const imageToDataUrl = rawImageToDataUrl;

// Downscale to a JPEG that is small enough to keep the grid PDF light and fast
// to serialize. Card images render at ~65mm wide, so 520px is plenty.
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

// Resolve up to `concurrency` image fetches at a time instead of one-by-one,
// which is what made the grid PDF crawl on large result sets.
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
  doc.text(`Generated on ${moment().format('DD/MM/YYYY hh:mm A')} | Total records: ${totalRecords}`, 82, 27);
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

// Simple 4x4mm line icons. Every branch draws inside the x..x+4 / y..y+4 box so
// they align with the label baseline, and we restore the shared draw state at
// the end so later table/border strokes are not left thin and grey.
const drawCardIcon = (doc, type, x, y) => {
  doc.setDrawColor(71, 85, 117);
  doc.setLineWidth(0.3);

  switch (type) {
    case 'hash':
      doc.line(x + 1.3, y + 0.2, x + 0.9, y + 3.8);
      doc.line(x + 3.1, y + 0.2, x + 2.7, y + 3.8);
      doc.line(x + 0.2, y + 1.4, x + 3.9, y + 1.4);
      doc.line(x + 0.1, y + 2.7, x + 3.8, y + 2.7);
      break;
    case 'clock':
      doc.circle(x + 2, y + 2, 1.8);
      doc.line(x + 2, y + 2, x + 2, y + 0.7);
      doc.line(x + 2, y + 2, x + 3, y + 2.6);
      break;
    case 'calendar':
      doc.roundedRect(x + 0.2, y + 0.6, 3.6, 3.2, 0.4, 0.4);
      doc.line(x + 0.2, y + 1.7, x + 3.8, y + 1.7);
      doc.line(x + 1.3, y + 0.1, x + 1.3, y + 1);
      doc.line(x + 2.7, y + 0.1, x + 2.7, y + 1);
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
    case 'palette':
      doc.circle(x + 2, y + 2, 1.8);
      doc.circle(x + 1.2, y + 1.5, 0.22, 'F');
      doc.circle(x + 2.1, y + 1, 0.22, 'F');
      doc.circle(x + 2.9, y + 1.7, 0.22, 'F');
      break;
    case 'building':
      doc.rect(x + 0.6, y + 0.4, 2.8, 3.4);
      doc.line(x + 1.4, y + 1.1, x + 1.4, y + 3.8);
      doc.line(x + 2.6, y + 1.1, x + 2.6, y + 3.8);
      doc.line(x + 0.2, y + 3.8, x + 3.8, y + 3.8);
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

const exportToPDF = async (params) => {
  try {
    const allLogs = await fetchAllForExport(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF('landscape');
    await drawReportHeader(doc, 'Car Detection Logs', allLogs.length);

    const headers = [
      '#',
      'Model Name',
      'Vehicle Number',
      'Vehicle Visit Count',
      'Company',
      'Colour',
      'Year',
      'NVR Name',
      'Camera Name',
      'Time',
      'Image',
    ];
    const tableRows = allLogs.map((row, i) => [
      i + 1,
      row.modelName,
      row.vehicleNumber,
      row.vehicleVisitCount,
      row.company,
      row.color,
      row.year,
      row.nvrName,
      row.channelName,
      row.incidentTime,
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
        10: { cellWidth: 25 },
      },
      didDrawCell: (data) => {
        if (data.column.index === 10 && data.section === 'body') {
          const url = allLogs[data.row.index]?.imageUrl;
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

    doc.save('car_detection_logs.pdf');
  } catch (error) {
    console.log('Failed to export car logs PDF:', error);
    toast.error('Failed to export PDF');
  }
};

const exportToGridPDF = async (params) => {
  const progressToastId = 'car-grid-pdf-progress';
  try {
    const allLogs = await fetchAllForExport(params);
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
      if (log.imageUrl) {
        try {
          result = await fetchDownscaledImage(log.imageUrl);
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
    const imageHeight = cardWidth / 2;
    const rowGap = 4.8;
    const bodyTopGap = 5.2;
    const cardHeight = imageHeight + bodyTopGap + rowGap * 9 + 5.5;
    const firstPageStartY = 42;
    const nextPageStartY = 12;
    let x = margin;
    let y = firstPageStartY;
    let col = 0;
    let pageIndex = 0;

    doc.setFillColor(245, 247, 251);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    await drawReportHeader(doc, 'Car Detection Logs', allLogs.length);

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

      if (row.imageUrl) {
        const imageDataUrl = imageData[i];
        if (imageDataUrl) {
          try {
            doc.addImage(imageDataUrl, getImageFormat(imageDataUrl), imageX, imageY, imageWidth, imageHeight, undefined, 'FAST');
          } catch {
            drawLinkedImageFallback(doc, imageX, imageY, imageWidth, imageHeight, row.imageUrl);
          }
        } else {
          drawLinkedImageFallback(doc, imageX, imageY, imageWidth, imageHeight, row.imageUrl);
        }
        doc.link(imageX, imageY, imageWidth, imageHeight, { url: row.imageUrl });
      } else {
        drawLinkedImageFallback(doc, imageX, imageY, imageWidth, imageHeight, '');
      }

      const labelX = x + 12;
      const valueX = x + cardWidth - 4;
      let textY = y + imageHeight + bodyTopGap;
      const details = [
        ['car', 'MODEL', row.modelName],
        ['car', 'VEHICLE NO.', row.vehicleNumber],
        ['hash', 'VISIT COUNT', row.vehicleVisitCount],
        ['building', 'COMPANY', row.company],
        ['palette', 'COLOUR', row.color],
        ['calendar', 'YEAR', row.year],
        ['server', 'NVR', row.nvrName],
        ['video', 'CAMERA', row.channelName],
        ['clock', 'TIME', row.incidentTime],
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

    doc.save('car_detection_logs_grid.pdf');
    toast.dismiss(progressToastId);
    toast.success('Grid PDF downloaded');
  } catch (error) {
    console.log('Failed to export car logs grid PDF:', error);
    toast.dismiss(progressToastId);
    toast.error('Failed to export grid PDF');
  }
};

const exportToExcel = async (params) => {
  try {
    const allLogs = await fetchAllForExport(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const headerRows = [
      ['VIDEORAIQ', '', '', '', '', '', '', '', '', '', ''],
      ['Car Detection Logs', '', '', '', '', '', '', '', '', '', ''],
      [`Generated on ${moment().format('DD/MM/YYYY HH:mm')}`, '', '', '', `Total records: ${allLogs.length}`, '', '', '', '', '', ''],
      [],
    ];

    const tableRows = allLogs.map((row, i) => [
      i + 1,
      row.modelName,
      row.vehicleNumber,
      row.vehicleVisitCount,
      row.company,
      row.color,
      row.year,
      row.nvrName,
      row.channelName,
      row.incidentTime,
      row.imageUrl ? 'View Image' : '',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([
      ...headerRows,
      ['#', 'Model Name', 'Vehicle Number', 'Vehicle Visit Count', 'Company', 'Colour', 'Year', 'NVR Name', 'Camera Name', 'Time', 'Image'],
      ...tableRows,
    ]);

    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      { s: { r: 2, c: 4 }, e: { r: 2, c: 10 } },
    ];
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 22 },
      { wch: 18 },
      { wch: 20 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
      { wch: 22 },
      { wch: 24 },
      { wch: 22 },
      { wch: 16 },
    ];

    allLogs.forEach((row, i) => {
      if (row.imageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 5, c: 10 });
        worksheet[cellRef] = {
          t: 's',
          v: 'View Image',
          l: { Target: row.imageUrl, Tooltip: 'Open car image' },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Car Logs');
    XLSX.writeFile(workbook, 'car_detection_logs.xlsx');
  } catch (error) {
    console.log('Failed to export car logs Excel:', error);
    toast.error('Failed to export Excel');
  }
};

export const handleCarExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
  if (format === 'pdf-grid') await exportToGridPDF(params);
};
