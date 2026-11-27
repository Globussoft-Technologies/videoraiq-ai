import * as XLSX from 'xlsx-js-style';
import { unzipSync, zipSync } from 'fflate';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatUtcInConfiguredTimezone } from '@/utils/timezone';
import logoUrl from '@/assets/videoraiq-logo-color.png';
import logoWhiteUrl from '@/assets/videoraiq-logo-white.png';
import { embedImagesInWorksheet } from './xlsxImageEmbed';
import { loadReportImages } from './reportImage';

const timestamp = (value) => value ? formatUtcInConfiguredTimezone(value, 'DD MMM YYYY, hh:mm:ss A') : '--';
const safeName = (value) => String(value || 'live-demo').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70);
const color = { blue: [59, 130, 246], ink: [15, 23, 42], muted: [100, 116, 139] };
const baseStyle = { font: { name: 'Arial', sz: 10, color: { rgb: '0F172A' } }, alignment: { vertical: 'center', wrapText: true } };
const cellBorder = { top: { style: 'thin', color: { rgb: 'D7DFEA' } }, bottom: { style: 'thin', color: { rgb: 'D7DFEA' } }, left: { style: 'thin', color: { rgb: 'D7DFEA' } }, right: { style: 'thin', color: { rgb: 'D7DFEA' } } };
const headerStyle = { ...baseStyle, font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '101527' } } };
const titleStyle = { ...baseStyle, font: { name: 'Arial', sz: 18, bold: true, color: { rgb: '4F46E5' } } };
const linkStyle = { ...baseStyle, border: cellBorder, font: { name: 'Arial', sz: 10, color: { rgb: '2563EB' }, underline: true } };
const imageLinkStyle = { ...linkStyle, font: { ...linkStyle.font, color: { rgb: '6D28D9' } } };

function underlinePdfLink(doc, text, x, y) {
  doc.setDrawColor(...color.blue);
  doc.setLineWidth(0.25);
  doc.line(x, y + 0.6, x + doc.getTextWidth(text), y + 0.6);
}

