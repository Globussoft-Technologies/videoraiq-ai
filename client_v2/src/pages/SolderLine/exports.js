import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const snapshotLink = (value) => typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;

/** rows: array of plain objects; the keys of the first row become the header. */
export function buildReportWorkbook(rows) {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, /^P\d+$/.test(key) && ['Soldered', 'Missed'].includes(value) ? `${value === 'Soldered' ? '\u2713' : '\u2715'} ${value}` : value]))));
  const snapshotColumn = rows.length ? Object.keys(rows[0]).indexOf('Snapshot') : -1;
  if (snapshotColumn >= 0) rows.forEach((row, index) => {
    const url = snapshotLink(row.Snapshot);
    sheet[XLSX.utils.encode_cell({ r: index + 1, c: snapshotColumn })] = {
      t: 's', v: url ? 'View snapshot' : 'No snapshot',
      ...(url ? { l: { Target: url, Tooltip: 'Open snapshot' } } : {}),
    };
  });
  XLSX.utils.book_append_sheet(wb, sheet, 'Report');
  return wb;
}

export function downloadXlsx(rows, filename) {
  XLSX.writeFile(buildReportWorkbook(rows), `${filename}.xlsx`);
}

export function buildReportPdfDocument({ title, subtitle, rows }) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(subtitle, 14, 22);
  const head = rows.length ? Object.keys(rows[0]) : [];
  autoTable(doc, {
    startY: 27,
    head: [head],
    body: rows.map((r) => head.map((k) => String(r[k] ?? ''))),
    styles: { fontSize: 8 },
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: head.length ? 0 : undefined,
    headStyles: { fillColor: [59, 130, 246] },
    didParseCell: (data) => {
      if (data.section === 'body' && /^P\d+$/.test(head[data.column.index])) {
        const status = rows[data.row.index][head[data.column.index]];
        if (['Soldered', 'Missed'].includes(status)) {
          data.cell.styles.textColor = status === 'Soldered' ? [15, 118, 110] : [185, 28, 28];
          data.cell.styles.fillColor = status === 'Soldered' ? [230, 250, 241] : [255, 239, 239];
          data.cell.styles.cellPadding = { left: 6, right: 2, top: 3, bottom: 3 };
        }
      }
      if (data.section !== 'body' || head[data.column.index] !== 'Snapshot') return;
      const url = snapshotLink(rows[data.row.index].Snapshot);
      data.cell.text = [url ? 'View snapshot' : 'No snapshot'];
      if (url) data.cell.styles.textColor = [59, 130, 246];
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && /^P\d+$/.test(head[data.column.index])) {
        const status = rows[data.row.index][head[data.column.index]];
        if (['Soldered', 'Missed'].includes(status)) {
          const x = data.cell.x + 2, y = data.cell.y + 3;
          doc.setDrawColor(...(status === 'Soldered' ? [15, 118, 110] : [185, 28, 28]));
          doc.setLineWidth(0.5);
          if (status === 'Soldered') { doc.line(x, y + 1, x + 1, y + 2); doc.line(x + 1, y + 2, x + 3, y); }
          else { doc.line(x, y, x + 2, y + 2); doc.line(x + 2, y, x, y + 2); }
        }
      }
      if (data.section !== 'body' || head[data.column.index] !== 'Snapshot') return;
      const url = snapshotLink(rows[data.row.index].Snapshot);
      if (url) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
    },
  });
  return doc;
}

export function downloadPdf({ title, subtitle, rows, filename }) {
  return buildReportPdfDocument({ title, subtitle, rows }).save(`${filename}.pdf`, { returnPromise: true });
}
