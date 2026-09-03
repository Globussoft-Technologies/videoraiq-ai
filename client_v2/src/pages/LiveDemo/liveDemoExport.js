import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

/** Row shape used by both the on-page Attendance Log table and this export —
 * built once from the raw usersLogs entries returned by getDemoAttendanceLogs. */
function sessionSnap(session) {
  const images = session?.images || {};
  return images.frameImage || images.personImage || images.faceImage || '';
}

export function buildAttendanceRows(usersLogs = []) {
  return usersLogs.map((log, index) => {
    const sessions = log.sessions || [];
    const checkIn = sessions[0]?.timestamp || log.date || null;
    const checkOut = sessions.length > 1 ? sessions[sessions.length - 1]?.timestamp : null;

    return {
      // Stable-ish identity for row selection / deletion in the demo UI.
      id: log.logId || log._id || log.userId || `row-${index}`,
      photo: sessionSnap(sessions[0]) || log.userInfo?.profilePics?.[0] || '',
      name: log.userInfo?.userName || 'Unknown',
      checkIn: checkIn ? moment(checkIn).format('HH:mm:ss') : '--',
      checkOut: checkOut ? moment(checkOut).format('HH:mm:ss') : '--',
      // Event time rendered in IST (Asia/Kolkata), the demo's reporting zone.
      timestamp: checkIn ? moment.tz(checkIn, 'Asia/Kolkata').format('DD MMM YYYY, HH:mm:ss') : '--',
    };
  });
}

/**
 * Flatten the per-person usersLogs into one row per individual face session,
 * carrying the raw session timestamp. Demo attendance logs accumulate sessions
 * from every run of the day into per-person documents, so partitioning by time
 * window (per Demo report) has to happen at the session level, not the doc.
 */
export function buildSessionRows(usersLogs = []) {
  const out = [];
  (Array.isArray(usersLogs) ? usersLogs : []).forEach((log) => {
    const name = log.userInfo?.userName || log.personName || 'Unknown';
    const photo = log.userInfo?.profilePics?.[0] || '';
    (Array.isArray(log.sessions) ? log.sessions : []).forEach((session, i) => {
      const at = session?.timestamp || log.date || null;
      out.push({
        id: `${log.userId || name}-${session?._id || at || i}`,
        _at: at ? new Date(at).getTime() : 0,
        photo: sessionSnap(session) || photo,
        name,
        checkIn: session?.checkIn && session.checkIn !== session?.timestamp
          ? moment(session.checkIn).format('HH:mm:ss')
          : at ? moment(at).format('HH:mm:ss') : '--',
        checkOut: session?.checkOut ? moment(session.checkOut).format('HH:mm:ss') : '--',
        timestamp: at ? moment.tz(at, 'Asia/Kolkata').format('DD MMM YYYY, HH:mm:ss') : '--',
      });
    });
  });
  return out.sort((a, b) => b._at - a._at);
}

// ---------------------------------------------------------------------------
// Report model
// ---------------------------------------------------------------------------

/**
 * Normalize whatever a caller passes (a single report, a `{ rows, ... }` bag,
 * or an array of reports) into a list of report objects the exporters render.
 */
function toReports(input) {
  const list = Array.isArray(input) ? input : Array.isArray(input?.reports) ? input.reports : [input];
  return list
    .filter(Boolean)
    .map((report, index) => ({
      title: report.title || report.detectionName || 'Attendance Log',
      detectionName: report.detectionName || 'Face Recognition',
      clipName: report.clipName || report.clip || '--',
      minConfidence: report.minConfidence ?? null,
      generatedAt: report.generatedAt || report.lastRunAt || null,
      rows: Array.isArray(report.rows) ? report.rows : [],
      _index: index,
    }))
    .filter((report) => report.rows.length > 0);
}

const slug = (value) => String(value || 'live_demo').replace(/\s+/g, '_').toLowerCase();

const metaLine = (report) => {
  const parts = [
    report.generatedAt
      ? moment(report.generatedAt).format('DD/MM/YYYY HH:mm')
      : moment().format('DD/MM/YYYY HH:mm'),
    `Clip: ${report.clipName || '--'}`,
  ];
  if (report.minConfidence != null) parts.push(`Min confidence: ${report.minConfidence}%`);
  return parts.join('   ·   ');
};

// ---------------------------------------------------------------------------
// Excel — one sheet per report; a summary sheet first when there is more than one
// ---------------------------------------------------------------------------