function saveBytes(bytes, type, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function reportImages(reports, pdfView) {
  const images = await loadReportImages([logoUrl, ...(pdfView === 'grid' ? [logoWhiteUrl, ...reports.flatMap((report) => report.events.map((event) => event.imageUrl))] : [])]);
  if (pdfView === 'grid') {
    await Promise.all([...images.entries()].filter(([url, image]) => url !== logoUrl && url !== logoWhiteUrl && image).map(async ([, image]) => {
      try {
        const source = new Image();
        source.src = image.dataUrl;
        await source.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 593;
        canvas.height = 300;
        const sourceRatio = source.width / source.height;
        const targetRatio = canvas.width / canvas.height;
        const cropWidth = sourceRatio > targetRatio ? source.height * targetRatio : source.width;
        const cropHeight = sourceRatio > targetRatio ? source.height : source.width / targetRatio;
        canvas.getContext('2d').drawImage(source, (source.width - cropWidth) / 2, (source.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
        image.coverDataUrl = canvas.toDataURL('image/png');
      } catch { /* retain the original image if cropping fails */ }
    }));
  }
  return images;
}

function setLink(sheet, address, label, url, style = linkStyle) {
  if (!url) return;
  sheet[address] = { t: 's', v: label, l: { Target: url, Tooltip: url }, s: style };
}

function styleRow(sheet, row, count, style) {
  for (let col = 0; col < count; col += 1) {
    const address = XLSX.utils.encode_cell({ r: row, c: col });
    if (sheet[address]) sheet[address].s = style;
  }
}

async function exportExcel(reports, filename, images) {
  const workbook = XLSX.utils.book_new();
  const rows = [
    ['', '', 'Live Demo Report'],
    ['', '', 'Smart Surveillance Powered by AI'],
    ['Generated', timestamp(new Date())],
    ['Demo runs', reports.length],
    ['Events', reports.reduce((sum, report) => sum + report.events.length, 0)],
    [],
    ['Original video', 'Processed video', 'Detection'],
  ];
  const videoHeaderIndex = rows.length - 1;
  const videoLinks = reports.map((report) => {
    const row = rows.length + 1;
    rows.push([report.originalUrl ? 'Original video' : '--', report.processedUrl ? 'Processed video' : '--', report.detectionName]);
    return { row, report };
  });
  rows.push([]);
  rows.push(['Event Log']);
  const eventTitleIndex = rows.length - 1;
  rows.push(['Detection', 'Event', 'Description', 'Time', 'Zone', 'Severity', 'Image']);
  const eventHeaderIndex = rows.length - 1;
  const links = [];
  for (const report of reports) {
    for (const event of report.events) {
      links.push({ row: rows.length + 1, event });
      rows.push([
        report.detectionName, event.incidentName || report.detectionName,
        event.description || '--', timestamp(event.timeOfIncident || event.createdAt), event.zone || '--',
        event.severity || '--', event.imageUrl ? 'View image' : '--',
      ]);
    }
  }
  if (!links.length) rows.push(['No saved incidents are linked to these video IDs.']);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [28, 32, 55, 27, 22, 14, 18].map((wch) => ({ wch }));
  sheet['!rows'] = [{ hpx: 50 }, { hpx: 22 }, { hpx: 26 }, { hpx: 26 }, { hpx: 26 }];
  sheet['!rows'][videoHeaderIndex] = { hpx: 28 };
  sheet['!rows'][eventHeaderIndex] = { hpx: 28 };
  sheet['!merges'] = [{ s: { r: 0, c: 2 }, e: { r: 0, c: 6 } }];
  sheet.C1.s = titleStyle;
  sheet.C2.s = { ...baseStyle, font: { name: 'Arial', sz: 9, color: { rgb: '6366F1' } } };
  sheet[`A${eventTitleIndex + 1}`].s = { ...baseStyle, font: { name: 'Arial', sz: 13, bold: true, color: { rgb: '111B4A' } } };
  for (let row = 2; row <= 4; row += 1) {
    sheet[`A${row + 1}`].s = { ...headerStyle, border: cellBorder };
    sheet[`B${row + 1}`].s = { ...baseStyle, border: cellBorder, fill: { fgColor: { rgb: 'F2F5FB' } }, alignment: { vertical: 'center', horizontal: row === 2 ? 'left' : 'right' } };
  }
  styleRow(sheet, videoHeaderIndex, 3, headerStyle);
  styleRow(sheet, eventHeaderIndex, 7, headerStyle);
  videoLinks.forEach(({ row, report }) => {
    styleRow(sheet, row - 1, 3, { ...baseStyle, border: cellBorder });
    setLink(sheet, `A${row}`, 'Original video', report.originalUrl);
    setLink(sheet, `B${row}`, 'Processed video', report.processedUrl);
  });
  links.forEach(({ row, event }, index) => {
    const fill = { fgColor: { rgb: index % 2 === 0 ? 'F2F5FB' : 'FFFFFF' } };
    styleRow(sheet, row - 1, 7, { ...baseStyle, border: cellBorder, fill });
    sheet['!rows'][row - 1] = { hpx: String(event.description || '').length > 90 ? 58 : 42 };
    const severity = String(event.severity || '').toLowerCase();
    if (severity === 'moderate' || severity === 'medium') sheet[`F${row}`].s = { ...baseStyle, border: cellBorder, fill: { fgColor: { rgb: 'FFF2A8' } }, font: { ...baseStyle.font, bold: true } };
    else if (severity === 'high') sheet[`F${row}`].s = { ...baseStyle, border: cellBorder, fill: { fgColor: { rgb: 'FEE2E2' } }, font: { ...baseStyle.font, bold: true } };
    else if (severity === 'low') sheet[`F${row}`].s = { ...baseStyle, border: cellBorder, fill: { fgColor: { rgb: 'DCFCE7' } }, font: { ...baseStyle.font, bold: true } };
    setLink(sheet, `G${row}`, 'View image', event.imageUrl, { ...imageLinkStyle, fill });
  });
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  const zip = unzipSync(new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })));
  const logo = images.get(logoUrl);
  if (logo) embedImagesInWorksheet(zip, 1, [{ row: 0, col: 0, bytes: logo.bytes, widthPx: 144, heightPx: 40 }]);
  saveBytes(zipSync(zip), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename);
}

