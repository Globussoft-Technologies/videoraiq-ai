import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment-timezone';
import { toast } from 'sonner';
import logoUrl from '@/assets/videoraiq-logo-white.png';
import { STATUS_META } from './data';

const FILE_BASE = 'qc-measurement';
const REPORT_TITLE = 'Mattress Measurement Logs';

// Filename date only (no time / id) — e.g. qc-measurement-2026-09-07.pdf
const stamp = () => moment().format('YYYY-MM-DD');
const generatedAt = () => moment().format('DD/MM/YYYY hh:mm A');

// Column order matches the on-screen Measurement Records table. jsPDF's built-in
// Helvetica has no glyphs for Δ / × / ″, so the header labels stay ASCII-only;
// the CSV / XLSX exports reuse the same list for consistency.
const HEADERS = [
  '#', 'Order', 'Order Item', 'Ref', 'SKU', 'Model',
  'Printed LxWxH (in)', 'Measured LxWxH (in)', 'Measured raw (DS)', 'Unit',
  'Dev L (in)', 'Dev W (in)', 'Dev H (in)',
  'Confidence', 'Match %', 'Station', 'When', 'Result', 'Snapshot', 'Measurement Image',
];

// The MATCH column on screen shows a match score (100 = on the label, 0 = at or
// past tolerance). devFrac is the worst axis as a fraction of its tolerance.
const matchPct = (r) => {
  if (!Number.isFinite(r.devFrac)) return r.devPct === 'QR unread' ? 'QR unread' : '—';
  return `${Math.max(0, Math.round(100 - r.devFrac * 100))}%`;
};

// Absolute snapshot link — server now resolves this; fall back across fields.
const snapshotUrl = (r) => r.shotUrl || r.shot || r.qrImageUrl || r.measurementImageUrl || '';

// Absolute link to the DS measurement frame specifically (distinct from the
// QR-cam capture above — a reviewer may need either one).
const measurementImageUrl = (r) => r.measurementImageUrl || '';

// Text shown for the snapshot / measurement-image columns when a link is present.
const SNAP_LINK_TEXT = 'View image';

// Helvetica (jsPDF default) can't render these — swap for ASCII when ascii=true.
const ascii = (v) =>
  String(v ?? '')
    .replace(/[×✕]/g, 'x')
    .replace(/[″"]/g, 'in')
    .replace(/±/g, '+/-')
    .replace(/[–—]/g, '-')
    .replace(/Δ/g, 'd');

const linkCell = (url, snap) => {
  if (!url) return '—';
  return snap === 'hyperlink'
    ? `=HYPERLINK("${url.replace(/"/g, '""')}","${SNAP_LINK_TEXT}")`
    : SNAP_LINK_TEXT;
};

// `snap` decides the last two columns' shape:
//   'text'      → "View image" / "—"        (PDF, and XLSX which adds the link separately)
//   'hyperlink' → =HYPERLINK("url","View image")  (CSV — Excel/Sheets render this
//                 as a clickable "View image"; opens the snapshot on click)
const toRow = (r, i, { asAscii = false, snap = 'text' } = {}) => {
  const cells = [
    i + 1,
    r.orderId, r.orderItem, r.refNo, r.sku, r.model,
    r.declared, r.measured, r.measuredRaw || '—', r.measuredUnit || '—',
    r.devL, r.devB, r.devH,
    r.confidence != null ? Number(r.confidence).toFixed(2) : '—',
    matchPct(r), r.station, r.dateTime || r.time,
    STATUS_META[r.status]?.label || r.status,
    linkCell(snapshotUrl(r), snap),
    linkCell(measurementImageUrl(r), snap),
  ];
  return asAscii ? cells.map(ascii) : cells;
};

// Shift-level summary line shown under the title in every format.
const summaryNote = (rows) => {
  const pass = rows.filter((r) => r.status === 'pass').length;
  const mismatch = rows.filter((r) => r.status === 'mismatch').length;
  const qrErr = rows.filter((r) => r.status === 'qrerr').length;
  return `${rows.length} records  |  ${pass} pass  |  ${mismatch} mismatch  |  ${qrErr} QR error`;
};

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/* ─────────────── CSV ─────────────── */

const exportCSV = (rows) => {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ['VideoraIQ'],
    [REPORT_TITLE],
    [summaryNote(rows)],
    [`Generated on ${generatedAt()}`],
    [],
    HEADERS,
    ...rows.map((r, i) => toRow(r, i, { snap: 'hyperlink' })),
  ].map((cols) => cols.map(esc).join(','));
  const filename = `${FILE_BASE}-${stamp()}.csv`;
  triggerDownload(
    new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    filename,
  );
  return filename;
};

/* ─────────────── Excel ─────────────── */

const exportXLSX = (rows) => {
  const pad = new Array(HEADERS.length - 1).fill('');
  const aoa = [
    ['VIDEORAIQ', ...pad],
    [REPORT_TITLE, ...pad],
    [summaryNote(rows), ...pad],
    [`Generated on ${generatedAt()}`, ...pad],
    [],
    HEADERS,
    ...rows.map((r, i) => toRow(r, i)), // snap: 'text' → "View image" placeholder
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: HEADERS.length - 1 } }));
  ws['!cols'] = HEADERS.map((h) =>
    h === 'Snapshot' || h === 'Measurement Image' ? { wch: 16 } : { wch: Math.max(h.length + 2, 12) },
  );

  // Turn the "View image" placeholders into real hyperlink cells.
  const headerRow = 5; // rows 0-4 are the banner, row 5 = HEADERS
  const linkCols = [
    { col: HEADERS.indexOf('Snapshot'), urlOf: snapshotUrl, tooltip: 'Open snapshot' },
    { col: HEADERS.indexOf('Measurement Image'), urlOf: measurementImageUrl, tooltip: 'Open measurement image' },
  ];
  rows.forEach((r, i) => {
    linkCols.forEach(({ col, urlOf, tooltip }) => {
      const url = urlOf(r);
      if (!url) return;
      const addr = XLSX.utils.encode_cell({ r: headerRow + 1 + i, c: col });
      ws[addr] = {
        t: 's',
        v: SNAP_LINK_TEXT,
        l: { Target: url, Tooltip: tooltip },
        s: { font: { color: { rgb: '2563EB' }, underline: true } },
      };
    });
  });

  const filename = `${FILE_BASE}-${stamp()}.xlsx`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Measurement Records');
  XLSX.writeFile(wb, filename);
  return filename;
};

