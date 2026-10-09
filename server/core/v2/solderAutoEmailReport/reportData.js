import moment from 'moment-timezone';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export const REPORT_TITLES = { compare: 'Operator comparison', absence: 'Absence report', missed: 'Missed solder report', hourly: 'Hourly activity' };

/** Exact report window; an overlapping absence contributes only time inside it. */
export function buildReportRows(type, { channel, panels, absences, window, timezone }) {
  const zones = (channel.detections?.deskSolarShoulderDetectionSettings?.id?.settings?.zone_configs || []).map((z) => z.name);
  [...new Set([...panels.flatMap((p) => (p.zones || []).map((z) => z.zone)), ...absences.map((a) => a.zone)].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach((z) => { if (!zones.includes(z)) zones.push(z); });
  const operator = (zone) => `OP-${zones.indexOf(zone) + 1} · ${zone || 'Unassigned'}`;
  const stamp = (date) => moment(date).tz(timezone).format('DD MMM YYYY HH:mm:ss');
  const clipped = absences.map((a) => ({ ...a,
    start: Math.max(new Date(a.timeOfIncident).getTime(), window.start.valueOf()),
    end: Math.min(a.returnedAt ? new Date(a.returnedAt).getTime() : window.end.valueOf(), window.end.valueOf()),
  })).filter((a) => a.end > a.start);
  if (type === 'absence') return clipped.map((a) => ({
    Operator: operator(a.zone), Started: stamp(a.timeOfIncident), Returned: a.returnedAt ? stamp(a.returnedAt) : 'Open at period end',
    'Duration in period (s)': Math.round((a.end - a.start) / 1000), Condition: a.description || 'Desk empty',
  }));
  if (type === 'missed') return panels.flatMap((p) => (p.zones || []).flatMap((z) => {
    const done = Math.min(3, Math.max(0, Math.round(z.done || 0)));
    return Array.from({ length: 3 - done }, (_, i) => ({
      Time: stamp(p.time), Panel: p.panelId, Operator: operator(z.zone), Point: `P${zones.indexOf(z.zone) * 3 + done + i + 1}`,
    }));
  }));
  if (type === 'hourly') {
    const buckets = new Map();
    for (const p of panels) {
      const hour = moment(p.time).tz(timezone).format('YYYY-MM-DD HH:00 Z');
      if (!buckets.has(hour)) buckets.set(hour, { Hour: hour, Panels: 0 });
      const row = buckets.get(hour); row.Panels++;
      for (const zone of zones) {
        const z = (p.zones || []).find((v) => v.zone === zone);
        for (const [metric, value] of [['joints', z?.done || 0], ['missed', z ? Math.max(0, 3 - (z.done || 0)) : 0], ['solder seconds', z?.presenceSec || 0]]) {
          const key = `${operator(zone)} ${metric}`; row[key] = (row[key] || 0) + value;
        }
      }
    }
    return [...buckets.values()];
  }
  return zones.map((zone) => {
    const intervals = clipped.filter((a) => a.zone === zone).sort((a, b) => a.start - b.start);
    // Merge overlapping absence intervals so presence cannot double-count gaps.
    const merged = [];
    for (const a of intervals) {
      const last = merged.at(-1);
      if (last && a.start <= last.end) last.end = Math.max(last.end, a.end);
      else merged.push({ start: a.start, end: a.end });
    }
    const away = merged.reduce((n, a) => n + (a.end - a.start) / 1000, 0);
    const samples = panels.flatMap((p) => (p.zones || []).filter((z) => z.zone === zone));
    const joints = samples.reduce((n, z) => n + (z.done || 0), 0);
    const solderSec = samples.reduce((n, z) => n + (z.presenceSec || 0), 0);
    return { Operator: operator(zone), 'Presence (%)': Number((100 * (1 - away / window.end.diff(window.start, 'seconds'))).toFixed(1)),
      'Absence alerts': intervals.length, 'Unavailable seconds': Math.round(away),
      'Longest gap (s)': Math.round(Math.max(0, ...merged.map((a) => (a.end - a.start) / 1000))),
      'Solder joints': joints, 'Missed points': samples.reduce((n, z) => n + Math.max(0, 3 - (z.done || 0)), 0),
      'Avg seconds / joint': joints ? Number((solderSec / joints).toFixed(2)) : '', 'Active solder seconds': solderSec };
  });
}

export async function buildAttachments(rows, title, subtitle, formats) {
  const attachments = [];
  if (formats.includes('xlsx')) {
    const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Report');
    sheet.addRow([title]); sheet.addRow([subtitle]);
    if (rows.length) {
      const headers = Object.keys(rows[0]); sheet.addRow(headers);
      rows.forEach((row) => sheet.addRow(headers.map((key) => row[key])));
      sheet.columns.forEach((column) => { column.width = 24; });
    } else sheet.addRow(['No records for this period.']);
    attachments.push({ content: Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'), filename: 'solder-report.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: 'attachment' });
  }
  if (formats.includes('pdf')) {
    const buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ layout: 'landscape', margin: 35 });
      const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      doc.fontSize(16).text(title); doc.fontSize(10).text(subtitle); doc.moveDown();
      if (!rows.length) doc.text('No records for this period.');
      rows.forEach((row, index) => {
        doc.fontSize(10).font('Helvetica-Bold').text(`Record ${index + 1}`);
        doc.font('Helvetica').fontSize(9);
        Object.entries(row).forEach(([key, value]) => doc.text(`${key}: ${value}`));
        doc.moveDown();
      });
      doc.end();
    });
    attachments.push({ content: buffer.toString('base64'), filename: 'solder-report.pdf', type: 'application/pdf', disposition: 'attachment' });
  }
  return attachments;
}
