import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import logoUrl from '@/assets/videoraiq-logo-white.png';

const REPORT_TITLE = 'Desk Absence Logs';
const TABLE_HEADERS = ['#', 'Severity', 'Status', 'NVR Name', 'Camera Name', 'Zone', 'Time', 'Description', 'Image'];
const FILE_NAME = 'desk_absence_logs';

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
    case 'person':
      doc.circle(x + 2, y + 1.1, 0.8);
      doc.roundedRect(x + 0.5, y + 2.3, 3, 1.5, 0.6, 0.6);
      break;
    case 'activity':
      doc.lines([[0.9, 0], [0.7, -1], [0.7, 2], [0.7, -1], [1, 0]], x, y + 2);
      break;
    case 'pin':
      doc.circle(x + 2, y + 1.5, 1.2);
      doc.line(x + 1, y + 2.2, x + 2, y + 4);
      doc.line(x + 3, y + 2.2, x + 2, y + 4);
      break;
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
  }

  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
};

const exportToPDF = async (params) => {
  try {
    const allLogs = await params.fetchRows(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF('landscape');
    await drawReportHeader(doc, REPORT_TITLE, allLogs.length);

    const tableRows = allLogs.map((row, i) => [
      String(i + 1),
      row.severity,
      row.status,
      row.nvrName,
      row.channelName,
      row.zoneName,
      row.incidentTime,
      row.description || '--',
      '',
    ]);

    const imageColumn = TABLE_HEADERS.length - 1;
    autoTable(doc, {
      head: [TABLE_HEADERS],
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
        [imageColumn]: { cellWidth: 25 },
      },
      didDrawCell: (data) => {
        if (data.column.index === imageColumn && data.section === 'body') {
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

    doc.save(FILE_NAME + '.pdf');
  } catch (error) {
    console.log('Failed to export desk absence logs PDF:', error);
    toast.error('Failed to export PDF');
  }
};

const exportToGridPDF = async (params) => {
  const progressToastId = FILE_NAME + '-grid-pdf-progress';
  try {
    const allLogs = await params.fetchRows(params);
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

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const gap = 6;
    const columns = 4;
    const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
    const imageHeight = cardWidth * 0.62;
    const rowGap = 7;
    const bodyTopGap = 7;
    const bodyBottomPad = 6;
    const details = [
      ['person', 'STATUS', 'status'],
      ['activity', 'DESCRIPTION', 'description'],
      ['server', 'NVR', 'nvrName'],
      ['video', 'CAMERA', 'channelName'],
      ['pin', 'ZONE', 'zoneName'],
      ['clock', 'TIME OF INCIDENT', 'incidentTime'],
    ];
    const imageInset = 3;
    const baseCardHeight = imageInset + imageHeight + bodyTopGap + rowGap * (details.length - 1) + bodyBottomPad;
    const firstPageStartY = 44;
    const nextPageStartY = 14;
    const labelFontSize = 6.6;
    const valueFontSize = 7.8;
    const lineHeight = 4;
    const padX = 5;
    const labelOffset = padX + 6;
    const maxExtraLines = Math.floor((pageHeight - nextPageStartY - 6 - baseCardHeight) / lineHeight);
    let x = margin;
    let y = firstPageStartY;
    let col = 0;
    let cardHeight = baseCardHeight;
    let cardDetails = [];

    doc.setFillColor(245, 247, 251);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    await drawReportHeader(doc, REPORT_TITLE, allLogs.length);

    const addPageIfNeeded = () => {
      if (y + cardHeight <= pageHeight - 6) return;
      doc.addPage();
      doc.setFillColor(245, 247, 251);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      y = nextPageStartY;
    };

    for (let i = 0; i < allLogs.length; i += 1) {
      if (col === 0) {
        cardDetails = allLogs.slice(i, i + columns).map((item) => {
          let remainingExtraLines = maxExtraLines;
          return details.map(([icon, label, key]) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(labelFontSize);
            const valueWidth = cardWidth - padX - labelOffset - doc.getTextWidth(label) - 2;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(valueFontSize);
            const wrapped = doc.splitTextToSize(String(item[key] || '--'), valueWidth);
            const limit = remainingExtraLines + 1;
            const lines = wrapped.length > limit ? [...wrapped.slice(0, limit - 1), '...'] : wrapped;
            remainingExtraLines -= lines.length - 1;
            return { icon, label, lines };
          });
        });
        const extraLines = cardDetails.map((fields) => fields.reduce((total, { lines }) => total + lines.length - 1, 0));
        cardHeight = baseCardHeight + Math.max(...extraLines) * lineHeight;
        addPageIfNeeded();
      }
      const row = allLogs[i];

      doc.setDrawColor(224, 228, 236);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');

      const imageX = x + imageInset;
      const imageY = y + imageInset;
      const imageWidth = cardWidth - imageInset * 2;
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

      const severity = row.severity;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      const badgeWidth = doc.getTextWidth(severity) + 5;
      const badgeX = imageX + imageWidth - badgeWidth - 2;
      const badgeY = imageY + 2;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(badgeX, badgeY, badgeWidth, 5, 1, 1, 'F');
      doc.setTextColor(15, 23, 42);
      doc.text(severity, badgeX + 2.5, badgeY + 3.4);

      const labelX = x + labelOffset;
      const valueX = x + cardWidth - padX;
      let textY = imageY + imageHeight + bodyTopGap;

      cardDetails[col].forEach(({ icon, label, lines }, idx) => {
        if (idx > 0) {
          doc.setDrawColor(237, 240, 246);
          doc.setLineWidth(0.15);
          doc.line(x + padX, textY - rowGap / 2 - 0.5, x + cardWidth - padX, textY - rowGap / 2 - 0.5);
        }
        drawCardIcon(doc, icon, x + padX - 0.5, textY - 3);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(5, 24, 55);
        doc.setFontSize(labelFontSize);
        doc.text(label, labelX, textY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(26, 42, 103);
        doc.setFontSize(valueFontSize);
        lines.forEach((line, index) => {
          doc.text(line, valueX, textY + index * lineHeight, { align: 'right' });
        });
        textY += rowGap + (lines.length - 1) * lineHeight;
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

    doc.save(FILE_NAME + '_grid.pdf');
    toast.dismiss(progressToastId);
    toast.success('Grid PDF downloaded');
  } catch (error) {
    console.log('Failed to export desk absence logs grid PDF:', error);
    toast.dismiss(progressToastId);
    toast.error('Failed to export grid PDF');
  }
};

const exportToExcel = async (params) => {
  try {
    const allLogs = await params.fetchRows(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const headerRows = [
      ['VIDEORAIQ', '', '', '', '', ''],
      [REPORT_TITLE, '', '', '', '', ''],
      [`Generated on ${moment().format('DD/MM/YYYY HH:mm')}`, '', '', `Total records: ${allLogs.length}`, '', ''],
      [],
    ];

    const tableRows = allLogs.map((row, i) => [
      i + 1,
      row.severity,
      row.status,
      row.nvrName,
      row.channelName,
      row.zoneName,
      row.incidentTime,
      row.description || '--',
      row.imageUrl ? 'View Image' : '',
    ]);

    const imageColumn = TABLE_HEADERS.length - 1;
    const worksheet = XLSX.utils.aoa_to_sheet([
      ...headerRows,
      TABLE_HEADERS,
      ...tableRows,
    ]);

    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: imageColumn } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: imageColumn } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
      { s: { r: 2, c: 3 }, e: { r: 2, c: imageColumn } },
    ];
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 16 },
      { wch: 16 },
      { wch: 24 },
      { wch: 26 },
      { wch: 24 },
      { wch: 22 },
      { wch: 58 },
      { wch: 16 },
    ];

    allLogs.forEach((row, i) => {
      if (row.imageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 5, c: imageColumn });
        worksheet[cellRef] = {
          t: 's',
          v: 'View Image',
          l: { Target: row.imageUrl, Tooltip: 'Open detection image' },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, REPORT_TITLE);
    XLSX.writeFile(workbook, FILE_NAME + '.xlsx');
  } catch (error) {
    console.log('Failed to export desk absence logs Excel:', error);
    toast.error('Failed to export Excel');
  }
};

export const handleDeskAbsenceExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
  if (format === 'pdf-grid') await exportToGridPDF(params);
};