function fitPdfText(doc, value, width) {
  const text = String(value || '--').replace(/\s+/g, ' ');
  if (doc.getTextWidth(text) <= width) return text;
  let shortened = text;
  while (shortened.length && doc.getTextWidth(`${shortened}...`) > width) shortened = shortened.slice(0, -1);
  return `${shortened}...`;
}

function drawGridFieldIcon(doc, label, x, y) {
  doc.setDrawColor(126, 55, 239);
  doc.setLineWidth(0.35);
  if (label === 'Time') {
    doc.circle(x, y, 1.7, 'S');
    doc.line(x, y, x, y - 1);
    doc.line(x, y, x + 0.8, y + 0.5);
  } else if (label === 'Severity') {
    doc.line(x, y - 1.8, x + 1.5, y - 1);
    doc.line(x + 1.5, y - 1, x + 1.2, y + 1);
    doc.line(x + 1.2, y + 1, x, y + 1.8);
    doc.line(x, y + 1.8, x - 1.2, y + 1);
    doc.line(x - 1.2, y + 1, x - 1.5, y - 1);
    doc.line(x - 1.5, y - 1, x, y - 1.8);
  } else if (label === 'Zone') {
    doc.circle(x, y - 0.4, 1.6, 'S');
    doc.circle(x, y - 0.4, 0.45, 'S');
    doc.line(x, y + 1.2, x, y + 1.9);
  } else if (label === 'Plate') {
    doc.roundedRect(x - 2, y - 1.5, 4, 3, 0.5, 0.5, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(3.8);
    doc.text('123', x, y + 0.6, { align: 'center' });
  } else if (label === 'Detail') {
    doc.line(x - 1.7, y - 1.5, x + 1.7, y - 1.5);
    doc.line(x - 1.7, y, x + 1.1, y);
    doc.line(x - 1.7, y + 1.5, x + 0.4, y + 1.5);
  } else {
    doc.line(x - 2, y - 0.8, x - 2, y - 1.8);
    doc.line(x - 2, y - 1.8, x - 1, y - 1.8);
    doc.line(x + 2, y - 0.8, x + 2, y - 1.8);
    doc.line(x + 2, y - 1.8, x + 1, y - 1.8);
    doc.line(x - 2, y + 0.8, x - 2, y + 1.8);
    doc.line(x - 2, y + 1.8, x - 1, y + 1.8);
    doc.line(x + 2, y + 0.8, x + 2, y + 1.8);
    doc.line(x + 2, y + 1.8, x + 1, y + 1.8);
  }
}

function drawGridPdf(reports, filename, images) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const purple = [99, 30, 205];
  const violet = [126, 55, 239];
  const muted = [105, 102, 142];
  const cardGap = 4;
  const cardX = 8;
  const cardY = 43;
  const cardWidth = (pageWidth - cardX * 2 - cardGap * 3) / 4;
  const cardHeight = 70;
  const whiteLogo = images.get(logoWhiteUrl);
  let firstPage = true;

  for (const report of reports) {
    const pageCount = Math.max(1, Math.ceil(report.events.length / 8));
    for (let part = 0; part < pageCount; part += 1) {
      if (!firstPage) doc.addPage();
      firstPage = false;
      doc.setFillColor(47, 8, 91);
      doc.rect(0, 0, pageWidth, 24, 'F');
      doc.setFillColor(...violet);
      doc.rect(pageWidth - 7, 0, 7, 24, 'F');
      if (whiteLogo) doc.addImage(whiteLogo.dataUrl, 'PNG', 10, 4, 53, 14);
      else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text('VideoraIQ', 10, 14);
      }
      doc.setDrawColor(218, 202, 246);
      doc.setLineWidth(0.3);
      doc.line(70, 5, 70, 19);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Live Demo Event Log', 77, 11);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('GRID REPORT', 77, 18);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...purple);
      doc.text(fitPdfText(doc, report.detectionName, 74), 8, 35);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...color.ink);
      doc.text(`${report.events.length} event${report.events.length === 1 ? '' : 's'}`, 86, 35);
      doc.text(fitPdfText(doc, `Original clip: ${report.clipName || '--'}`, 64), 120, 35);
      for (const [x, label, url] of [[191, 'Original video', report.originalUrl], [241, 'Processed video', report.processedUrl]]) {
        doc.setTextColor(...(url ? color.blue : muted));
        doc.text(url ? label : 'Unavailable', x, 35);
        if (url) {
          underlinePdfLink(doc, label, x, 35);
          doc.link(x, 31, doc.getTextWidth(label), 6, { url });
        }
      }
      doc.setDrawColor(201, 191, 219);
      for (const x of [83, 115, 186, 237]) doc.line(x, 30, x, 38);

      const pageEvents = report.events.slice(part * 8, (part + 1) * 8);
      if (!pageEvents.length) {
        doc.setTextColor(...muted);
        doc.setFontSize(10);
        doc.text('No saved incidents are linked to this video ID.', cardX, cardY + 5);
      }
      for (const [index, event] of pageEvents.entries()) {
        const x = cardX + (index % 4) * (cardWidth + cardGap);
        const y = cardY + Math.floor(index / 4) * (cardHeight + cardGap);

        doc.setDrawColor(205, 199, 224);
        doc.setFillColor(250, 250, 254);
        doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
        doc.setFillColor(243, 243, 251);
        doc.rect(x + 1, y + 1, cardWidth - 2, 34, 'F');
        const image = images.get(event.imageUrl);
        let imageDrawn = false;
        if (image) {
          try {
            doc.addImage(image.coverDataUrl || image.dataUrl, 'PNG', x + 2, y + 2, cardWidth - 4, 32);
            imageDrawn = true;
          } catch { /* display the unavailable label */ }
        }
        if (!imageDrawn) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(...muted);
          doc.text(event.imageUrl ? 'Image unavailable' : 'No image', x + cardWidth / 2, y + 19, { align: 'center' });
        }
        const severity = String(event.severity || 'Unknown');
        const badgeColor = /high|critical/i.test(severity) ? [254, 181, 181] : /low/i.test(severity) ? [172, 234, 194] : [255, 198, 83];
        doc.setFillColor(...badgeColor);
        doc.roundedRect(x + cardWidth - 24, y + 3, 21, 7, 2, 2, 'F');
        doc.setTextColor(21, 25, 38);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(fitPdfText(doc, severity, 17), x + cardWidth - 13.5, y + 7.7, { align: 'center' });
        doc.setFillColor(...violet);
        doc.rect(x, y + 35, cardWidth, 1.2, 'F');

        const detail = event.vehicleNumber || event.licensePlate || event.plateNumber
          ? ['Plate', event.vehicleNumber || event.licensePlate || event.plateNumber]
          : event.zone ? ['Zone', event.zone] : ['Detail', event.description || '--'];
        const fields = [
          ['Detection', event.incidentName || report.detectionName],
          detail,
          ['Time', timestamp(event.timeOfIncident || event.createdAt)],
          ['Severity', severity],
        ];
        fields.forEach(([label, value], fieldIndex) => {
          const fieldY = y + 42 + fieldIndex * 4.7;
          drawGridFieldIcon(doc, label, x + 5, fieldY - 1);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(74, 69, 100);
          doc.text(label, x + 10.5, fieldY);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.7);
          doc.setTextColor(...color.ink);
          doc.text(fitPdfText(doc, value, cardWidth - 29), x + 27, fieldY);
        });
        if (event.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(...muted);
          const lines = doc.splitTextToSize(event.description, cardWidth - 8).slice(0, 2);
          doc.text(lines, x + 4, y + 61, { lineHeightFactor: 1.05 });
        }
      }
    }
  }
  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(218, 212, 229);
    doc.line(8, pageHeight - 15, pageWidth - 8, pageHeight - 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`Generated ${timestamp(new Date())}`, 8, pageHeight - 9);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - 8, pageHeight - 9, { align: 'right' });
    doc.setFillColor(47, 8, 91);
    doc.rect(0, pageHeight - 3, pageWidth - 7, 3, 'F');
    doc.setFillColor(...violet);
    doc.rect(pageWidth - 7, pageHeight - 3, 7, 3, 'F');
  }
  doc.save(filename);
}

