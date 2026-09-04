import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import logoUrl from '@/assets/videoraiq-logo-color.png';

/** Row shape used by both the on-page Attendance Log table and this export —
 * built once from the raw usersLogs entries returned by getDemoAttendanceLogs. */
function sessionSnap(session) {
  const images = session?.images || {};
  return images.frameImage || images.personImage || images.faceImage || '';
}

/** mm:ss / h:mm:ss span between two timestamps, or null if either is missing. */
function durationLabel(fromMs, toMs) {
  if (!fromMs || !toMs || toMs < fromMs) return null;
  const totalSeconds = Math.round((toMs - fromMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} sec`;
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
      email: log.userInfo?.email || '--',
      checkIn: checkIn ? moment(checkIn).format('HH:mm:ss') : '--',
      checkOut: checkOut ? moment(checkOut).format('HH:mm:ss') : '--',
      duration: durationLabel(checkIn ? new Date(checkIn).getTime() : 0, checkOut ? new Date(checkOut).getTime() : 0),
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
    const email = log.userInfo?.email || '--';
    const photo = log.userInfo?.profilePics?.[0] || '';
    (Array.isArray(log.sessions) ? log.sessions : []).forEach((session, i) => {
      const at = session?.timestamp || log.date || null;
      out.push({
        id: `${log.userId || name}-${session?._id || at || i}`,
        _at: at ? new Date(at).getTime() : 0,
        photo: sessionSnap(session) || photo,
        name,
        email,
        checkIn: session?.checkIn && session.checkIn !== session?.timestamp
          ? moment(session.checkIn).format('HH:mm:ss')
          : at ? moment(at).format('HH:mm:ss') : '--',
        checkOut: session?.checkOut ? moment(session.checkOut).format('HH:mm:ss') : '--',
        duration: durationLabel(
          session?.checkIn ? new Date(session.checkIn).getTime() : at || 0,
          session?.checkOut ? new Date(session.checkOut).getTime() : 0,
        ),
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
      clipUrl: report.clipUrl || '',
      minConfidence: report.minConfidence ?? null,
      generatedAt: report.generatedAt || report.lastRunAt || null,
      rows: Array.isArray(report.rows) ? report.rows : [],
      _index: index,
    }))
    .filter((report) => report.rows.length > 0);
}

const slug = (value) => String(value || 'live_demo').replace(/\s+/g, '_').toLowerCase();

/** Session Analytics summary, normalized from SessionAnalyticsPanel's `analytics` prop. */
function toAnalytics(analytics) {
  const demosRun = analytics?.demosRun ?? 0;
  const eventsDetected = analytics?.eventsDetected ?? 0;
  const avgConfidence = analytics?.avgConfidence ?? 0;
  const detectionsTested = analytics?.detectionsTested ?? 0;

  const rawRows = analytics?.byDetection;
  const byDetection = Array.isArray(rawRows)
    ? rawRows
    : Object.entries(rawRows || {}).map(([key, stats]) => ({ settingType: key, ...stats }));

  const rows = byDetection
    .map((row) => ({
      name: row.name || row.settingType || row.key || 'Detection',
      runs: row.runs || 0,
      events: row.events || 0,
      avgConfidence: row.avgConfidence ?? 0,
    }))
    .filter((row) => row.runs > 0 || row.events > 0);

  const totalEvents = Math.max(1, rows.reduce((sum, row) => sum + row.events, 0));
  return {
    demosRun,
    eventsDetected,
    avgConfidence,
    detectionsTested,
    rows: rows.map((row) => ({ ...row, share: Math.round((row.events / totalEvents) * 100) })),
  };
}

// ---------------------------------------------------------------------------
// Shared header (PDF + on-brand banner)
// ---------------------------------------------------------------------------

// Palette lifted straight from the VideoraIQ Live Demo report mock
// (VideoraIQ Live Demo.dc.html — _repDoc's CSS).
const GRAD_BLUE = [59, 130, 246]; //   #3b82f6
const GRAD_MID = [124, 92, 255]; //    #7c5cff
const GRAD_VIOLET = [168, 85, 247]; // #a855f7
const INK = [15, 23, 42]; //           #0f172a
const MUTED = [100, 116, 139]; //      #64748b
const TABLE_HEAD = [16, 21, 39]; //    #101527
const ACCENT_BAR = GRAD_BLUE; //       h2 border-left: 4px solid #3b82f6
const MARGIN = 14;

const imageToDataUrl = async (url) => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/** Rounded blue→violet→magenta gradient band across the top of the page —
 * the mock's `.brandbar` (linear-gradient(90deg,#3b82f6,#7c5cff,#a855f7)). */
const drawGradientRule = (doc, y = 4, height = 1.8) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const x0 = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const bands = 60;
  const bandW = width / bands;
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  for (let b = 0; b < bands; b += 1) {
    const t = b / (bands - 1);
    // two-stop gradient: blue -> mid at t<0.5, mid -> violet after
    const [from, to, tt] = t < 0.5
      ? [GRAD_BLUE, GRAD_MID, t * 2]
      : [GRAD_MID, GRAD_VIOLET, (t - 0.5) * 2];
    doc.setFillColor(lerp(from[0], to[0], tt), lerp(from[1], to[1], tt), lerp(from[2], to[2], tt));
    doc.rect(x0 + b * bandW, y, bandW + 0.4, height, 'F');
  }
};

/** Report header — mirrors the mock's `.hdr` / `.tagline`: gradient brandbar,
 * then a flex row with the logo on the left and "Live Demo Report" + the
 * generation line on the right, then the uppercase tagline full-width below. */
const drawLiveDemoHeader = async (doc, { demosRun }) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  drawGradientRule(doc, 8, 1.8);

  const logoTop = 13;
  const logoH = 12;
  let logoDrawn = false;
  try {
    const logoDataUrl = await imageToDataUrl(logoUrl);
    const props = doc.getImageProperties(logoDataUrl);
    const logoW = (props.width / props.height) * logoH;
    doc.addImage(logoDataUrl, 'PNG', MARGIN, logoTop, logoW, logoH);
    logoDrawn = true;
  } catch {
    logoDrawn = false;
  }
  if (!logoDrawn) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text('Videora', MARGIN, logoTop + 8);
    const w = doc.getTextWidth('Videora');
    doc.setTextColor(...GRAD_BLUE);
    doc.text('IQ', MARGIN + w, logoTop + 8);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text('Live Demo Report', pageWidth - MARGIN, logoTop + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const demoCount = demosRun || 0;
  doc.text(
    `Generated ${moment().format('D/M/YYYY, h:mm:ss A')} · ${demoCount} demo run${demoCount === 1 ? '' : 's'}`,
    pageWidth - MARGIN,
    logoTop + 11,
    { align: 'right' },
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAD_MID);
  doc.text('SMART SURVEILLANCE POWERED BY AI', MARGIN, logoTop + 20, { charSpace: 0.6 });
};

/** Section heading — the mock's `h2`: bold, blue left accent bar. */
const drawSectionTitle = (doc, text, y) => {
  doc.setFillColor(...ACCENT_BAR);
  doc.rect(MARGIN, y - 3.8, 1.4, 4.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text(text, MARGIN + 4, y);
};

/** The four Session Analytics tiles (Demos run / Events detected / Avg
 * confidence / Detections tested), stacked left-to-right like the on-screen cards. */
const drawAnalyticsTiles = (doc, analytics, y) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const gap = 3;
  const tileWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const tileHeight = 20;

  const tiles = [
    { label: 'DEMOS RUN', value: String(analytics.demosRun) },
    { label: 'EVENTS DETECTED', value: String(analytics.eventsDetected) },
    { label: 'AVG CONFIDENCE', value: `${analytics.avgConfidence}%` },
    { label: 'DETECTIONS TESTED', value: String(analytics.detectionsTested) },
  ];

  tiles.forEach((tile, i) => {
    const x = margin + i * (tileWidth + gap);
    doc.setFillColor(246, 248, 252); // .kpi td { background:#f6f8fc }
    doc.roundedRect(x, y, tileWidth, tileHeight, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...GRAD_BLUE); // .kpi b { color:#3b82f6 }
    doc.text(tile.value, x + tileWidth / 2, y + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(tile.label, x + tileWidth / 2, y + 16, { align: 'center' });
  });

  return y + tileHeight;
};

/** Per-detection breakdown table: Detection / Runs / Events / Share / Avg Conf. */
const drawDetectionTable = (doc, rows, startY) => {
  autoTable(doc, {
    head: [['Detection', 'Runs', 'Events', 'Share', 'Avg Conf']],
    body: rows.map((row) => [row.name, row.runs, row.events, `${row.share}%`, `${row.avgConfidence}%`]),
    startY,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 2.4 },
    headStyles: { fillColor: TABLE_HEAD, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 252] },
  });
  return doc.lastAutoTable.finalY;
};

/** The "<Detection> — Attendance Log" meta block: Processed at / Test clip /
 * Min confidence / Summary, followed by the per-person table. `avgConfidence`
 * comes from the Session Analytics detection breakdown — there's no per-row
 * confidence in the attendance data, only the detection-level average. */
const drawAttendanceSection = (doc, report, startY, avgConfidence) => {
  let y = startY;
  drawSectionTitle(doc, report.title, y);
  y += 6;

  const processedAt = report.generatedAt ? moment(report.generatedAt).format('HH:mm:ss') : moment().format('HH:mm:ss');
  const registered = new Set(report.rows.map((row) => row.name)).size;
  const summary = `${registered} registered · ${report.rows.length} event${report.rows.length === 1 ? '' : 's'}${avgConfidence ? ` · avg ${avgConfidence}% conf` : ''}`;

  const clipCell = report.clipUrl || report.clipName || '--';
  const meta = [
    ['Processed at', processedAt],
    ['Test clip', clipCell],
    ['Min confidence', report.minConfidence != null ? `${report.minConfidence}%` : '--'],
    ['Summary', summary],
  ];

  autoTable(doc, {
    body: meta,
    startY: y,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [219, 227, 239], lineWidth: 0.1, overflow: 'linebreak' },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: MUTED, fillColor: [240, 244, 250], cellWidth: 42 },
      1: { textColor: INK },
    },
    // Render the Test clip value as a clickable blue link to the processed video.
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === 1 && data.column.index === 1 && report.clipUrl) {
        data.cell.styles.textColor = GRAD_BLUE;
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.row.index === 1 && data.column.index === 1 && report.clipUrl) {
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: report.clipUrl });
      }
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  autoTable(doc, {
    head: [['Person', 'Email', 'Check-in', 'Check-out']],
    body: report.rows.map((row) => [row.name, row.email || '--', row.checkIn, row.checkOut]),
    startY: y,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: TABLE_HEAD, textColor: 255 },
    alternateRowStyles: { fillColor: [246, 248, 252] },
  });
  return doc.lastAutoTable.finalY;
};

// ---------------------------------------------------------------------------
// Excel — one sheet per report; a Session Analytics summary sheet first
// ---------------------------------------------------------------------------

function analyticsSheet(analytics) {
  const meta = [
    ['VideoraIQ — Live Demo Report'],
    ['Generated', moment().format('DD/MM/YYYY HH:mm')],
    [],
    ['Session Analytics'],
    ['Demos run', analytics.demosRun],
    ['Events detected', analytics.eventsDetected],
    ['Avg confidence', `${analytics.avgConfidence}%`],
    ['Detections tested', analytics.detectionsTested],
    [],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(meta);
  XLSX.utils.sheet_add_json(
    sheet,
    analytics.rows.map((row) => ({
      Detection: row.name,
      Runs: row.runs,
      Events: row.events,
      Share: `${row.share}%`,
      'Avg Conf': `${row.avgConfidence}%`,
    })),
    { origin: -1 },
  );
  return sheet;
}

function reportSheet(report) {
  // Mirror the Auto Email Attendance Report's CSV: a small meta block, a blank
  // line, then the header row and the per-person rows.
  const generated = report.generatedAt
    ? moment(report.generatedAt).format('DD/MM/YYYY HH:mm')
    : moment().format('DD/MM/YYYY HH:mm');
  const registered = new Set(report.rows.map((row) => row.name)).size;
  const meta = [
    ['VideoraIQ Attendance Report'],
    ['Report', report.title],
    ['Processed at', generated],
    ['Test clip', report.clipUrl || report.clipName || '--'],
    ...(report.minConfidence != null ? [['Min confidence', `${report.minConfidence}%`]] : []),
    ['Summary', `${registered} registered · ${report.rows.length} event${report.rows.length === 1 ? '' : 's'}`],
    [],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(meta);

  // Make the "Test clip" value a real hyperlink to the processed video.
  if (report.clipUrl) {
    const clipRef = XLSX.utils.encode_cell({ r: 3, c: 1 });
    if (sheet[clipRef]) sheet[clipRef].l = { Target: report.clipUrl, Tooltip: 'Open processed video' };
  }

  XLSX.utils.sheet_add_json(
    sheet,
    report.rows.map((row, i) => ({
      '#': i + 1,
      Person: row.name,
      Email: row.email || '--',
      'Check-in': row.checkIn,
      'Check-out': row.checkOut,
    })),
    { origin: -1 },
  );
  return sheet;
}

function exportExcel(input, analytics, { filename } = {}) {
  const reports = toReports(input);
  if (!reports.length) {
    toast.error('No attendance data to export');
    return;
  }

  const workbook = XLSX.utils.book_new();

  if (analytics) {
    XLSX.utils.book_append_sheet(workbook, analyticsSheet(toAnalytics(analytics)), 'Session Analytics');
  }

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
// PDF — header + Session Analytics once, one Attendance Log section per report
// ---------------------------------------------------------------------------

async function exportPdf(input, analytics, { filename } = {}) {
  const reports = toReports(input);
  if (!reports.length) {
    toast.error('No attendance data to export');
    return;
  }

  const stats = toAnalytics(analytics);
  const doc = new jsPDF();
  doc.setFont('helvetica');

  await drawLiveDemoHeader(doc, stats);
  let y = 44;
  drawSectionTitle(doc, 'Session Analytics', y);
  y = drawAnalyticsTiles(doc, stats, y + 4) + 6;
  if (stats.rows.length) {
    y = drawDetectionTable(doc, stats.rows, y) + 10;
  }

  reports.forEach((report, i) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    const estimatedHeight = 40 + report.rows.length * 6;
    if (i > 0 || y + estimatedHeight > pageHeight - 20) {
      doc.addPage();
      y = 16;
    }
    const detectionStat = stats.rows.find((row) => row.name === report.detectionName);
    y = drawAttendanceSection(doc, report, y, detectionStat?.avgConfidence) + 12;
  });

  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240); // .foot border-top: 1px solid #e2e8f0
    doc.setLineWidth(0.2);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('VideoraIQ · Smart Surveillance Powered by AI', 14, pageHeight - 7);
    doc.text('Demo report — generated in-browser · Confidential', pageWidth - 14, pageHeight - 7, { align: 'right' });
  }

  const outName =
    filename ||
    (reports.length > 1 ? 'live_demo_all_reports.pdf' : `${slug(reports[0].title)}_report.pdf`);
  doc.save(outName);
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Export a single report (per-row buttons). `params` is a `{ rows, ... }` bag. */
export const handleLiveDemoExport = (format, params, analytics) => {
  if (format === 'excel') exportExcel(params, analytics);
  else if (format === 'pdf') exportPdf(params, analytics);
};

/** Export every report in one file (the "All · Excel" / "All · PDF" buttons). */
export const handleLiveDemoExportAll = (format, reports, analytics) => {
  if (format === 'excel') exportExcel(reports, analytics, { filename: 'live_demo_all_reports.xlsx' });
  else if (format === 'pdf') exportPdf(reports, analytics, { filename: 'live_demo_all_reports.pdf' });
};
