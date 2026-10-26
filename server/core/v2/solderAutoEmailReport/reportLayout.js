import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';

// Resolve the requested client asset from this module so it also works when
// the project is checked out or deployed in a different directory.
const LOGO_PATH = new URL('../../../../client_v2/src/assets/videoraiq-logo-color.png', import.meta.url);
export const LOGO_CID = 'solder-report-logo@videoraiq';

let logoPromise;
export const logoBuffer = () => {
  logoPromise ||= readFile(LOGO_PATH)
    .catch(() => { logoPromise = null; return null; });
  return logoPromise;
};
const reportHeading = (title) => `JB Soldering Line Report - ${String(title || 'Report').replace(/^Solder Line\s*[—-]\s*/i, '')}`;
const reportPeriod = (subtitle) => String(subtitle || '').split(/(?:·|Â·)/).at(-1).trim();
const reportPeriodDisplay = (subtitle) => {
  const value = String(subtitle || '');
  const separator = Math.max(value.lastIndexOf('\u00b7'), value.lastIndexOf('\u00c2\u00b7'), value.lastIndexOf('\u00c3\u201a\u00c2\u00b7'));
  return separator >= 0 ? value.slice(separator + 1).trim() : value.trim();
};
const headerStops = [[255, 228, 215], [248, 213, 239], [220, 219, 255], [200, 230, 255], [202, 240, 220]];
const headerColor = (fraction) => {
  const position = fraction * (headerStops.length - 1);
  const index = Math.min(headerStops.length - 2, Math.floor(position));
  return headerStops[index].map((value, channel) => Math.round(value + (headerStops[index + 1][channel] - value) * (position - index)));
};

const COLORS = { navy: '#5b52da', teal: '#0f766e', ink: '#182344', muted: '#637391', border: '#d9e0ee', pale: '#f3f5fa', red: '#b91c1c' };
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

