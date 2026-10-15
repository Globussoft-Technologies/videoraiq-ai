import * as XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import logoUrl from '@/assets/videoraiq-logo-white.png';

const BLUE = [79, 70, 229];
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const BORDER = [226, 232, 240];

const formatDate = (value, timezone = 'Asia/Kolkata') => value ? new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  timeZone: timezone,
}).format(new Date(value)) : '—';

const exportRows = (rows = [], timezone) => rows.map((row) => ({
  'Log ID': row.id || '—',
  'Box ID': row.boxId || '—',
  Operator: row.completedBy || '—',
  Zone: row.zone || '—',
  Boxes: Number(row.boxNumber) || 0,
  'Cycle (sec)': Number(row.timeTakenSec) || 0,
  Status: row.status === 'completed' ? 'Completed' : 'Needs review',
  Source: row.detectedVia || '—',
  Camera: row.camera || '—',
  Time: formatDate(row.time, timezone),
  Notes: row.reason || '—',
  Snapshot: row.Image || row.image || row.imageUrl || row.incidentImageUrl || '',
}));

const reportRecords = (rows = [], timezone, reportType = 'total') => {
  if (reportType === 'hourly') {
    const grouped = rows.reduce((out, row) => {
      const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone }).format(new Date(row.time));
      out[hour] ||= { hour, events: 0, boxes: 0, review: 0 };
      out[hour].events += 1;
      out[hour].boxes += Number(row.boxNumber) || 0;
      out[hour].review += row.status === 'review' ? 1 : 0;
      return out;
    }, {});
    return Object.values(grouped).sort((a, b) => a.hour.localeCompare(b.hour)).map((item) => ({ Hour: `${item.hour}:00–${String(Number(item.hour) + 1).padStart(2, '0')}:00`, Events: item.events, 'Boxes packed': item.boxes, 'Needs review': item.review }));
  }
  if (reportType === 'comparison' || reportType === 'zones') {
    const grouped = rows.reduce((out, row) => {
      const zone = row.zone || 'Unassigned';
      out[zone] ||= { Zone: zone, Events: 0, Boxes: 0, review: 0, seconds: 0 };
      out[zone].Events += 1;
      out[zone].Boxes += Number(row.boxNumber) || 0;
      out[zone].review += row.status === 'review' ? 1 : 0;
      out[zone].seconds += Number(row.timeTakenSec) || 0;
      return out;
    }, {});
    return Object.values(grouped).map((item) => ({ Zone: item.Zone, Events: item.Events, Boxes: item.Boxes, 'Needs review': item.review, 'Average cycle (sec)': item.Events ? Math.round(item.seconds / item.Events) : 0 }));
  }
  return exportRows(rows, timezone).map(({ Operator, ...record }) => ({ ...record, 'Completed By': Operator }));
};

const summaryFrom = (rows, stats) => ({
  Events: stats?.total ?? rows.length,
  'Boxes packed': stats?.boxes ?? rows.reduce((sum, row) => sum + (Number(row.boxNumber) || 0), 0),
  'Needs review': stats?.review ?? rows.filter((row) => row.status === 'review').length,
  'Average cycle (sec)': stats?.avgTime ?? (rows.length ? Math.round(rows.reduce((sum, row) => sum + (Number(row.timeTakenSec) || 0), 0) / rows.length) : 0),
});

const styleRange = (sheet, range, style) => {
  const decoded = XLSX.utils.decode_range(range);
  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      if (sheet[address]) sheet[address].s = { ...(sheet[address].s || {}), ...style };
    }
  }
};

