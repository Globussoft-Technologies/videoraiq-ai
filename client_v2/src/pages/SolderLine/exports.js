import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/** rows: array of plain objects; the keys of the first row become the header. */
export function downloadXlsx(rows, filename) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function downloadPdf({ title, subtitle, rows, filename }) {
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
    headStyles: { fillColor: [59, 130, 246] },
  });
  doc.save(`${filename}.pdf`);
}
