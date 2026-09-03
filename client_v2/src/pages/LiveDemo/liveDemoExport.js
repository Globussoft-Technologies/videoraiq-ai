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
    const confidences = sessions.map((s) => Number(s.confidenceScore)).filter((n) => !Number.isNaN(n));
    const avgConfidence = confidences.length
      ? Math.round(confidences.reduce((sum, n) => sum + n, 0) / confidences.length)
      : null;

    // Duration is simply check-out minus check-in.
    let durationLabel = '--';
    if (checkIn && checkOut) {
      const minutes = Math.max(0, moment(checkOut).diff(moment(checkIn), 'minutes'));
      durationLabel = minutes < 1 ? '<1 min' : `${minutes} min`;
    }

    return {
      // Stable-ish identity for row selection / deletion in the demo UI.
      id: log.logId || log._id || log.userId || `row-${index}`,
      photo: sessionSnap(sessions[0]) || log.userInfo?.profilePics?.[0] || '',
      name: log.userInfo?.userName || 'Unknown',
      checkIn: checkIn ? moment(checkIn).format('HH:mm:ss') : '--',
      checkOut: checkOut ? moment(checkOut).format('HH:mm:ss') : '--',
      // Event time rendered in IST (Asia/Kolkata), the demo's reporting zone.
      timestamp: checkIn ? moment.tz(checkIn, 'Asia/Kolkata').format('DD MMM YYYY, HH:mm:ss') : '--',
      duration: durationLabel,
      confidence: avgConfidence != null ? `${avgConfidence}%` : '--',
    };
  });
}

function exportToExcel({ rows, detectionName, clipName, minConfidence }) {
  if (!rows.length) {
    toast.error('No attendance data to export');
    return;
  }

  const excelData = rows.map((row, index) => ({
    '#': index + 1,
    Person: row.name,
    'Check-in': row.checkIn,
    'Check-out': row.checkOut,
    Duration: row.duration,
    Confidence: row.confidence,
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Log');
  XLSX.writeFile(workbook, `${detectionName.replace(/\s+/g, '_').toLowerCase()}_report.xlsx`);
}

function exportToPDF({ rows, detectionName, clipName, minConfidence }) {
  if (!rows.length) {
    toast.error('No attendance data to export');
    return;
  }

  const doc = new jsPDF();
  doc.setFont('helvetica');
  doc.setFontSize(14);
  doc.text(`${detectionName} — Attendance Log`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated: ${moment().format('DD/MM/YYYY HH:mm')}`, 14, 22);
  doc.text(`Test clip: ${clipName || '--'}  ·  Min confidence: ${minConfidence != null ? `${minConfidence}%` : '--'}`, 14, 27);

  autoTable(doc, {
    head: [['#', 'Person', 'Check-in', 'Check-out', 'Duration', 'Confidence']],
    body: rows.map((row, index) => [index + 1, row.name, row.checkIn, row.checkOut, row.duration, row.confidence]),
    startY: 32,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  doc.save(`${detectionName.replace(/\s+/g, '_').toLowerCase()}_report.pdf`);
}

/** Entry point used by the Live Demo report's Excel/PDF buttons. */
export const handleLiveDemoExport = (format, params) => {
  if (format === 'excel') exportToExcel(params);
  if (format === 'pdf') exportToPDF(params);
};