/* ─────────────── PDF ─────────────── */

const RESULT_FILL = {
  Pass: [34, 197, 94],
  Mismatch: [255, 77, 77],
  'QR Error': [245, 166, 35],
};

const imageToDataUrl = (url) =>
  new Promise((resolve, reject) => {
    fetch(url)
      .then((res) => res.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
      .catch(reject);
  });

// Branded report header — mirrors Vehicle Check-In/Out and the other log
// exports: deep-purple band, white VideoraIQ logo, divider, title + subtitle.
const drawReportHeader = async (doc, title, subtitle) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(38, 17, 105);
  doc.roundedRect(8, 7, pageWidth - 16, 30, 2, 2, 'F');
  doc.setFillColor(27, 18, 92);
  doc.triangle(8, 7, 92, 7, 8, 37, 'F');

  try {
    const logoDataUrl = await imageToDataUrl(logoUrl);
    doc.addImage(logoDataUrl, 'PNG', 17, 17, 50, 11);
  } catch {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('VideoraIQ', 18, 24);
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
  doc.text(subtitle, 82, 27);
  doc.setTextColor(0, 0, 0);
};

const exportPDF = async (rows) => {
  const doc = new jsPDF('landscape');
  await drawReportHeader(
    doc,
    REPORT_TITLE,
    `${summaryNote(rows)}  |  Generated on ${generatedAt()}`,
  );

  const snapCol = HEADERS.indexOf('Snapshot');
  const measImgCol = HEADERS.indexOf('Measurement Image');
  const resultCol = HEADERS.indexOf('Result');

  autoTable(doc, {
    head: [HEADERS],
    body: rows.map((r, i) => toRow(r, i, { asAscii: true })), // "View image" placeholder
    startY: 44,
    margin: { left: 8, right: 8 },
    styles: {
      fontSize: 5.8,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [47, 111, 208],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 5.6,
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 6, halign: 'center' },   // #
      9: { halign: 'center' },                 // Unit
      10: { halign: 'center' },                // Dev L
      11: { halign: 'center' },                // Dev W
      12: { halign: 'center' },                // Dev H
      13: { halign: 'center' },                // Confidence
      14: { halign: 'center' },                // Match %
      [snapCol]: { cellWidth: 16, halign: 'center', textColor: [37, 99, 235] }, // Snapshot
      [measImgCol]: { cellWidth: 16, halign: 'center', textColor: [37, 99, 235] }, // Measurement Image
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === resultCol) {
        const fill = RESULT_FILL[data.cell.raw];
        if (fill) {
          data.cell.styles.textColor = fill;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawCell: (data) => {
      // Turn the "View image" cells into clickable links. A bad/oversized URL
      // (or any jsPDF annotation quirk) must never abort the whole export —
      // the table has already been drawn by this point, so just skip the link.
      if (data.section !== 'body') return;
      try {
        let url;
        if (data.column.index === snapCol) url = snapshotUrl(rows[data.row.index]);
        else if (data.column.index === measImgCol) url = measurementImageUrl(rows[data.row.index]);
        else return;
        if (!url) return;
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
      } catch (err) {
        console.error('Measurement PDF: failed to link snapshot cell', err);
      }
    },
  });

  const filename = `${FILE_BASE}-${stamp()}.pdf`;
  doc.save(filename);
  return filename;
};

// Toast copy matches the design: "<what> · <n> records → <file>".
const TOAST_VERB = {
  pdf: 'PDF generated',
  xlsx: 'Excel workbook exported',
  csv: 'CSV exported',
};

/** Entry point for the toolbar / Download Report buttons. */
export const exportMeasurementRecords = async (format, rows) => {
  if (!rows?.length) {
    toast.error('No records match the current filters');
    return;
  }
  try {
    if (format === 'csv') exportCSV(rows);
    else if (format === 'xlsx') exportXLSX(rows);
    else if (format === 'pdf') await exportPDF(rows);

    const count = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    toast.success(`${TOAST_VERB[format]} · ${count}`);
  } catch (err) {
    // Log defensively — some bundlers/consoles collapse a bare `console.error(err)`
    // for non-Error rejections (e.g. a rejected fetch with no message), so also
    // surface the message/stack explicitly.
    console.error('Measurement export failed:', err?.message || err, err?.stack || '');
    const detail = err?.message ? ` — ${err.message}` : '';
    toast.error(`Failed to export ${format.toUpperCase()}${detail}`);
  }
};