function reportSheet(report) {
  // Mirror the Auto Email Attendance Report's CSV: a small meta block, a blank
  // line, then the header row and the per-person rows.
  const generated = report.generatedAt
    ? moment(report.generatedAt).format('DD/MM/YYYY HH:mm')
    : moment().format('DD/MM/YYYY HH:mm');
  const meta = [
    ['VideoraIQ Attendance Report'],
    ['Report', report.title],
    ['Clip', report.clipName || '--'],
    ['Generated', generated],
    ...(report.minConfidence != null ? [['Min confidence', `${report.minConfidence}%`]] : []),
    [],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(meta);
  XLSX.utils.sheet_add_json(
    sheet,
    report.rows.map((row, i) => ({
      '#': i + 1,
      Person: row.name,
      'Check-in': row.checkIn,
      'Check-out': row.checkOut,
      Timestamp: row.timestamp,
    })),
    { origin: -1 },
  );
  return sheet;
}

function exportExcel(input, { filename } = {}) {
  const reports = toReports(input);
  if (!reports.length) {
    toast.error('No attendance data to export');
    return;
  }

  const workbook = XLSX.utils.book_new();

  if (reports.length > 1) {
    const summary = XLSX.utils.json_to_sheet(
      reports.map((report, i) => ({
        '#': i + 1,
        Report: report.title,
        Clip: report.clipName,
        Events: report.rows.length,
        'Min confidence': report.minConfidence != null ? `${report.minConfidence}%` : '--',
        Generated: report.generatedAt ? moment(report.generatedAt).format('DD/MM/YYYY HH:mm') : '',
      })),
    );
    XLSX.utils.book_append_sheet(workbook, summary, 'Summary');
  }

  const seen = {};
  reports.forEach((report, i) => {
    let name = (report.title || `Report ${i + 1}`).slice(0, 28);
    if (seen[name]) name = `${name.slice(0, 24)} (${(seen[name] += 1)})`;
    else seen[name] = 1;
    XLSX.utils.book_append_sheet(workbook, reportSheet(report), name);
  });

  const outName =
    filename ||
    (reports.length > 1
      ? 'live_demo_all_reports.xlsx'
      : `${slug(reports[0].title)}_report.xlsx`);
  XLSX.writeFile(workbook, outName);
}

// ---------------------------------------------------------------------------
// PDF — one section per report; page break between them
// ---------------------------------------------------------------------------

function exportPdf(input, { filename } = {}) {
  const reports = toReports(input);
  if (!reports.length) {
    toast.error('No attendance data to export');
    return;
  }

  const doc = new jsPDF();
  doc.setFont('helvetica');

  const pageWidth = doc.internal.pageSize.getWidth();
  // Banner mirroring the Auto Email Attendance Report header: a blue field on
  // the left with a violet block on the right. jsPDF has no gradient fill, so
  // approximate it with a few vertical bands that step from blue to violet.
  const BLUE = [107, 143, 232];
  const VIOLET = [168, 85, 247];
  const TABLE_HEAD = [18, 58, 143];

  reports.forEach((report, i) => {
    if (i > 0) doc.addPage();

    const bands = 24;
    const bandW = pageWidth / bands;
    for (let b = 0; b < bands; b += 1) {
      const t = b / (bands - 1);
      doc.setFillColor(
        Math.round(BLUE[0] + (VIOLET[0] - BLUE[0]) * t),
        Math.round(BLUE[1] + (VIOLET[1] - BLUE[1]) * t),
        Math.round(BLUE[2] + (VIOLET[2] - BLUE[2]) * t),
      );
      doc.rect(b * bandW, 0, bandW + 0.5, 26, 'F');
    }
    doc.setTextColor(255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('VideoraIQ Attendance Report', 14, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(report.title, 14, 20);
    if (reports.length > 1) {
      doc.text(`Report ${i + 1} of ${reports.length}`, pageWidth - 14, 12, { align: 'right' });
    }

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(metaLine(report), 14, 34);

    autoTable(doc, {
      head: [['#', 'Person', 'Check-in', 'Check-out', 'Timestamp']],
      body: report.rows.map((row, index) => [
        index + 1,
        row.name,
        row.checkIn,
        row.checkOut,
        row.timestamp,
      ]),
      startY: 40,
      styles: { fontSize: 8 },
      // Match the Auto Email Attendance Report's deep-navy table header.
      headStyles: { fillColor: TABLE_HEAD },
    });
  });

  const outName =
    filename ||
    (reports.length > 1 ? 'live_demo_all_reports.pdf' : `${slug(reports[0].title)}_report.pdf`);
  doc.save(outName);
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Export a single report (per-row buttons). `params` is a `{ rows, ... }` bag. */
export const handleLiveDemoExport = (format, params) => {
  if (format === 'excel') exportExcel(params);
  else if (format === 'pdf') exportPdf(params);
};

/** Export every report in one file (the "All · Excel" / "All · PDF" buttons). */
export const handleLiveDemoExportAll = (format, reports) => {
  if (format === 'excel') exportExcel(reports, { filename: 'live_demo_all_reports.xlsx' });
  else if (format === 'pdf') exportPdf(reports, { filename: 'live_demo_all_reports.pdf' });
};
