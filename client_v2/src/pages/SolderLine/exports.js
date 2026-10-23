import XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import logoUrl from '@/assets/videoraiq-logo-color.png';
import { readPackingPdfImage } from '@/pages/BoxPackingLogs/packingPdfImages';

const snapshotLink = (value) => typeof value === 'string' && /^(https?:\/\/|\/|data:image\/)/i.test(value) ? value : null;

export const formatExportDates = ({ startDate, endDate } = {}) =>
  startDate && endDate && startDate !== endDate ? `${startDate} - ${endDate}` : startDate || endDate || '';

/** rows: array of plain objects; the keys of the first row become the header. */
export function buildReportWorkbook(rows, { title = 'Solder Line Report', subtitle = '' } = {}) {
  const wb = XLSX.utils.book_new();
  const head = rows.length ? Object.keys(rows[0]) : [];
  const recordCount = rows.filter(row => row[head[0]] !== 'TOTAL').length;
  const sheet = XLSX.utils.aoa_to_sheet([
    ['VIDEO RAIQ / SOLDER LINE'], [title], [subtitle],
    [`${recordCount} record${recordCount === 1 ? '' : 's'}`], [], head,
    ...rows.map(row => head.map(key => /^P\d+$/.test(key) && ['Soldered', 'Missed'].includes(row[key]) ? `${row[key] === 'Soldered' ? '\u2713' : '\u2715'} ${row[key]}` : row[key] ?? '')),
  ]);
  if (head.length > 1) sheet['!merges'] = [0, 1, 2, 3].map(r => ({ s: { r, c: 0 }, e: { r, c: head.length - 1 } }));
  sheet.A1.s = { font: { bold: true, color: { rgb: '536CF0' }, sz: 10 } };
  sheet.A2.s = { font: { bold: true, color: { rgb: '182344' }, sz: 16 } };
  sheet.A3.s = sheet.A4.s = { font: { color: { rgb: '637391' }, sz: 10 } };
  const tableBorder = { left: { style: 'thin', color: { rgb: 'D9E0EE' } }, right: { style: 'thin', color: { rgb: 'D9E0EE' } }, bottom: { style: 'thin', color: { rgb: 'E6EAF2' } } };
  head.forEach((key, col) => { sheet[XLSX.utils.encode_cell({ r: 5, c: col })].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '536CF0' } }, alignment: { vertical: 'center' }, border: tableBorder }; });
  rows.forEach((row, index) => head.forEach((key, col) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: index + 6, c: col })];
    const isTotal = row[head[0]] === 'TOTAL';
    cell.s = { fill: { fgColor: { rgb: isTotal ? 'E7ECFF' : index % 2 ? 'FFFFFF' : 'F3F5FA' } }, font: { bold: isTotal, color: { rgb: row[key] === 'Missed' ? 'B91C1C' : row[key] === 'Soldered' ? '0F766E' : '182344' } }, alignment: { vertical: 'center', wrapText: true }, border: tableBorder };
  }));
  sheet['!cols'] = head.map(key => ({ wch: Math.max(16, Math.min(48, Math.max(key.length + 3, ...rows.slice(0, 100).map(row => String(row[key] ?? '').length + 2)))) }));
  sheet['!rows'] = [{ hpt: 22 }, { hpt: 30 }, { hpt: 20 }, { hpt: 20 }, { hpt: 10 }, { hpt: 25 }];
  if (head.length) sheet['!autofilter'] = { ref: `A6:${XLSX.utils.encode_col(head.length - 1)}${rows.length + 6}` };
  const snapshotColumn = rows.length ? Object.keys(rows[0]).indexOf('Snapshot') : -1;
  if (snapshotColumn >= 0) rows.forEach((row, index) => {
    const url = snapshotLink(row.Snapshot);
    const cell = sheet[XLSX.utils.encode_cell({ r: index + 6, c: snapshotColumn })];
    cell.v = url ? 'View snapshot' : 'No snapshot';
    if (url) { cell.l = { Target: url, Tooltip: 'Open snapshot' }; cell.s.font = { color: { rgb: '536CF0' }, underline: true }; }
  });
  XLSX.utils.book_append_sheet(wb, sheet, 'Report');
  return wb;
}

export function downloadXlsx(rows, filename, metadata) {
  XLSX.writeFile(buildReportWorkbook(rows, metadata), `${filename}.xlsx`);
}

