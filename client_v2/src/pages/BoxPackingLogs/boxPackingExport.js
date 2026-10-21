import * as XLSX from 'xlsx-js-style';
import moment from 'moment-timezone';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { readPackingPdfImage, loadPackingPdfImages } from './packingPdfImages';
import { drawPackingPdfGrid } from './packingPdfGrid';
import logoUrl from '@/assets/videoraiq-logo-white.png';
import { formatPackingDuration, packingWorkerCount, packingAverageSeconds, packingDateValue, packingEndTimeValue, packingStartTimeValue } from './boxPackingData';
import { packingMediaUrls } from './packingMedia';
import { buildPackingReportRecords, REPORT_COLUMNS } from './packingReportData';

const BLUE = [79, 70, 229];
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const BORDER = [226, 232, 240];

const formatDate = (value, timezone = 'Asia/Kolkata') => value ? new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  timeZone: timezone,
}).format(new Date(value)) : '—';


const reportRecords = (rows = [], timezone, reportType = 'total') => {
  if (reportType === 'alerts') return rows.map((row) => ({
    Snapshot: row.Image || row.image || row.imageUrl || row.incidentImageUrl || '',
    'Box ID': row.boxId || '—',
    'Completed By': row.completedBy || '—',
    NVR: row.nvrName || row.nvrData?.nvrName || row.nvrData?.name || row.nvr || '—',
    'Camera Name': row.cameraName || row.camera || row.channelData?.customName || row.channelData?.name || row.channelName || '—',
    'Box Number': Number.isFinite(Number(row.boxNumber)) && Number(row.boxNumber) > 0 ? row.boxNumber : '—',
    'Time to complete': formatPackingDuration(row.timeTakenSec),
    'Date & time': row.time ? moment.tz(row.time, timezone).format('DD MMM YYYY, hh:mm A') : '—',
  }));
  return buildPackingReportRecords(rows, reportType === 'zones' ? 'comparison' : (REPORT_COLUMNS[reportType] ? reportType : 'total'), timezone);
};

const normalizePackingRecords = (records, rows, timezone, reportType) => records.map((record, index) => {
  const next = { ...record };
  delete next['Box Number'];
  delete next['Date & time'];
  if (reportType === 'alerts' && rows[index]) {
    next.Date = packingDateValue(rows[index], timezone);
    next['Start time'] = packingStartTimeValue(rows[index], timezone);
    next['End time'] = packingEndTimeValue(rows[index], timezone);
  }
  return next;
});

const summaryFrom = (rows, stats) => ({
  'Total workers': packingWorkerCount(rows),
  'Boxes packed': stats?.boxes ?? rows.length,
  'Average time to complete': formatPackingDuration(stats?.avgTime ?? packingAverageSeconds(rows)),
});

const removeReviewFields = (value) => {
  if (Array.isArray(value)) return value.map(removeReviewFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/review|status|detected via|source|notes/i.test(key)).map(([key, entry]) => [key, removeReviewFields(entry)]));
};

const styleRange = (sheet, range, style) => {
  const decoded = XLSX.utils.decode_range(range);
  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      if (sheet[address]) sheet[address].s = { ...(sheet[address].s || {}), ...style };
    }
  }
};

const imageDataUrl = readPackingPdfImage;

