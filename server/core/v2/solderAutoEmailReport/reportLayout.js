import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

const COLORS = { navy: '#163a8a', teal: '#0f766e', ink: '#1e293b', muted: '#64748b', border: '#dce3ef', pale: '#f3f6fc', red: '#b91c1c' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const numberText = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
export const displayValue = (value) => typeof value === 'number' ? (Number.isFinite(value) ? numberText.format(value) : '—') : String(value ?? '—');
const snapshotLink = (value) => typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
const snapshotText = (value) => snapshotLink(value) ? 'View snapshot' : 'No snapshot';

/** Comparison reads as metrics down the page, operators across the columns. */
export function reportTable(rows) {
  if (!rows.length) return { headers: [], rows: [] };
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (headers.includes('Presence (%)') && headers.includes('Operator')) {
    return { headers: ['Metric', ...rows.map((row) => String(row.Operator))],
      rows: headers.filter((key) => key !== 'Operator').map((key) => [key, ...rows.map((row) => row[key] ?? '—')]) };
  }
  return { headers, rows: rows.map((row) => headers.map((key) => row[key] ?? '—')) };
}

/** Split wide hourly reports into readable tables, repeating the identifying column. */
function columnGroups(headers, maxColumns = 6) {
  if (headers.length <= maxColumns) return [headers.map((_, i) => i)];
  const groups = [];
  for (let i = 1; i < headers.length; i += maxColumns - 1) {
    groups.push([0, ...headers.slice(i, i + maxColumns - 1).map((_, k) => i + k)]);
  }
  return groups;
}

export function buildReportPdf(rows, title, subtitle) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    try {
      const table = reportTable(rows), groups = columnGroups(table.headers);
      const left = 30, width = doc.page.width - 60;
      const bottom = doc.page.height - 54;
      let y;
      const banner = (part) => {
        doc.roundedRect(left, 26, width, 66, 6).fill(COLORS.navy);
        doc.font('Helvetica-Bold').fontSize(17).fillColor('#ffffff').text('VideoraIQ', left + 16, 39, { width: 110, lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor('#c9d9ff').text('SOLDER LINE REPORT', left + 16, 65, { width: 130, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(15).fillColor('#ffffff').text(title, left + 158, 39, { width: width - 176, height: 40, ellipsis: true });
        doc.rect(left, 88, width, 4).fill(COLORS.teal);
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(subtitle, left, 104, { width, height: 32, ellipsis: true });
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text(`${rows.length} report record${rows.length === 1 ? '' : 's'}${groups.length > 1 ? `  |  Table ${part + 1} of ${groups.length}` : ''}`, left, 141, { lineBreak: false });
        y = 163;
      };
      groups.forEach((indices, part) => {
        if (part) doc.addPage();
        banner(part);
        if (!table.rows.length) {
          doc.roundedRect(left, y, width, 50, 5).fill(COLORS.pale);
          doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted).text('No records for this period.', left + 16, y + 17);
          return;
        }
        const weights = indices.map((index, i) => i === 0 ? 1.5 : /Operator|Condition|Time|Started|Returned/.test(table.headers[index]) ? 1.4 : 1);
        const totalWeight = weights.reduce((sum, n) => sum + n, 0);
        const widths = weights.map((n) => width * n / totalWeight);
        const cellText = (value) => { const text = displayValue(value); return text.length > 300 ? `${text.slice(0, 297)}...` : text; };
        const drawRow = (values, header = false, rowIndex = 0) => {
          doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 9 : 8.5);
          const texts = values.map((value, i) => !header && table.headers[indices[i]] === 'Snapshot' ? snapshotText(value) : cellText(value));
          const height = Math.max(header ? 36 : 30, ...texts.map((text, i) => doc.heightOfString(text, { width: widths[i] - 16 }) + 18));
          if (!header && y + height > bottom) {
            doc.addPage(); banner(part); drawRow(indices.map((i) => table.headers[i]), true);
          }
          let x = left;
          texts.forEach((text, i) => {
            doc.rect(x, y, widths[i], height).fillAndStroke(header ? COLORS.navy : rowIndex % 2 ? COLORS.pale : '#ffffff', COLORS.border);
            const sourceHeader = table.headers[indices[i]];
            const url = !header && sourceHeader === 'Snapshot' ? snapshotLink(values[i]) : null;
            const missed = !header && (sourceHeader === 'Missed points' || / missed$/.test(sourceHeader) || values[0] === 'Missed points') && Number(values[i]) > 0;
            const point = !header && /^P\d+$/.test(sourceHeader) && ['Soldered', 'Missed'].includes(values[i]);
            if (point) {
              const done = values[i] === 'Soldered', px = x + 9, py = y + 11;
              doc.roundedRect(x + 4, y + 4, widths[i] - 8, height - 8, 4).fill(done ? '#e6faf1' : '#ffefef');
              doc.save().strokeColor(done ? COLORS.teal : COLORS.red).lineWidth(1.5);
              if (done) doc.moveTo(px, py + 3).lineTo(px + 3, py + 6).lineTo(px + 8, py).stroke();
              else { doc.moveTo(px, py).lineTo(px + 6, py + 6).stroke(); doc.moveTo(px + 6, py).lineTo(px, py + 6).stroke(); }
              doc.restore();
            }
            doc.font(header || i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 9 : 8.5)
              .fillColor(header ? '#ffffff' : point ? values[i] === 'Soldered' ? COLORS.teal : COLORS.red : url ? COLORS.navy : missed ? COLORS.red : COLORS.ink)
              .text(text, x + (point ? 23 : 8), y + 9, { width: widths[i] - (point ? 31 : 16), height: height - 16, ellipsis: true, ...(url ? { link: url, underline: true } : {}) });
            x += widths[i];
          });
          y += height;
        };
        drawRow(indices.map((i) => table.headers[i]), true);
        table.rows.forEach((row, index) => drawRow(indices.map((i) => row[i]), false, index));
      });
      const pages = doc.bufferedPageRange();
      for (let i = pages.start; i < pages.start + pages.count; i++) {
        doc.switchToPage(i);
        // Footers sit below the content margin; don't let PDFKit add a page.
        doc.page.margins.bottom = 0;
        doc.moveTo(left, doc.page.height - 39).lineTo(left + width, doc.page.height - 39).strokeColor(COLORS.border).stroke();
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text('VideoraIQ | Automatically generated report', left, doc.page.height - 30, { lineBreak: false });
        doc.text(`Page ${i + 1} of ${pages.count}`, left, doc.page.height - 30, { width, align: 'right', lineBreak: false });
        doc.page.margins.bottom = 30;
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}

export async function buildReportXlsx(rows, title, subtitle) {
  const table = reportTable(rows), workbook = new ExcelJS.Workbook();
  workbook.creator = 'VideoraIQ';
  const sheet = workbook.addWorksheet('Report', { views: [{ state: 'frozen', ySplit: 4 }] });
  const columns = Math.max(1, table.headers.length);
  sheet.addRow([title]); sheet.mergeCells(1, 1, 1, columns); sheet.getRow(1).height = 32;
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163A8A' } };
  sheet.addRow([subtitle]); sheet.mergeCells(2, 1, 2, columns); sheet.getRow(2).height = 32;
  sheet.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  sheet.getCell('A2').font = { color: { argb: 'FF64748B' }, size: 10 };
  sheet.addRow([]);
  if (table.rows.length) {
    const header = sheet.addRow(table.headers); header.height = 32;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163A8A' } };
      cell.alignment = { wrapText: true, vertical: 'middle' };
    });
    table.rows.forEach((values, index) => {
      const row = sheet.addRow(values.map((value, column) => table.headers[column] === 'Snapshot'
        ? snapshotLink(value) ? { text: 'View snapshot', hyperlink: value } : 'No snapshot'
        : /^P\d+$/.test(table.headers[column]) && ['Soldered', 'Missed'].includes(value) ? `${value === 'Soldered' ? '\u2713' : '\u2715'} ${value}` : value));
      row.height = Math.max(30, ...values.map(value => String(value ?? '').split('\n').length * 16 + 12));
      row.eachCell((cell, column) => {
        cell.alignment = { wrapText: true, vertical: 'middle' };
        cell.font = { color: { argb: cell.value?.hyperlink ? 'FF163A8A' : 'FF1E293B' }, size: 11, ...(cell.value?.hyperlink ? { underline: true } : {}) };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? 'FFF3F6FC' : 'FFFFFFFF' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFDCE3EF' } } };
        if (/^P\d+$/.test(table.headers[column - 1]) && ['Soldered', 'Missed'].includes(values[column - 1])) {
          const done = values[column - 1] === 'Soldered';
          cell.font.color = { argb: done ? 'FF0F766E' : 'FFB91C1C' };
          cell.fill.fgColor = { argb: done ? 'FFE6FAF1' : 'FFFFEFEF' };
        }
        if (typeof cell.value === 'number') cell.numFmt = '#,##0.##';
      });
    });
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns } };
  } else sheet.addRow(['No records for this period.']);
  sheet.columns.forEach((column, i) => { column.width = i === 0 ? 30 : 25; });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildEmailHtml(rows, title, subtitle, formats) {
  const table = reportTable(rows), preview = table.rows.slice(0, 10);
  const groups = columnGroups(table.headers, 4);
  const cellHtml = (row, column) => {
    if (/^P\d+$/.test(table.headers[column]) && ['Soldered', 'Missed'].includes(row[column])) {
      const done = row[column] === 'Soldered';
      return `<span style="display:inline-block;padding:6px 10px;border-radius:5px;background:${done ? '#e6faf1' : '#ffefef'};color:${done ? COLORS.teal : COLORS.red};">${done ? '&#10003;' : '&#10005;'} ${row[column]}</span>`;
    }
    if (table.headers[column] !== 'Snapshot') return escapeHtml(displayValue(row[column])).replace(/\n/g, '<br>');
    const url = snapshotLink(row[column]);
    if (!url) return 'No snapshot';
    const escaped = escapeHtml(url);
    return `<a href="${escaped}" aria-label="Open incident snapshot" style="color:${COLORS.navy};"><img src="${escaped}" alt="Incident snapshot" width="48" height="30" style="display:block;max-width:100%;object-fit:cover;border-radius:4px;"></a>`;
  };
  const htmlTables = !preview.length ? '<p style="color:#64748b;">No records for this period.</p>' : groups.map((indices) => `
    <table aria-label="Report data" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;table-layout:fixed;">
      <thead><tr>${indices.map((i) => `<th scope="col" bgcolor="${COLORS.navy}" style="padding:12px 10px;color:#ffffff;font-size:12px;text-align:left;word-wrap:break-word;border:1px solid ${COLORS.border};">${escapeHtml(table.headers[i])}</th>`).join('')}</tr></thead>
      <tbody>${preview.map((row, index) => `<tr>${indices.map((i) => `<td bgcolor="${index % 2 ? COLORS.pale : '#ffffff'}" style="padding:11px 10px;border:1px solid ${COLORS.border};font-size:12px;color:${COLORS.ink};vertical-align:top;word-wrap:break-word;">${cellHtml(row, i)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:0;background:#eef2fa;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2fa"><tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="680" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:680px;border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;">
      <tr><td bgcolor="${COLORS.navy}" style="padding:26px 28px;background:linear-gradient(120deg,#163a8a,#112c69);color:#ffffff;">
        <table role="presentation" width="100%"><tr><td style="font-size:23px;font-weight:bold;color:#ffffff;">VideoraIQ</td><td align="right" style="font-size:12px;letter-spacing:1px;color:#d8e5ff;">SOLDER LINE REPORT</td></tr></table>
      </td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 12px;font-size:25px;line-height:1.3;color:${COLORS.ink};">${escapeHtml(title)}</h1>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.7;color:${COLORS.muted};">${escapeHtml(subtitle)}</p>
        <table role="presentation" width="100%" bgcolor="${COLORS.pale}" style="border:1px solid ${COLORS.border};border-radius:12px;margin-bottom:24px;"><tr><td style="padding:18px;color:${COLORS.navy};font-size:14px;"><strong style="font-size:24px;">${rows.length}</strong>&nbsp; report record${rows.length === 1 ? '' : 's'} included.</td></tr></table>
        <h2 style="font-size:14px;color:${COLORS.ink};margin:0 0 12px;">Report overview</h2>
        ${htmlTables}
        ${table.rows.length > preview.length ? '<p style="font-size:12px;color:#64748b;">Showing the first 10 rows. The attachments contain the complete report.</p>' : ''}
        <h2 style="font-size:12px;letter-spacing:1.5px;color:${COLORS.muted};margin:24px 0 12px;">ATTACHED REPORTS</h2>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>${formats.map((format) => `<td style="padding:0 10px 10px 0;"><span style="display:inline-block;padding:12px 18px;border-radius:8px;background:${format === 'pdf' ? COLORS.navy : COLORS.teal};color:#ffffff;font-size:13px;font-weight:bold;">${format === 'pdf' ? 'PDF report attached' : 'Excel report attached'}</span></td>`).join('')}</tr></table>
        <p style="margin:4px 0 0;font-size:12px;color:${COLORS.muted};">Open or save the attached files to view the full report.</p>
      </td></tr>
      <tr><td bgcolor="${COLORS.pale}" style="padding:20px 28px;border-top:1px solid ${COLORS.border};font-size:12px;color:${COLORS.muted};line-height:1.7;">This is an automated email. Please do not reply.<br>Generated automatically by <strong style="color:${COLORS.navy};">VideoraIQ</strong>.</td></tr>
      <tr><td height="4" bgcolor="${COLORS.teal}"></td></tr>
    </table>
    <p style="font-size:11px;color:#8a99b1;margin-top:18px;">VideoraIQ · Smart Surveillance Powered by AI</p>
  </td></tr></table></body></html>`;
}