const imageDataUrl = async (url) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const downloadBoxPackingXlsx = (rows = [], options = {}) => {
  const timezone = options.timezone || 'Asia/Kolkata';
  const reportTitle = options.title || 'Box Packing Alert Logs';
  const periodLabel = options.periodLabel || 'Selected period';
  const filenamePrefix = options.filenamePrefix || 'box-packing-alert-report';
  const reportType = options.reportType || 'total';
  const records = reportRecords(rows, timezone, reportType);
  const summary = summaryFrom(rows);
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
  summarySheet['!cols'] = [{ wch: 24 }, { wch: 20 }];
  styleRange(summarySheet, 'A1:B1', { fill: { fgColor: { rgb: '4F46E5' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 }, alignment: { vertical: 'center' } });
  styleRange(summarySheet, 'A5:B5', { fill: { fgColor: { rgb: 'E0E7FF' } }, font: { bold: true, color: { rgb: '1E1B4B' } }, border: { bottom: { style: 'thin', color: { rgb: 'CBD5E1' } } } });
  styleRange(summarySheet, 'A6:B9', { border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } } });
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const sheet = XLSX.utils.json_to_sheet(records);
  const headers = Object.keys(records[0] || { 'Log ID': '', 'Box ID': '', 'Completed By': '', Zone: '', Boxes: '', 'Cycle (sec)': '', Status: '', Source: '', Camera: '', Time: '', Notes: '', Snapshot: '' });
  sheet['!cols'] = Object.keys(records[0] || {}).map((key) => ({ wch: Math.max(12, Math.min(30, key.length + 4)) }));
  sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(records.length + 1, 2)}` };
  sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' };
  styleRange(sheet, `A1:${XLSX.utils.encode_col(headers.length - 1)}1`, { fill: { fgColor: { rgb: '4F46E5' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { vertical: 'center', wrapText: true } });
  if (records.length) styleRange(sheet, `A2:${XLSX.utils.encode_col(headers.length - 1)}${records.length + 1}`, { border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } }, alignment: { vertical: 'center' } });
  records.forEach((record, index) => {
    if (reportType !== 'total' && reportType !== 'review') return;
    const rowNumber = index + 2;
    styleRange(sheet, `A${rowNumber}:L${rowNumber}`, { fill: { fgColor: { rgb: index % 2 ? 'F8FAFC' : 'FFFFFF' } } });
    const statusCell = sheet[`G${rowNumber}`];
    if (statusCell) statusCell.s = { ...(statusCell.s || {}), font: { bold: true, color: { rgb: record.Status === 'Completed' ? '047857' : 'B45309' } } };
    const snapshotCell = sheet[`L${rowNumber}`];
    if (snapshotCell && record.Snapshot) {
      snapshotCell.v = 'Open snapshot';
      snapshotCell.l = { Target: record.Snapshot, Tooltip: 'Open camera snapshot' };
      snapshotCell.s = { ...(snapshotCell.s || {}), font: { color: { rgb: '2563EB' }, underline: 'single' } };
    } else if (snapshotCell) snapshotCell.v = 'No snapshot';
  });
  XLSX.utils.book_append_sheet(workbook, sheet, 'Packing Logs');
  XLSX.writeFile(workbook, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const downloadBoxPackingCsv = (rows = []) => {
  const worksheet = XLSX.utils.json_to_sheet(exportRows(rows));
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
  const records = reportRecords(rows, timezone, reportType);
  const summary = summaryFrom(rows, stats);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setProperties({ title: reportTitle, subject: `Packing activity report · ${periodLabel}`, author: 'VideoiraQ' });
  const split = pageWidth * 0.75;
  doc.setFillColor(105, 139, 232); doc.rect(0, 0, split, 30, 'F');
  doc.setFillColor(151, 79, 224); doc.rect(split, 0, pageWidth - split, 30, 'F');
  const logo = await imageDataUrl(logoUrl);
  if (logo) doc.addImage(logo, 'PNG', 14, 7, 38, 16, undefined, 'FAST');
  else { doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('VideoiraQ', 14, 18); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(reportTitle, pageWidth - 14, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(periodLabel, pageWidth - 14, 29, { align: 'right' });
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Packing activity, zone comparison and review totals', 14, 39);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text(`Generated ${formatDate(new Date(), timezone)} · ${timezone}`, 14, 46);
  const cards = [['EVENTS', summary.Events, BLUE], ['BOXES PACKED', summary['Boxes packed'], [5, 150, 105]], ['NEEDS REVIEW', summary['Needs review'], [217, 119, 6]], ['AVG CYCLE', `${summary['Average cycle (sec)']} sec`, [126, 34, 206]]];
  const cardWidth = (pageWidth - 28 - 18) / 4;
  cards.forEach(([cardLabel, value, color], index) => {
    const x = 14 + index * (cardWidth + 6);
    doc.setFillColor(248, 250, 252); doc.setDrawColor(...BORDER); doc.roundedRect(x, 52, cardWidth, 16, 2, 2, 'FD');
    doc.setFillColor(...color); doc.circle(x + 6, 58, 1.1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...MUTED); doc.text(cardLabel, x + 10, 59);
    doc.setFontSize(13); doc.setTextColor(...INK); doc.text(String(value), x + 6, 65);
  });
  const headers = Object.keys(records[0] || { 'Log ID': '', 'Box ID': '', 'Completed By': '', Zone: '', Boxes: '', 'Cycle (sec)': '', Status: '', Source: '', Camera: '', Time: '', Snapshot: '', Notes: '' });
  if (reportType !== 'total' && reportType !== 'review') {
    autoTable(doc, { startY: 76, margin: { left: 14, right: 14 }, head: [headers], body: records.map((row) => headers.map((key) => String(row[key] ?? ''))), theme: 'grid', styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, textColor: INK, lineColor: BORDER, lineWidth: 0.15 }, headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 250, 252] }, didDrawPage: (data) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text('VideoiraQ · Box Packing QC', 14, doc.internal.pageSize.getHeight() - 8); doc.text(`Page ${data.pageNumber}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' }); } });
    doc.save(`${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }
  autoTable(doc, {
    startY: 76, margin: { left: 14, right: 14 }, head: [headers],
    body: records.map((row) => [row['Log ID'], row['Box ID'], row['Completed By'], row.Zone, row.Boxes, row['Cycle (sec)'], row.Status, row.Source, row.Camera, row.Time, row.Snapshot ? 'Open snapshot' : 'No snapshot', row.Notes]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.2, cellPadding: 2.5, textColor: INK, lineColor: BORDER, lineWidth: 0.15, valign: 'middle' },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, cellPadding: 2.8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 29 }, 1: { cellWidth: 24 }, 2: { cellWidth: 23 }, 3: { cellWidth: 23 }, 4: { cellWidth: 12, halign: 'right' }, 5: { cellWidth: 15, halign: 'right' }, 6: { cellWidth: 22 }, 7: { cellWidth: 23 }, 8: { cellWidth: 23 }, 9: { cellWidth: 29 }, 10: { cellWidth: 25, textColor: [37, 99, 235] }, 11: { cellWidth: 'auto' } },
    didParseCell: (data) => { if (data.section === 'body' && data.column.index === 6) data.cell.styles.textColor = data.cell.raw === 'Completed' ? [4, 120, 87] : [180, 83, 9]; },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 10) {
        const target = records[data.row.index]?.Snapshot;
        if (target) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: target });
      }
    },
    didDrawPage: (data) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text('VideoiraQ · Box Packing QC', 14, doc.internal.pageSize.getHeight() - 8); doc.text(`Page ${data.pageNumber}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' }); },
  });
  doc.save(`${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
};