export const downloadBoxPackingXlsx = (rows = [], options = {}) => {
  const timezone = options.timezone || 'Asia/Kolkata';
  const reportTitle = options.title || 'Box Packing Alert Logs';
  const periodLabel = options.periodLabel || 'Selected period';
  const filenamePrefix = options.filenamePrefix || 'box-packing-alert-report';
  const reportType = options.reportType || 'total';
  // The activity table supplies its already grouped and sorted rows so the
  // download preserves the visible columns, date buckets and station scope.
  const records = removeReviewFields(normalizePackingRecords(options.records ?? reportRecords(rows, timezone, reportType), rows, timezone, reportType));
  const summary = reportType === 'activity' || reportType === 'hourly'
    ? {
      'Total workers': packingWorkerCount(rows),
      'Boxes packed': rows.length,
      'Average time to complete': formatPackingDuration(packingAverageSeconds(rows)),
    }
    : removeReviewFields(summaryFrom(rows));
  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: reportTitle, Subject: `Packing activity report · ${periodLabel}`, Author: 'VideoiraQ' };
  const summarySheet = XLSX.utils.aoa_to_sheet([
    [reportTitle.toUpperCase()],
    ['Period', periodLabel],
    ['Generated', formatDate(new Date(), timezone)],
    [],
    ['Metric', 'Value'],
    ...Object.entries(summary),
  ]);
  summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 36 }];
  styleRange(summarySheet, 'A1:B1', { fill: { fgColor: { rgb: '4F46E5' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 }, alignment: { vertical: 'center' } });
  styleRange(summarySheet, 'A5:B5', { fill: { fgColor: { rgb: 'E0E7FF' } }, font: { bold: true, color: { rgb: '1E1B4B' } }, border: { bottom: { style: 'thin', color: { rgb: 'CBD5E1' } } } });
  styleRange(summarySheet, 'A6:B9', { border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } } });
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const headers = options.columns || (records.length ? Object.keys(records[0]) : REPORT_COLUMNS[reportType] || REPORT_COLUMNS.total);
  const sheet = XLSX.utils.json_to_sheet(records, { header: headers });
  sheet['!cols'] = headers.map((key) => ({ wch: key === 'Snapshot' ? 18 : Math.max(12, Math.min(30, key.length + 4)) }));
  sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(records.length + 1, 2)}` };
  sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' };
  styleRange(sheet, `A1:${XLSX.utils.encode_col(headers.length - 1)}1`, { fill: { fgColor: { rgb: '4F46E5' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { vertical: 'center', wrapText: true } });
  if (records.length) styleRange(sheet, `A2:${XLSX.utils.encode_col(headers.length - 1)}${records.length + 1}`, { border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } }, alignment: { vertical: 'center' } });
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    styleRange(sheet, `A${rowNumber}:${XLSX.utils.encode_col(headers.length - 1)}${rowNumber}`, { fill: { fgColor: { rgb: index % 2 ? 'F8FAFC' : 'FFFFFF' } } });
    for (const heading of ['Snapshot']) {
    const snapshotColumn = headers.indexOf(heading);
    const snapshotCell = snapshotColumn >= 0 ? sheet[`${XLSX.utils.encode_col(snapshotColumn)}${rowNumber}`] : null;
    if (snapshotCell && record[heading]) {
      snapshotCell.v = 'Open snapshot';
      snapshotCell.l = { Target: packingMediaUrls(record[heading]).link, Tooltip: 'Open camera snapshot' };
      snapshotCell.s = { ...(snapshotCell.s || {}), font: { color: { rgb: '2563EB' }, underline: 'single' } };
    } else if (snapshotCell) snapshotCell.v = 'No snapshot';
    }
  });
  XLSX.utils.book_append_sheet(workbook, sheet, 'Packing Logs');
  XLSX.writeFile(workbook, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const downloadBoxPackingCsv = (rows = [], options = {}) => {
  const records = removeReviewFields(options.records ?? reportRecords(rows, options.timezone || 'Asia/Kolkata', options.reportType || 'total'));
  const worksheet = XLSX.utils.json_to_sheet(records.map((row) => ({ ...row, ...(row.Snapshot ? { Snapshot: packingMediaUrls(row.Snapshot).link } : {}) })), { header: options.columns || Object.keys(records[0] || {}) });
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `box-packing-alert-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

