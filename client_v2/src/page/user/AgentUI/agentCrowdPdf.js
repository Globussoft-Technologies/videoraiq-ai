import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment-timezone';
import { mediaUrl } from '@/lib/format';
import { reportTableOptions } from '@/pages/IncidentLogs/pdfReportTemplate';
import { drawSplitReportHeader } from './splitReportHeader.js';

const crowdColumns = [
  ['sNo', 'S No'], ['date', 'Date'], ['time', 'Time'], ['incident', 'Incident'],
  ['camera', 'Camera'], ['nvr', 'NVR'], ['location', 'Location'], ['zone', 'Zone'],
  ['severity', 'Severity'], ['status', 'Status'], ['people', 'People'], ['image', 'Image'],
];

const display = (value, fallback = '--') => value == null || String(value).trim() === '' ? fallback : String(value);
const readable = (value) => {
  const text = value == null ? '' : String(value).trim();
  return text && !['--', '-', 'n/a', 'na', 'unknown', 'undefined', 'null'].includes(text.toLowerCase()) ? text : '';
};
const imageUrl = (value) => {
  return mediaUrl(value);
};

function crowdRows(records, timezone = 'Asia/Kolkata') {
  return (Array.isArray(records) ? records : []).map((record, index) => {
    const dateValue = record?.timeOfIncident || record?.createdAt || record?.updatedAt;
    const date = dateValue ? moment.utc(dateValue).tz(timezone) : null;
    const channel = { ...(record?.channel || {}), ...(record?.channelData || {}) };
    const nvr = { ...(record?.nvr || {}), ...(record?.nvrData || {}) };
    const resolved = record?.resolved === true || String(record?.currentStatus || '').toLowerCase() === 'resolved';
    const location = [
      nvr.locationName,
      nvr.location,
      nvr.siteName,
      channel.locationName,
      channel.location,
      channel.siteName,
      record?.locationName,
      record?.location,
      record?.siteName,
      record?.site?.locationName,
      record?.site?.name,
    ].map(readable).find(Boolean) || '--';
    return {
      sNo: index + 1,
      date: date?.isValid() ? date.format('DD MMM YYYY') : display(dateValue),
      time: date?.isValid() ? date.format('hh:mm:ss A') : '--',
      incident: display(record?.incidentName || record?.description, 'Crowd Detected'),
      camera: display(channel.name || channel.cameraName || channel.channelName || record?.cameraName || record?.channelName),
      nvr: display(nvr.nvrName || nvr.name || record?.nvrName),
      location,
      zone: display(record?.zoneName || record?.zone),
      severity: display(record?.severity ? String(record.severity).replace(/^moderate$/i, 'Medium') : '', '--'),
      status: resolved ? 'Resolved' : 'New',
      people: display(record?.crowdCount ?? record?.count ?? record?.peopleCount ?? record?.totalPeople, '0'),
      image: imageUrl(record?.Image || record?.incidentImageUrl || record?.imageUrl || record?.image),
    };
  });
}

function crowdExportTitle(ui) {
  return ui?.title || 'Crowd Detection Report';
}

function crowdRange(ui) {
  const range = ui?.dateRange?.resolved || ui?.dateRange || {};
  return {
    startDate: ui?.startDate || range.startDate || range.start,
    endDate: ui?.endDate || range.endDate || range.end,
    timezone: ui?.timezone || range.timezone || 'Asia/Kolkata',
  };
}

export function exportAgentCrowdPdf(ui) {
  const { startDate, endDate, timezone } = crowdRange(ui);
  const title = crowdExportTitle(ui);
  const records = crowdRows(ui.records?.slice(0, 3000), timezone);
  if (!records.length) throw new Error('No crowd detection records to export');
  const totalRecords = Number(ui.totalRecords ?? ui.totalCount ?? ui.recordsAnalyzed ?? records.length) || records.length;
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const headers = crowdColumns.map(([, label]) => label);
  const doc = new jsPDF('landscape');
  drawSplitReportHeader(doc, { title });
  const left = reportTableOptions.margin.left;
  const period = [startDate, endDate]
    .filter(Boolean)
    .map((date) => moment(date).format('DD MMM YYYY'))
    .join(' - ') || 'All dates';
  const isTruncated = records.length < totalRecords;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(period, left, 35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Timezone: ${timezone} | ${totalRecords.toLocaleString()} incidents`, left, 41);
  if (isTruncated) {
    doc.setTextColor(80, 91, 112);
    doc.text(`PDF includes the first ${records.length.toLocaleString()} incidents. Excel and CSV include all records.`, left, 46);
  }
  const tableRows = records.map((row) => crowdColumns.map(([key]) => key === 'image' ? '' : row[key]));
  autoTable(doc, {
    ...reportTableOptions,
    startY: isTruncated ? 51 : 46,
    head: [headers],
    body: tableRows,
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 22 }, 2: { cellWidth: 20 }, 3: { cellWidth: 30 }, 4: { cellWidth: 28 }, 5: { cellWidth: 18 }, 6: { cellWidth: 22 }, 7: { cellWidth: 16 }, 8: { cellWidth: 17 }, 9: { cellWidth: 17 }, 10: { cellWidth: 12 }, 11: { cellWidth: 28 } },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 11) {
        const url = records[data.row.index]?.image;
        if (url) {
          doc.setTextColor(0, 0, 255);
          doc.text('View Image', data.cell.x + 2, data.cell.y + data.cell.height / 2 + 2);
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
          doc.setTextColor(0, 0, 0);
        }
      }
    },
  });
  doc.save(`${safeTitle}.pdf`);
  return true;
}
