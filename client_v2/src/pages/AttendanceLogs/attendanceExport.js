import moment from 'moment-timezone';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { exportAttendanceReport, getAttendanceLogs } from './Api';
import { latestAttendanceCapture } from './components/latestCapture';
import logoUrl from '@/assets/videoraiq-logo-white.png';

/**
 * Attendance Logs export.
 *
 * The list PDF and Excel workbook keep the server-rendered report, including session and
 * period totals. The grid PDF uses the existing unpaginated attendance/get
 * response to render the page's card layout in the browser.
 *
 * `params` mirrors the argument set the page already assembles for
 * getAttendanceLogs.
 */

// The server's time-of-day filter compares against a UTC HH:mm, so convert the
// picker's local time the same way the list request does before sending.
const toUtcHhmm = (date, time, region) => {
  if (!date || !time) return '';
  const hasAmPm = /am|pm/i.test(time);
  const format = hasAmPm ? 'YYYY-MM-DD hh:mm A' : 'YYYY-MM-DD HH:mm';
  return moment.tz(`${date} ${time}`, format, region).utc().format('HH:mm');
};
const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const gridImageUrl = (row) => {
  const capture = import.meta.env.VITE_ATTENDANCE_USE_LATEST_CAPTURE === 'true'
    ? latestAttendanceCapture(row.imageUrls)
    : null;
  const path = capture || row.employee?.profilePics?.[0];
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${import.meta.env.VITE_BACKEND}/uploads/${String(path).replace(/^\/+/, '')}`;
};

const loadGridImage = async (url) => {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 156;
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const context = canvas.getContext('2d');
    context.fillStyle = '#e8ecf7';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
};

const loadLogo = async () => {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const drawGridHeader = (doc, logo, params, page, pageCount) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFillColor(246, 248, 253);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setFillColor(34, 25, 91);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setFillColor(91, 96, 242);
  doc.rect(pageWidth - 8, 0, 8, 25, 'F');
  let logoDrawn = false;
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 9, 7, 42, 12);
      logoDrawn = true;
    } catch {
      // Keep the report usable if the bundled logo cannot be decoded.
    }
  }
  if (!logoDrawn) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('VideoraIQ', 10, 15);
  }
  doc.setDrawColor(112, 119, 214);
  doc.line(57, 6, 57, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('Attendance Logs', 63, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(218, 225, 255);
  doc.text('GRID REPORT', 63, 18);
  doc.setDrawColor(225, 230, 240);
  doc.line(8, pageHeight - 10, pageWidth - 8, pageHeight - 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(105, 115, 140);
  doc.text(`Generated ${moment().tz(params.region).format('DD/MM/YYYY hh:mm A')}`, 8, pageHeight - 5);
  doc.text(`Page ${page} of ${pageCount}`, pageWidth - 8, pageHeight - 5, { align: 'right' });
};

const drawDetailIcon = (doc, line, x, y) => {
  doc.setDrawColor(109, 119, 212);
  doc.setLineWidth(0.25);
  if (line === 0) {
    doc.circle(x, y - 1.5, 0.65);
    doc.line(x - 1, y + 0.5, x - 0.6, y - 0.2);
    doc.line(x + 1, y + 0.5, x + 0.6, y - 0.2);
  } else if (line === 1) {
    doc.rect(x - 1, y - 1.9, 2, 2.5);
    doc.line(x - 1.3, y + 0.6, x + 1.3, y + 0.6);
    doc.line(x - 0.4, y - 1.3, x - 0.4, y - 0.8);
    doc.line(x + 0.4, y - 1.3, x + 0.4, y - 0.8);
  } else if (line === 2) {
    doc.rect(x - 1.2, y - 2.1, 2.4, 2.7);
    doc.line(x - 1.2, y - 1.4, x + 1.2, y - 1.4);
  } else if (line === 3) {
    doc.circle(x, y - 1.2, 0.9);
    doc.circle(x, y - 1.2, 0.25);
    doc.line(x - 0.75, y - 0.7, x, y + 0.7);
    doc.line(x + 0.75, y - 0.7, x, y + 0.7);
  } else if (line === 4 || line === 5) {
    doc.circle(x, y - 0.8, 1.2);
    doc.line(x, y - 0.8, x, y - 1.5);
    doc.line(x, y - 0.8, x + 0.6, y - 0.5);
  } else if (line === 6) {
    doc.circle(x, y - 0.8, 1.2);
    doc.line(x - 0.6, y - 0.8, x - 0.1, y - 0.3);
    doc.line(x - 0.1, y - 0.3, x + 0.7, y - 1.4);
  } else {
    doc.roundedRect(x - 1.1, y - 1.9, 2.2, 2.5, 0.3, 0.3);
  }
};

const exportToGridPDF = async (params) => {
  if (params.statusFilter === 'not_checked_in') {
    toast.info("The Not Checked In view can't be exported as a report");
    return;
  }
  const response = await getAttendanceLogs(
    params.searchInput,
    Array.isArray(params.nvrIds) ? params.nvrIds.join(',') : '',
    Array.isArray(params.cameraId) ? params.cameraId.join(',') : '',
    params.startDate,
    params.endDate,
    1,
    params.limit,
    params.sortField,
    params.sortOrder,
    (params.selectedDepartments || []).join(','),
    toUtcHhmm(params.startDate, params.fromTime, params.region),
    toUtcHhmm(params.startDate, params.toTime, params.region),
    params.timeType,
    true,
    params.employeeLocations,
    params.statusFilter
  );
  const rows = response?.data?.body?.data?.attendanceLogs || [];
  if (!rows.length) {
    toast.info(response?.data?.body?.message || 'No attendance data to export');
    return;
  }

  const doc = new jsPDF('landscape');
  const margin = 8;
  const gap = 4;
  const cardWidth = (doc.internal.pageSize.getWidth() - margin * 2 - gap * 3) / 4;
  const cardHeight = 80;
  const progressId = 'attendance-grid-pdf';
  toast.loading(`Preparing grid PDF... 0/${rows.length}`, { id: progressId });
  try {
    const logo = await loadLogo();
    for (let i = 0; i < rows.length; i += 8) {
      if (i > 0) doc.addPage();
      drawGridHeader(doc, logo, params, Math.floor(i / 8) + 1, Math.ceil(rows.length / 8));
      const pageRows = rows.slice(i, i + 8);
      const imageUrls = pageRows.map(gridImageUrl);
      const images = await Promise.all(imageUrls.map(loadGridImage));
      pageRows.forEach((row, index) => {
        const x = margin + (index % 4) * (cardWidth + gap);
        const y = 29 + Math.floor(index / 4) * (cardHeight + gap);
        const status = row.status ? String(row.status).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Unknown';
        const statusColor = row.status === 'present' ? [27, 163, 99]
          : row.status === 'half_day' ? [224, 145, 31]
            : row.status === 'absent' ? [225, 76, 83] : [86, 96, 230];
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(220, 225, 238);
        doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');
        doc.setFillColor(232, 236, 247);
        doc.rect(x + 1, y + 1, cardWidth - 2, 39, 'F');
        if (images[index]) doc.addImage(images[index], 'JPEG', x + 1, y + 1, cardWidth - 2, 39, undefined, 'FAST');
        else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(91, 101, 129);
          doc.text(imageUrls[index] ? 'View image' : 'No image', x + 4, y + 22);
        }
        if (imageUrls[index]) doc.link(x + 1, y + 1, cardWidth - 2, 39, { url: imageUrls[index] });
        doc.setFillColor(...statusColor);
        doc.roundedRect(x + cardWidth - 25, y + 3, 22, 6, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        doc.text(doc.splitTextToSize(status, 19)[0], x + cardWidth - 14, y + 7.1, { align: 'center' });
        doc.setFillColor(91, 96, 242);
        doc.rect(x + 1, y + 40, cardWidth - 2, 1, 'F');
        const details = [
          ['Employee Name', `${row.employee?.firstName || ''} ${row.employee?.lastName || ''}`.trim() || 'Unknown'],
          ['Department', row.employee?.departmentId?.departmentName || '--'],
          ['Date', row.date ? moment(row.date).format('DD/MM/YYYY') : '--'],
          ['Location', row.employee?.location || '--'],
          ['Check In', row.logInTime ? moment.utc(row.logInTime).tz(params.region).format('hh:mm A') : '--'],
          ['Check Out', row.logOutTime ? moment.utc(row.logOutTime).tz(params.region).format('hh:mm A') : '--'],
          ['Status', status],
        ];
        details.forEach(([label, value], line) => {
          const textY = y + 46 + line * 4.5;
          drawDetailIcon(doc, line, x + 4.6, textY);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(91, 102, 130);
          doc.text(label, x + 7, textY);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(22, 34, 69);
          doc.text(doc.splitTextToSize(String(value), cardWidth - 32)[0] || '--', x + 28, textY);
        });
      });
      toast.loading(`Preparing grid PDF... ${Math.min(i + 8, rows.length)}/${rows.length}`, { id: progressId });
    }
    doc.save('AttendanceReport_grid.pdf');
    toast.success('Grid PDF downloaded');
  } finally {
    toast.dismiss(progressId);
  }
};

/** Entry point used by the page's Export buttons. */
export const handleAttendanceExport = async (format, params) => {
  if (format === 'pdf-grid') {
    try {
      await exportToGridPDF(params);
    } catch (error) {
      console.error('Failed to export attendance grid PDF:', error);
      toast.error('Failed to export attendance grid PDF');
    }
    return;
  }
  const apiFormat = format === 'excel' ? 'xlsx' : 'pdf';
  const extension = apiFormat === 'xlsx' ? 'xlsx' : 'pdf';

  try {
    const response = await exportAttendanceReport({
      format: apiFormat,
      searchInput: params.searchInput,
      nvrId: Array.isArray(params.nvrIds) ? params.nvrIds.join(',') : '',
      cameraId: Array.isArray(params.cameraId) ? params.cameraId.join(',') : '',
      startDate: params.startDate,
      endDate: params.endDate,
      sortField: params.sortField,
      sortOrder: params.sortOrder,
      departmentIds: (params.selectedDepartments || []).join(','),
      fromTime: toUtcHhmm(params.startDate, params.fromTime, params.region),
      toTime: toUtcHhmm(params.startDate, params.toTime, params.region),
      timeType: params.timeType,
      employeeLocations: params.employeeLocations,
      status: params.statusFilter,
      timezone: params.region,
    });

    const blob = response?.data;
    if (!blob) {
      toast.error('Export failed');
      return;
    }
    // A JSON "no data" / error response comes back as a blob too — sniff it and
    // surface the message instead of saving an empty file.
    if (blob.type && blob.type.includes('application/json')) {
      const text = await blob.text();
      let message = 'No attendance data to export';
      try {
        const parsed = JSON.parse(text);
        message = parsed?.body?.message || parsed?.message || message;
      } catch {
        /* keep default */
      }
      toast.info(message);
      return;
    }

    triggerDownload(blob, `AttendanceReport.${extension}`);
  } catch (error) {
    toast.error(error?.response?.data?.message || 'Failed to export attendance');
  }
};