export const downloadBoxPackingPdf = async (rows = [], stats = {}, options = {}) => {
  const timezone = options.timezone || 'Asia/Kolkata';
  const reportTitle = options.title || 'Box Packing Alert Logs';
  const periodLabel = options.periodLabel || 'Selected period';
  const filenamePrefix = options.filenamePrefix || 'box-packing-alert-report';
  const reportType = options.reportType || 'total';
  const records = removeReviewFields(normalizePackingRecords(options.records ?? reportRecords(rows, timezone, reportType), rows, timezone, reportType));
  const summary = removeReviewFields(summaryFrom(rows, stats));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setProperties({ title: reportTitle, subject: `Packing activity report · ${periodLabel}`, author: 'VideoiraQ' });
  const gridLayout = reportType === 'alerts' && options.layout === 'grid';
  const bannerHeight = gridLayout ? 22 : 30;
  const split = pageWidth * 0.75;
  doc.setFillColor(105, 139, 232); doc.rect(0, 0, split, bannerHeight, 'F');
  doc.setFillColor(151, 79, 224); doc.rect(split, 0, pageWidth - split, bannerHeight, 'F');
  const snapshotImages = reportType === 'alerts' && options.layout === 'grid'
    ? loadPackingPdfImages(records.map((record) => record.Snapshot)) : Promise.resolve([]);
  const logo = await imageDataUrl(logoUrl);
  if (logo) {
    const props = doc.getImageProperties(logo), scale = Math.min(38 / props.width, (gridLayout ? 12 : 16) / props.height);
    doc.addImage(logo, props.fileType, 14, 5, props.width * scale, props.height * scale, undefined, 'FAST');
  }
  else { doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('VideoiraQ', 14, 18); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(reportTitle, pageWidth - 14, gridLayout ? 10 : 14, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(periodLabel, pageWidth - 14, gridLayout ? 17 : 27, { align: 'right' });
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(reportType === 'alerts' ? (options.layout === 'grid' ? 'Packing snapshots and details' : 'Packing activity log') : 'Packing activity and worker comparison', 14, gridLayout ? 30 : 39);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text(`Generated ${formatDate(new Date(), timezone)} · ${timezone}`, 14, gridLayout ? 35 : 46);
  const cards = [['TOTAL WORKERS', summary['Total workers'], BLUE], ['BOXES PACKED', summary['Boxes packed'], [5, 150, 105]], ['AVERAGE TIME TO COMPLETE', summary['Average time to complete'], [126, 34, 206]]];
  const cardWidth = (pageWidth - 28 - 12) / 3;
  cards.forEach(([cardLabel, value, color], index) => {
    const x = 14 + index * (cardWidth + 6);
    doc.setFillColor(248, 250, 252); doc.setDrawColor(...BORDER); doc.roundedRect(x, gridLayout ? 40 : 52, cardWidth, gridLayout ? 14 : 16, 2, 2, 'FD');
    doc.setFillColor(...color); doc.circle(x + 6, gridLayout ? 45 : 58, 1.1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...MUTED); doc.text(cardLabel, x + 10, gridLayout ? 46 : 59);
    doc.setFontSize(13); doc.setTextColor(...INK); doc.text(String(value), x + 6, gridLayout ? 51 : 65);
  });
  const headers = options.columns || (records.length ? Object.keys(records[0]) : REPORT_COLUMNS[reportType] || REPORT_COLUMNS.total);
  if (reportType === 'alerts') {
    const images = await snapshotImages;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (options.layout === 'grid') {
      drawPackingPdfGrid(doc, records, images, { linkFor: (url) => packingMediaUrls(url).link });
    } else {
      const widths = [42, 30, 30, 25, 52, 28, 27, 27, 29];
      const scale = (pageWidth - 28) / widths.reduce((a, b) => a + b, 0);
      autoTable(doc, {
        startY: 76, margin: { left: 14, right: 14, top: 18, bottom: 14 }, tableWidth: pageWidth - 28,
        head: [headers], body: records.map((record) => headers.map((key) => key === 'Snapshot' ? (record.Snapshot ? 'Open snapshot' : 'No snapshot') : String(record[key] ?? ''))),
        theme: 'grid', styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, textColor: INK, lineColor: BORDER, lineWidth: .15, valign: 'middle', minCellHeight: 10, overflow: 'linebreak' },
        headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', minCellHeight: 10 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: Object.fromEntries(widths.map((width, index) => [index, { cellWidth: width * scale, ...(index === 0 ? { textColor: [37, 99, 235] } : {}) }])),
        didDrawCell: (data) => {
          if (data.section !== 'body') return;
          const record = records[data.row.index];
          if (headers[data.column.index] === 'Snapshot' && record.Snapshot) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: packingMediaUrls(record.Snapshot).link });
        },
      });
    }
    for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
      doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
      doc.text('Box Packing Alert Logs', 14, pageHeight - 7);
      doc.text(`Page ${page} of ${doc.getNumberOfPages()}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
    }
    doc.save(`${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }
  if (reportType !== 'total') {
    autoTable(doc, { startY: 76, margin: { left: 14, right: 14 }, head: [headers], body: records.map((row) => headers.map((key) => String(row[key] ?? ''))), theme: 'grid', styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, textColor: INK, lineColor: BORDER, lineWidth: 0.15 }, headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 250, 252] }, didDrawPage: (data) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text('VideoiraQ · Box Packing QC', 14, doc.internal.pageSize.getHeight() - 8); doc.text(`Page ${data.pageNumber}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' }); } });
    doc.save(`${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }
  const totalWidths = { 'Box ID': 28, 'Completed By': 28, NVR: 24, 'Camera Name': 52, Date: 27, 'Start time': 27, 'End time': 27, 'Time to complete': 28, Snapshot: 29 };
  const totalWidth = headers.reduce((sum, key) => sum + (totalWidths[key] || 28), 0);
  autoTable(doc, {
    startY: 76, margin: { left: 14, right: 14 }, head: [headers],
    body: records.map((row) => headers.map((key) => key === 'Snapshot' ? (row[key] ? 'Open snapshot' : 'No snapshot') : String(row[key] ?? ''))),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.2, cellPadding: 2.5, textColor: INK, lineColor: BORDER, lineWidth: 0.15, valign: 'middle' },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, cellPadding: 2.8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    tableWidth: pageWidth - 28,
    columnStyles: Object.fromEntries(headers.map((key, index) => [index, {
      cellWidth: (pageWidth - 28) * (totalWidths[key] || 28) / totalWidth,
      ...(key === 'Snapshot' ? { textColor: [37, 99, 235] } : {}),
    }])),
    didDrawCell: (data) => {
      if (data.section === 'body' && headers[data.column.index] === 'Snapshot') {
        const target = records[data.row.index]?.Snapshot;
        if (target) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: packingMediaUrls(target).link });
      }
    },
    didDrawPage: (data) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text('VideoiraQ · Box Packing QC', 14, doc.internal.pageSize.getHeight() - 8); doc.text(`Page ${data.pageNumber}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' }); },
  });
  doc.save(`${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
};