export function buildReportPdfDocument({ title, subtitle, rows, logo = null }) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const head = rows.length ? Object.keys(rows[0]) : [];
  const recordCount = rows.filter(row => row[head[0]] !== 'TOTAL').length;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const drawHeader = () => {
    const stops = [[255, 228, 215], [248, 213, 239], [220, 219, 255], [200, 230, 255], [202, 240, 220]];
    const columns = 80;
    for (let column = 0; column < columns; column++) {
      const position = column / (columns - 1) * (stops.length - 1);
      const index = Math.min(stops.length - 2, Math.floor(position));
      const blend = position - index;
      doc.setFillColor(...stops[index].map((value, channel) => Math.round(value + (stops[index + 1][channel] - value) * blend)));
      doc.rect(column * pageWidth / columns, 0, pageWidth / columns + 0.05, 30, 'F');
    }
    doc.setFont('helvetica', 'bold');
    if (logo) {
      const props = doc.getImageProperties(logo);
      const scale = Math.min(38 / props.width, 16 / props.height);
      doc.addImage(logo, props.fileType, 14, 5, props.width * scale, props.height * scale, undefined, 'FAST');
    } else {
      doc.setTextColor(24, 35, 68);
      doc.setFontSize(13);
      doc.text('VideoiraQ', 14, 18);
    }
    doc.setTextColor(24, 35, 68);
    doc.setFontSize(12);
    doc.text(`JB Soldering Line Report - ${String(title || 'Overview')}`, pageWidth - 14, 13, { align: 'right', maxWidth: pageWidth - 80 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const bannerDetail = String(subtitle || '').split(/[|·]/).at(-1).trim();
    doc.setTextColor(48, 59, 94);
    doc.text(bannerDetail, pageWidth - 14, 25, { align: 'right', maxWidth: pageWidth - 80 });
    doc.setTextColor(24, 35, 68);
    doc.setFontSize(8.5);
    doc.text(String(subtitle || ''), 14, 39, { maxWidth: pageWidth - 28 });
  };
  const drawFooter = (pageNumber) => {
    doc.setTextColor(100, 116, 132);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${recordCount} record${recordCount === 1 ? '' : 's'}`, 14, pageHeight - 7);
    doc.text(`Page ${pageNumber}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  };
  autoTable(doc, {
    startY: 47,
    margin: { top: 16, bottom: 15, left: 14, right: 14 },
    head: [head],
    body: rows.map((r) => head.map((k) => String(r[k] ?? ''))),
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [24, 35, 68], lineColor: [225, 230, 240], lineWidth: 0.1, overflow: 'linebreak' },
    alternateRowStyles: { fillColor: [246, 247, 253] },
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: head.length ? 0 : undefined,
    headStyles: { fillColor: [91, 82, 218], textColor: [255, 255, 255], fontStyle: 'bold' },
    didDrawPage: (data) => {
      if (data.pageNumber === 1) drawHeader();
      drawFooter(data.pageNumber);
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.raw?.[0] === 'TOTAL') {
        data.cell.styles.fillColor = [232, 230, 252];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'body' && /^P\d+$/.test(head[data.column.index])) {
        const status = data.row.raw?.[data.column.index];
        if (['Soldered', 'Missed'].includes(status)) {
          data.cell.styles.textColor = status === 'Soldered' ? [15, 118, 110] : [185, 28, 28];
          data.cell.styles.fillColor = status === 'Soldered' ? [230, 250, 241] : [255, 239, 239];
          data.cell.styles.cellPadding = { left: 6, right: 2, top: 3, bottom: 3 };
        }
      }
      if (data.section !== 'body' || head[data.column.index] !== 'Snapshot') return;
      const url = snapshotLink(data.row.raw?.[data.column.index]);
      data.cell.text = [url ? 'View snapshot' : 'No snapshot'];
      if (url) data.cell.styles.textColor = [59, 130, 246];
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && /^P\d+$/.test(head[data.column.index])) {
        const status = data.row.raw?.[data.column.index];
        if (['Soldered', 'Missed'].includes(status)) {
          const x = data.cell.x + 2, y = data.cell.y + 3;
          doc.setDrawColor(...(status === 'Soldered' ? [15, 118, 110] : [185, 28, 28]));
          doc.setLineWidth(0.5);
          if (status === 'Soldered') { doc.line(x, y + 1, x + 1, y + 2); doc.line(x + 1, y + 2, x + 3, y); }
          else { doc.line(x, y, x + 2, y + 2); doc.line(x + 2, y, x, y + 2); }
        }
      }
      if (data.section !== 'body' || head[data.column.index] !== 'Snapshot') return;
      const url = snapshotLink(data.row.raw?.[data.column.index]);
      if (url) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
    },
  });
  return doc;
}

export async function downloadPdf({ title, subtitle, rows, filename }) {
  const logo = await readPackingPdfImage(logoUrl);
  return buildReportPdfDocument({ title, subtitle, rows, logo }).save(`${filename}.pdf`, { returnPromise: true });
}