async function exportPdf(reports, filename, images, pdfView) {
  if (pdfView === 'grid') {
    drawGridPdf(reports, filename, images);
    return;
  }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  for (const [reportIndex, report] of reports.entries()) {
    if (reportIndex) doc.addPage();
    doc.setFillColor(...color.blue);
    doc.rect(12, 8, pageWidth - 24, 1.8, 'F');
    const logo = images.get(logoUrl);
    if (logo) doc.addImage(logo.dataUrl, 'PNG', 12, 13, 38, 12);
    else { doc.setTextColor(...color.blue); doc.setFontSize(16); doc.text('VideoraIQ', 12, 22); }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...color.ink);
    doc.text('Live Demo | Event Log', pageWidth - 12, 19, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...color.muted);
    doc.text(`Generated ${timestamp(new Date())}`, pageWidth - 12, 24, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...color.blue);
    doc.text(report.detectionName, 12, 34);
    autoTable(doc, {
      startY: 38,
      margin: { left: 12, right: 12 },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' } },
      body: [
        ['Original clip', report.clipName],
        ['Processed at', timestamp(report.generatedAt)],
        ['Events', String(report.events.length)],
        ['Original video', report.originalUrl ? 'Original video' : 'Unavailable'],
        ['Processed video', report.processedUrl ? 'Processed video' : 'Unavailable'],
      ],
      didParseCell: ({ section, row, column, cell }) => {
        if (section === 'body' && column.index === 1 && row.index >= 3 && (row.index === 3 ? report.originalUrl : report.processedUrl)) {
          cell.styles.textColor = color.blue;
        }
      },
      didDrawCell: ({ section, row, column, cell }) => {
        if (section === 'body' && column.index === 1 && row.index >= 3) {
          const url = row.index === 3 ? report.originalUrl : report.processedUrl;
          if (url) {
            doc.link(cell.x, cell.y, cell.width, cell.height, { url });
            underlinePdfLink(doc, row.index === 3 ? 'Original video' : 'Processed video', cell.x + 2, cell.y + cell.height / 2 + 1);
          }
        }
      },
    });
    const startY = doc.lastAutoTable.finalY + 6;
    if (!report.events.length) {
      doc.setFontSize(9);
      doc.setTextColor(...color.muted);
      doc.text('No saved incidents are linked to this video ID.', 12, startY + 4);
      continue;
    }
    autoTable(doc, {
        startY,
        margin: { left: 12, right: 12, bottom: 15 },
        head: [['Image', 'Event / description', 'Time', 'Zone', 'Severity']],
        body: report.events.map((event) => [
          event.imageUrl ? 'Image view' : 'No image',
          `${event.incidentName || report.detectionName}\n${event.description || 'No description provided'}`,
          timestamp(event.timeOfIncident || event.createdAt), event.zone || '--', event.severity || '--',
        ]),
        styles: { fontSize: 8, cellPadding: 2.5, valign: 'middle', overflow: 'linebreak' },
        headStyles: { fillColor: [16, 21, 39], textColor: 255 },
        alternateRowStyles: { fillColor: [246, 248, 252] },
        columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 112 }, 2: { cellWidth: 48 }, 3: { cellWidth: 48 }, 4: { cellWidth: 39 } },
        didParseCell: ({ section, row, column, cell }) => {
          if (section === 'body' && column.index === 0 && report.events[row.index]?.imageUrl) cell.styles.textColor = color.blue;
        },
        didDrawCell: ({ section, row, column, cell }) => {
          if (section === 'body' && column.index === 0 && report.events[row.index]?.imageUrl) {
            doc.link(cell.x, cell.y, cell.width, cell.height, { url: report.events[row.index].imageUrl });
            underlinePdfLink(doc, 'Image view', cell.x + 2.5, cell.y + cell.height / 2 + 1);
          }
        },
    });
  }
  const pages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(...color.muted);
    doc.text(`VideoraIQ | Live Demo   ${page} / ${pages}`, pageWidth - 12, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
  doc.save(filename);
}

export async function downloadIncidentReports(format, input, { pdfView = 'list' } = {}) {
  const reports = Array.isArray(input) ? input : [input];
  if (!reports.length) return;
  const suffix = reports.length === 1 ? safeName(`${reports[0].detectionName}-${reports[0].id}`) : 'all-demos';
  const filename = `VideoraIQ-Live-Demo-${suffix}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
  const images = await reportImages(reports, pdfView);
  if (format === 'excel') await exportExcel(reports, filename, images);
  else await exportPdf(reports, filename, images, pdfView);
}