// Incident-style summary email. The complete report stays behind the
// download links; the message body only carries the period and row count.
export function buildEmailHtml(rows, title, subtitle, formats, hasLogo = true, downloads = []) {
  const firstKey = rows.length ? Object.keys(rows[0])[0] : '';
  const count = rows.filter((row) => row[firstKey] !== 'TOTAL').length;
  const normalized = String(subtitle || '').replace(/\u00c3\u201a\u00c2\u00b7|\u00c2\u00b7/g, '\u00b7');
  const separator = normalized.lastIndexOf('\u00b7');
  const camera = separator >= 0 ? normalized.slice(0, separator).trim() : '';
  const period = separator >= 0 ? normalized.slice(separator + 1).trim() : normalized;
  const range = period.match(/^(.*) \(([^()]+)\)$/);
  const reportName = String(title || 'Report').replace(/^Solder Line\s*[-\u2013\u2014]\s*/i, '');
  const linked = downloads.length === formats.length && downloads.length > 0;
  const buttons = [...downloads].sort((a, b) => (a.format === 'pdf' ? -1 : 1) - (b.format === 'pdf' ? -1 : 1)).map(({ format, url }) => {
    const pdf = format === 'pdf';
    return `<td align="center" style="padding:0 8px 8px;"><a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:block;width:230px;padding:15px 0;border-radius:10px;background:${pdf ? '#173b8d' : '#0f766e'};border:1px solid ${pdf ? '#123476' : '#0b625c'};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;text-align:center;">&#8681;&nbsp; Download ${pdf ? 'PDF' : 'Excel'}</a></td>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:0;background:#eef2fa;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${count} solder report record${count === 1 ? '' : 's'} · ${escapeHtml(period)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2fa"><tr><td align="center" style="padding:28px 14px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${COLORS.border};box-shadow:0 10px 30px rgba(18,58,143,.10);">
        <tr><td bgcolor="#173b8d" style="background:#173b8d;background:linear-gradient(120deg,#173b8d,#123476);padding:26px 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle"><img src="${EMAIL_ICONS.shieldWhite}" width="24" height="24" alt="" style="vertical-align:-6px;border:0;"><span style="font-size:21px;font-weight:800;color:#ffffff;letter-spacing:.2px;margin-left:8px;">VideoraIQ</span></td><td valign="middle" align="right"><span style="font-size:19px;font-weight:800;color:#ffffff;">Solder Line Report</span><span style="display:inline-block;width:42px;height:42px;margin-left:10px;background:rgba(255,255,255,.16);border-radius:11px;vertical-align:middle;text-align:center;line-height:42px;"><img src="${EMAIL_ICONS.calendar}" width="19" height="19" alt="" style="vertical-align:-4px;border:0;"></span></td></tr></table>
        </td></tr>
        <tr><td style="padding:30px 30px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top">
          <div style="font-size:28px;font-weight:800;color:${COLORS.ink};line-height:1.15;">Solder Line Report Email</div>
          <div style="margin-top:12px;font-size:14px;font-weight:700;color:#173b8d;">${escapeHtml(reportName)}${camera ? ` · ${escapeHtml(camera)}` : ''}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr><td style="font-size:14px;color:${COLORS.muted};"><img src="${EMAIL_ICONS.calendar}" width="15" height="15" alt="" style="vertical-align:-2px;margin-right:6px;border:0;">${escapeHtml(range ? range[1] : period)}</td><td style="padding:0 14px;color:${COLORS.border};">|</td><td style="font-size:14px;color:${COLORS.muted};">${range ? escapeHtml(range[2]) : ''}</td></tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f5fa" style="background:#f3f5fa;border:1px solid ${COLORS.border};border-radius:14px;margin-top:22px;"><tr><td style="padding:20px 22px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" width="52"><span style="display:inline-block;width:46px;height:46px;background:#173b8d;border-radius:12px;text-align:center;line-height:46px;"><img src="${EMAIL_ICONS.rows}" width="22" height="22" alt="" style="vertical-align:-5px;border:0;"></span></td><td valign="middle" style="padding-left:16px;"><span style="font-size:24px;font-weight:800;color:#173b8d;">${count}</span><span style="font-size:15px;color:${COLORS.muted};">&nbsp; report record${count === 1 ? '' : 's'} included.</span></td></tr></table></td></tr></table>
        </td><td valign="top" width="150" align="right" style="padding-left:14px;"><img src="${EMAIL_ICONS.envelope}" width="150" height="120" alt="" style="border:0;display:block;max-width:150px;"></td></tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 20px;"><tr><td style="border-top:1px dashed ${COLORS.border};font-size:0;line-height:0;">&nbsp;</td><td width="150" align="center" style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${COLORS.muted};white-space:nowrap;">${linked ? 'Download report' : 'Report files'}</td><td style="border-top:1px dashed ${COLORS.border};font-size:0;line-height:0;">&nbsp;</td></tr></table>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>${linked ? buttons : `<td align="center" style="font-size:14px;line-height:1.6;color:${COLORS.muted};">The report file${formats.length === 1 ? ' is' : 's are'} attached to this email.</td>`}</tr></table>
        </td></tr>
        <tr><td bgcolor="#f3f5fa" style="background:#f3f5fa;padding:20px 30px;border-top:1px solid ${COLORS.border};"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" width="46"><span style="display:inline-block;width:36px;height:36px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:50%;text-align:center;line-height:36px;"><img src="${EMAIL_ICONS.shield}" width="18" height="18" alt="" style="vertical-align:-4px;border:0;"></span></td><td valign="middle" style="padding-left:12px;font-size:12.5px;line-height:1.6;color:${COLORS.muted};">This is an automated email. Please do not reply to this email.<br>Generated automatically by <strong style="color:#173b8d;">VideoraIQ</strong>.</td></tr></table></td></tr>
        <tr><td height="4" style="height:4px;font-size:0;line-height:0;background:linear-gradient(90deg,#173b8d,#0f766e);">&nbsp;</td></tr>
      </table><div style="font-size:11px;color:#8a99b1;margin-top:14px;">VideoraIQ · Smart Surveillance Powered by AI</div>
    </td></tr></table>
  </body></html>`;
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

export async function buildReportPdf(rows, title, subtitle) {
  const logo = await logoBuffer();
  const table = reportTable(rows);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: table.headers.length > 16 ? 'A2' : table.headers.length > 8 ? 'A3' : 'A4', layout: 'landscape', margin: 30, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    try {
      const groups = columnGroups(table.headers, 24);
      const recordCount = rows.filter((row) => row[Object.keys(row)[0]] !== 'TOTAL').length;
      const left = 30, width = doc.page.width - 60;
      const bottom = doc.page.height - 54;
      let y;
      let logoDrawn = false;
      const banner = (part) => {
        const bands = 80;
        for (let band = 0; band < bands; band++) {
          doc.rect(left + band * width / bands, 26, width / bands + 0.2, 82).fill(headerColor(band / (bands - 1)));
        }
        if (logo && !logoDrawn) doc.image(logo, left + 16, 47, { fit: [128, 38] });
        else if (!logoDrawn) doc.font('Helvetica-Bold').fontSize(17).fillColor(COLORS.navy).text('VideoraIQ', left + 16, 55, { width: 130, lineBreak: false });
        logoDrawn = true;
        doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.ink).text(reportHeading(title), left + 165, 48, { width: width - 185, height: 34, align: 'right', ellipsis: true });
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(reportPeriodDisplay(subtitle), left + 165, 86, { width: width - 185, align: 'right', lineBreak: false });
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(subtitle, left, 123, { width, height: 28, ellipsis: true });
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text(`${recordCount} report record${recordCount === 1 ? '' : 's'}${groups.length > 1 ? `  |  Columns ${part + 1} of ${groups.length}` : ''}`, left, 153, { lineBreak: false });
        y = 175;
      };
      // Continuation pages follow the normal frontend export layout: keep the
      // table header at the top, but do not repeat the branded report banner
      // or logo on every page.
      const continuationPage = () => { y = 45; };
      groups.forEach((indices, part) => {
        if (part) doc.addPage();
        if (part === 0) banner(part);
        else continuationPage();
        if (!table.rows.length) {
          doc.roundedRect(left, y, width, 50, 5).fill(COLORS.pale);
          doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted).text('No records for this period.', left + 16, y + 17);
          return;
        }
        const weights = indices.map((index, i) => i === 0 ? 1.3 : /Zone|Operator|Condition|Time|Started|Returned/.test(table.headers[index]) ? 1.35 : table.headers[index] === 'Snapshot' ? 1.25 : 1);
        const totalWeight = weights.reduce((sum, n) => sum + n, 0);
        const widths = weights.map((n) => width * n / totalWeight);
        const cellText = (value) => { const text = displayValue(value); return text.length > 300 ? `${text.slice(0, 297)}...` : text; };
        const drawRow = (values, header = false, rowIndex = 0) => {
          doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 9 : indices.length > 16 ? 7.5 : 8.5);
          const texts = values.map((value, i) => !header && table.headers[indices[i]] === 'Snapshot' ? snapshotText(value) : cellText(value));
          const height = Math.min(96, Math.max(header ? 36 : 30, ...texts.map((text, i) => doc.heightOfString(text, { width: widths[i] - 16 }) + 18)));
          if (!header && y + height > bottom) {
            doc.addPage(); continuationPage(); drawRow(indices.map((i) => table.headers[i]), true);
          }
          let x = left;
          const total = !header && values[0] === 'TOTAL';
          texts.forEach((text, i) => {
            doc.rect(x, y, widths[i], height).fillAndStroke(header ? COLORS.navy : total ? '#e7ecff' : rowIndex % 2 ? COLORS.pale : '#ffffff', COLORS.border);
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
            doc.font(header || i === 0 || total ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 9 : indices.length > 16 ? 7.5 : 8.5)
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
  const recordCount = rows.filter((row) => row[Object.keys(row)[0]] !== 'TOTAL').length;
  workbook.creator = 'VideoraIQ';
  const sheet = workbook.addWorksheet('Report', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
  const columns = Math.max(1, table.headers.length);
  sheet.mergeCells(1, 1, 1, columns);
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF182344' } };
  sheet.getRow(1).height = 27;
  sheet.mergeCells(2, 1, 2, columns);
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A2').font = { size: 10, color: { argb: 'FF637391' } };
  sheet.getRow(2).height = 22;
  sheet.mergeCells(3, 1, 3, columns);
  sheet.getCell('A3').value = `${recordCount} report record${recordCount === 1 ? '' : 's'}`;
  sheet.getCell('A3').font = { size: 10, color: { argb: 'FF637391' } };
  sheet.getRow(3).height = 22;
  if (table.rows.length) {
    const header = sheet.addRow(table.headers); header.height = 32;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B52DA' } };
      cell.alignment = { wrapText: true, vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9E0EE' } } };
    });
    table.rows.forEach((values, index) => {
      const row = sheet.addRow(values.map((value, column) => table.headers[column] === 'Snapshot'
        ? snapshotLink(value) ? { text: 'View snapshot', hyperlink: value } : 'No snapshot'
        : /^P\d+$/.test(table.headers[column]) && ['Soldered', 'Missed'].includes(value) ? `${value === 'Soldered' ? '\u2713' : '\u2715'} ${value}` : value));
      const total = values[0] === 'TOTAL';
      row.height = Math.min(72, Math.max(30, ...values.map(value => String(value ?? '').split('\n').length * 16 + 12)));
      row.eachCell((cell, column) => {
        cell.alignment = { wrapText: true, vertical: 'middle' };
        cell.font = { bold: total, color: { argb: cell.value?.hyperlink ? 'FF5B52DA' : 'FF182344' }, size: 11, ...(cell.value?.hyperlink ? { underline: true } : {}) };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: total ? 'FFE7ECFF' : index % 2 ? 'FFFFFFFF' : 'FFF3F5FA' } };
        cell.border = { left: { style: 'thin', color: { argb: 'FFD9E0EE' } }, right: { style: 'thin', color: { argb: 'FFD9E0EE' } }, bottom: { style: 'thin', color: { argb: 'FFE6EAF2' } } };
        if (/^P\d+$/.test(table.headers[column - 1]) && ['Soldered', 'Missed'].includes(values[column - 1])) {
          const done = values[column - 1] === 'Soldered';
          cell.font.color = { argb: done ? 'FF0F766E' : 'FFB91C1C' };
          cell.fill.fgColor = { argb: done ? 'FFE6FAF1' : 'FFFFEFEF' };
        }
      });
    });
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + table.rows.length, column: table.headers.length } };
  } else sheet.addRow(['No records for this period.']);
  sheet.columns.forEach((column, i) => {
    const header = table.headers[i] || '';
    const sampleWidth = Math.max(header.length + 3, ...table.rows.slice(0, 100).map((row) => String(row[i] ?? '').split('\n').reduce((max, line) => Math.max(max, line.length + 2), 0)));
    column.width = header === 'Snapshot' ? 19 : /^P\d+$/.test(header) ? 17 : Math.max(16, Math.min(48, sampleWidth));
  });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 0, fitToHeight: 0, printTitlesRow: '1:4' };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const emailSvg = (markup) => `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
const EMAIL_ICONS = {
  shieldWhite: emailSvg('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>'),
  calendar: emailSvg('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#173b8d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'),
  rows: emailSvg('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h14M5 12h14M5 18h14"/></svg>'),
  envelope: emailSvg('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="120" viewBox="0 0 150 120" fill="none"><rect x="30" y="16" width="70" height="52" rx="4" fill="#fff" stroke="#c9d6f2" stroke-width="2"/><circle cx="46" cy="32" r="6" fill="#8fb0ee"/><path d="M58 29h33M58 40h27M58 51h31" stroke="#dbe4f8" stroke-width="4" stroke-linecap="round"/><path d="M18 50h114l-12 46a6 6 0 0 1-5.8 4.4H35.8A6 6 0 0 1 30 96z" fill="#5b8def"/><path d="m18 50 57 34 57-34" fill="#93b4f4" stroke="#3f6fd6" stroke-width="2"/><circle cx="120" cy="85" r="15" fill="#1e9e63"/><path d="m113 85 5 5 9-10" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  shield: emailSvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#173b8d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>'),
};

function buildEmailHtmlLegacy(rows, title, subtitle, formats, hasLogo = true, downloads = []) {
  const count = rows.filter((row) => row[Object.keys(row)[0]] !== 'TOTAL').length;
  const linked = downloads.length === formats.length && downloads.length > 0;
  const separator = Math.max(subtitle.lastIndexOf(' · '), subtitle.lastIndexOf(' Â· '));
  const camera = separator < 0 ? '' : subtitle.slice(0, separator);
  const period = separator < 0 ? subtitle : subtitle.slice(separator + 3);
  const range = period.match(/^(.*) \(([^()]+)\)$/);
  const buttons = [...downloads].sort((a, b) => (a.format === 'pdf' ? -1 : 1) - (b.format === 'pdf' ? -1 : 1)).map(({ format, url }) => {
    const pdf = format === 'pdf';
    return `<td align="center" style="padding:5px 8px;"><a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:block;min-width:185px;padding:15px 12px;border-radius:9px;background:${pdf ? '#173b8d' : '#0f766e'};border:1px solid ${pdf ? '#123476' : '#0b625c'};color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;white-space:nowrap;">&#8681;&nbsp; Download ${pdf ? 'PDF' : 'Excel'}</a></td>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:0;background:#eef2fa;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${count} soldering report record${count === 1 ? '' : 's'} · ${escapeHtml(period)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2fa"><tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:600px;border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;">
      <tr><td bgcolor="#173b8d" style="padding:24px 30px;background:#173b8d;color:#ffffff;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle">${hasLogo ? `<span style="display:inline-block;padding:7px 9px;border-radius:7px;background:#ffffff;"><img src="cid:${LOGO_CID}" alt="VideoraIQ" width="140" style="display:block;width:140px;max-width:100%;height:auto;border:0;"></span>` : '<strong style="font-size:22px;color:#ffffff;">VideoraIQ</strong>'}</td><td align="right" valign="middle" style="font-size:18px;font-weight:bold;color:#ffffff;">Solder Line Report</td></tr></table>
      </td></tr>
      <tr><td style="padding:30px;">
        <h1 style="margin:0 0 7px;font-size:25px;line-height:1.3;color:${COLORS.ink};">Solder Line Report Email</h1>
        <p style="margin:0 0 16px;font-size:14px;font-weight:bold;color:#173b8d;">${escapeHtml(title.replace(/^Solder Line\s*[—-]\s*/i, ''))}${camera ? ` · ${escapeHtml(camera)}` : ''}</p>
        <p style="margin:0 0 22px;font-size:13px;line-height:1.7;color:${COLORS.muted};">&#128197;&nbsp; ${escapeHtml(range ? range[1] : period)}${range ? `&nbsp;&nbsp; | &nbsp;&nbsp;${escapeHtml(range[2])}` : ''}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f5fa" style="border:1px solid ${COLORS.border};border-radius:12px;"><tr><td style="padding:18px;width:52px;"><span style="display:inline-block;width:46px;height:46px;line-height:46px;text-align:center;border-radius:11px;background:#173b8d;color:#ffffff;font-size:22px;">&#9776;</span></td><td style="padding:18px 18px 18px 0;color:#173b8d;font-size:14px;"><strong style="font-size:25px;">${count}</strong>&nbsp; report record${count === 1 ? '' : 's'} included.</td></tr></table>
        <p style="margin:26px 0 14px;text-align:center;letter-spacing:1.5px;color:#8a99b1;font-size:12px;font-weight:bold;">${linked ? 'DOWNLOAD REPORT' : 'REPORT FILES'}</p>
        ${linked ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>${buttons}</tr></table>` : `<p style="margin:0;text-align:center;font-size:14px;line-height:1.6;color:${COLORS.muted};">The ${formats.length === 1 ? 'requested report is' : 'requested reports are'} attached to this email. Open or save ${formats.length === 1 ? 'the file' : 'the files'} to view the full report.</p>`}
      </td></tr>
      <tr><td bgcolor="#f3f5fa" style="padding:20px 30px;border-top:1px solid ${COLORS.border};font-size:12px;color:${COLORS.muted};line-height:1.7;">This is an automated email. Please do not reply.<br>Generated automatically by <strong style="color:#173b8d;">VideoraIQ</strong>.</td></tr>
      <tr><td height="4" bgcolor="${COLORS.teal}"></td></tr>
    </table>
    <p style="font-size:11px;color:#8a99b1;margin-top:18px;">VideoraIQ · Smart Surveillance Powered by AI</p>
  </td></tr></table></body></html>`;
}
