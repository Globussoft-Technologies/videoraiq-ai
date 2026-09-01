import axios from 'axios';
import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import getAccessToken from '@/utils/getAccessToken';
import logoUrl from '@/assets/videoraiq-logo-white.png';

const HOST = import.meta.env.VITE_BACKEND;

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

const getImageUrl = (item) => {
  const path = item.Image || item.image || item.imageUrl || '';
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
  return `${INCIDENT_URL}${path}`;
};

const formatIncidentTime = (value) =>
  value ? moment.utc(value).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A') : '--';

const fetchAllForExport = async ({
  startDate,
  endDate,
  nvrIds,
  channelIds,
  isSleeping,
  searchInput,
}) => {
  const body = {
    skip: 0,
    limit: 10000,
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    ...(Array.isArray(nvrIds) && nvrIds.length > 0 && { nvrIds: nvrIds.join(',') }),
    ...(Array.isArray(channelIds) && channelIds.length > 0 && { channelIds: channelIds.join(',') }),
    ...(typeof isSleeping === 'boolean' && { isSleeping }),
    ...(searchInput && { search: searchInput }),
  };
  const res = await axios.post(`${HOST}/incidents/logs/guard-sleeping`, body, {
    headers: jsonHeaders(),
  });

  const list = res?.data?.body?.data?.data || [];
  return list.map((item) => ({
    status: item.isSleeping === true ? 'Sleeping' : 'Awake',
    nvrName: item.nvrData?.nvrName || '--',
    channelName: item.channelData?.customName || item.channelData?.name || '--',
    incidentTime: formatIncidentTime(item.timeOfIncident || item.createdAt),
    imageUrl: getImageUrl(item),
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

const drawCardIcon = (doc, type, x, y) => {
  doc.setDrawColor(71, 85, 117);
  doc.setLineWidth(0.3);

  switch (type) {
    case 'clock':
      doc.circle(x + 2, y + 2, 1.8);
      doc.line(x + 2, y + 2, x + 2, y + 0.7);
      doc.line(x + 2, y + 2, x + 3, y + 2.6);
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
    default: // 'moon' — sleep status
      doc.circle(x + 2.2, y + 2, 1.7);
      doc.setFillColor(245, 248, 255);
      doc.circle(x + 2.9, y + 1.5, 1.5, 'F');
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
    await drawReportHeader(doc, 'Sleep Activity Logs', allLogs.length);

    const headers = ['#', 'Status', 'NVR Name', 'Camera Name', 'Time', 'Image'];
    const tableRows = allLogs.map((row, i) => [
      String(i + 1),
      row.status,
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
        0: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 25 },
      },
      didDrawCell: (data) => {
        if (data.column.index === 5 && data.section === 'body') {
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

    doc.save('sleep_activity_logs.pdf');
  } catch (error) {
    console.log('Failed to export sleep activity logs PDF:', error);
    toast.error('Failed to export PDF');
  }
};

const exportToGridPDF = async (params) => {
  const progressToastId = 'sleep-activity-grid-pdf-progress';
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

    // Portrait 3-up grid — sleep-activity cards carry only 4 detail rows, so a
    // wider card with a larger image and readable type reads far better than
    // the dense 4-up landscape layout the vehicle logs use.
    const doc = new jsPDF('portrait');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const gap = 6;
    const columns = 3;
    const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
    const imageHeight = cardWidth * 0.62;
    const rowGap = 7;
    const bodyTopGap = 7;
    const bodyBottomPad = 6;
    const cardHeight = imageHeight + bodyTopGap + rowGap * 4 + bodyBottomPad;
    const firstPageStartY = 44;
    const nextPageStartY = 14;
    let x = margin;
    let y = firstPageStartY;
    let col = 0;
    let pageIndex = 0;

    doc.setFillColor(245, 247, 251);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    await drawReportHeader(doc, 'Sleep Activity Logs', allLogs.length);

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

      const imgInset = 3;
      const imageX = x + imgInset;
      const imageY = y + imgInset;
      const imageWidth = cardWidth - imgInset * 2;
      doc.setFillColor(10, 14, 21);
      doc.roundedRect(imageX, imageY, imageWidth, imageHeight, 2, 2, 'F');

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

      const padX = 6;
      const labelX = x + padX + 7;
      const valueX = x + cardWidth - padX;
      let textY = y + imgInset + imageHeight + bodyTopGap;
      const details = [
        ['moon', 'STATUS', row.status],
        ['server', 'NVR', row.nvrName],
        ['video', 'CAMERA', row.channelName],
        ['clock', 'TIME', row.incidentTime],
      ];

      details.forEach(([icon, label, value], idx) => {
        if (idx > 0) {
          doc.setDrawColor(237, 240, 246);
          doc.setLineWidth(0.15);
          doc.line(x + padX, textY - rowGap / 2 - 0.5, x + cardWidth - padX, textY - rowGap / 2 - 0.5);
        }
        drawCardIcon(doc, icon, x + padX - 0.5, textY - 3);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(5, 24, 55);
        doc.setFontSize(6.6);
        doc.text(label, labelX, textY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(26, 42, 103);
        doc.setFontSize(7.8);
        const valueText =
          doc.splitTextToSize(String(value ?? '--'), cardWidth - padX - labelX + x - 4).slice(0, 1)[0] || '--';
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

    doc.save('sleep_activity_logs_grid.pdf');
    toast.dismiss(progressToastId);
    toast.success('Grid PDF downloaded');
  } catch (error) {
    console.log('Failed to export sleep activity logs grid PDF:', error);
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
      ['VIDEORAIQ', '', '', '', '', ''],
      ['Sleep Activity Logs', '', '', '', '', ''],
      [`Generated on ${moment().format('DD/MM/YYYY HH:mm')}`, '', '', `Total records: ${allLogs.length}`, '', ''],
      [],
    ];

    const tableRows = allLogs.map((row, i) => [
      i + 1,
      row.status,
      row.nvrName,
      row.channelName,
      row.incidentTime,
      row.imageUrl ? 'View Image' : '',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([
      ...headerRows,
      ['#', 'Status', 'NVR Name', 'Camera Name', 'Time', 'Image'],
      ...tableRows,
    ]);

    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
      { s: { r: 2, c: 3 }, e: { r: 2, c: 5 } },
    ];
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 24 },
      { wch: 26 },
      { wch: 22 },
      { wch: 16 },
    ];

    allLogs.forEach((row, i) => {
      if (row.imageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 5, c: 5 });
        worksheet[cellRef] = {
          t: 's',
          v: 'View Image',
          l: { Target: row.imageUrl, Tooltip: 'Open detection image' },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sleep Activity Logs');
    XLSX.writeFile(workbook, 'sleep_activity_logs.xlsx');
  } catch (error) {
    console.log('Failed to export sleep activity logs Excel:', error);
    toast.error('Failed to export Excel');
  }
};

export const handleSleepActivityExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
  if (format === 'pdf-grid') await exportToGridPDF(params);
};
