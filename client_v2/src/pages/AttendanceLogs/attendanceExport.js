import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { getAttendanceLogs } from './Api';

/* ─────────────── time helpers (mirror attendanceAutoEmailReport.service.js) ─────────────── */

const convertToRegionTime = (utcTime, region) => {
  if (!utcTime || utcTime === '--') return '-';
  const parsed = moment.utc(utcTime).tz(region);
  return parsed.isValid() ? parsed.format('hh:mm:ss A') : '-';
};

/** A minute count as HH:MM:SS. Rounds to whole seconds first. */
const minutesToHms = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) return '00:00:00';
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * "Total Working Hrs (Period)" formatting — HH:MM:SS under 24h, else a compact
 * largest-units breakdown ("9d 7h 51m"), showing the three largest non-zero
 * units of y (365d) / mo (30d) / d / h / m.
 */
const formatPeriodDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '00:00:00';
  if (minutes < 24 * 60) return minutesToHms(minutes);

  const total = Math.round(minutes);
  const MIN_PER_HOUR = 60;
  const MIN_PER_DAY = 24 * MIN_PER_HOUR;
  const MIN_PER_MONTH = 30 * MIN_PER_DAY;
  const MIN_PER_YEAR = 365 * MIN_PER_DAY;

  const years = Math.floor(total / MIN_PER_YEAR);
  let rest = total - years * MIN_PER_YEAR;
  const months = Math.floor(rest / MIN_PER_MONTH);
  rest -= months * MIN_PER_MONTH;
  const days = Math.floor(rest / MIN_PER_DAY);
  rest -= days * MIN_PER_DAY;
  const hours = Math.floor(rest / MIN_PER_HOUR);
  const mins = rest - hours * MIN_PER_HOUR;

  const parts = [];
  if (years) parts.push(`${years}y`);
  if (months) parts.push(`${months}mo`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  return parts.slice(0, 3).join(' ') || '00:00:00';
};

/**
 * Total Working Hrs (Day) = last check-out − first check-in, whole minutes,
 * floored at 0 — the same `minutesSpent` figure the Attendance Logs table and
 * the auto-email report use. Breaks are NOT subtracted. Falls back to the
 * elapsed span if the server didn't send `minutesSpent`.
 */
const workingMinutesForRow = (item) => {
  if (Number.isFinite(item?.minutesSpent)) return Math.max(0, item.minutesSpent);
  if (!item?.logInTime || !item?.logOutTime || item.logOutTime === '--') return 0;
  const span = (new Date(item.logOutTime) - new Date(item.logInTime)) / 60000;
  return Math.max(0, Math.round(span));
};

/** Break minutes as sent by the server (checkout→checkin pairing). */
const breakMinutesForRow = (item) =>
  Number.isFinite(item?.breakMinutes) ? Math.max(0, item.breakMinutes) : 0;

/**
 * Duration column — the same first-check-in → last-check-out span as Total
 * Working Hrs (Day), to whole minutes, so the two columns always agree. Shown
 * as HH:MM:SS. A day with no check-out shows "-".
 */
const durationHms = (item) => {
  if (!item?.logInTime || !item?.logOutTime || item.logOutTime === '--') return '-';
  return minutesToHms(workingMinutesForRow(item));
};

/** Stable per-employee key for the period total. */
const employeeKey = (item) =>
  String(item?.employee?._id || item?.employee?.emp_id || item?.id || item?.employee?.email || '');

const getSingleImageUrl = (item) => {
  const img =
    item?.imageUrls?.[0]?.images?.frame ||
    item?.imageUrls?.[0]?.images?.person ||
    item?.imageUrls?.[0]?.images?.face;
  return img ? `${import.meta.env.VITE_BACKEND}/uploads/${img}` : '';
};

const rowDate = (item) =>
  moment(item.logInTime).isValid()
    ? moment(item.logInTime).format('DD/MM/YYYY')
    : moment(item.logOutTime).isValid()
      ? moment(item.logOutTime).format('DD/MM/YYYY')
      : item?.date
        ? moment(item.date).format('DD/MM/YYYY')
        : '-';

const cleanField = (value) => {
  if (value === null || value === undefined) return '-';
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '-';
  return text;
};

/**
 * Fetch the full (unpaginated) result set for export using the current filters.
 * `params` mirrors the exact getAttendanceLogs argument list used by the page.
 */
const fetchAllForExport = async (params) => {
  const {
    searchInput,
    nvrIds,
    cameraId,
    startDate,
    endDate,
    currentPage,
    limit,
    sortField,
    sortOrder,
    selectedDepartments,
    fromTime,
    toTime,
    timeType,
    employeeLocations,
    region,
    statusFilter,
  } = params;

  const departmentIds = selectedDepartments.join(',');
  const convertToUTC = (date, time) => {
    if (!date || !time) return null;
    const hasAmPm = /am|pm/i.test(time);
    const format = hasAmPm ? 'YYYY-MM-DD hh:mm A' : 'YYYY-MM-DD HH:mm';
    return moment.tz(`${date} ${time}`, format, region).utc().format('HH:mm');
  };
  const utcFromTime = convertToUTC(startDate, fromTime);
  const utcToTime = convertToUTC(startDate, toTime);
  const nvrIdStr = Array.isArray(nvrIds) ? nvrIds.join(',') : '';
  const cameraIdStr = Array.isArray(cameraId) ? cameraId.join(',') : '';

  const response = await getAttendanceLogs(
    searchInput,
    nvrIdStr,
    cameraIdStr,
    startDate,
    endDate,
    currentPage,
    limit,
    sortField,
    sortOrder,
    departmentIds,
    utcFromTime,
    utcToTime,
    timeType,
    true,
    employeeLocations,
    statusFilter
  );

  return response?.data?.body?.data?.attendanceLogs || [];
};

/**
 * One export row per employee-day, with all the auto-email-report columns.
 * `Total Working Hrs (Period)` is a per-employee sum over the whole result set,
 * so every row for the same employee shows the same value.
 */
const buildExportRows = (allLogs, region) => {
  const periodMinutesByEmployee = new Map();
  allLogs.forEach((item) => {
    const key = employeeKey(item);
    periodMinutesByEmployee.set(
      key,
      (periodMinutesByEmployee.get(key) || 0) + workingMinutesForRow(item)
    );
  });

  return allLogs.map((item, index) => {
    const key = employeeKey(item);
    return {
      ID: index + 1,
      Name: item.employee
        ? `${item.employee.firstName || ''} ${item.employee.lastName || ''}`.trim() || '-'
        : '-',
      Department: cleanField(item.employee?.departmentId?.departmentName),
      Date: rowDate(item),
      Location: cleanField(item.employee?.location),
      CheckIn: convertToRegionTime(item.logInTime, region),
      CheckOut: item.logOutTime === '--' ? '-' : convertToRegionTime(item.logOutTime, region),
      Duration: durationHms(item),
      WorkingDay: minutesToHms(workingMinutesForRow(item)),
      BreakDay: minutesToHms(breakMinutesForRow(item)),
      WorkingPeriod: formatPeriodDuration(periodMinutesByEmployee.get(key) || 0),
      CheckinCamera: cleanField(item.checkinCam),
      CheckoutCamera: cleanField(item.checkoutCam),
      ImageUrl: getSingleImageUrl(item),
    };
  });
};

/**
 * Report-wide totals for the closing grand-total row:
 *   - working / break minutes summed over every employee-day row
 *   - period minutes: each employee's period total counted once (it already
 *     spans all their days).
 */
const buildGrandTotals = (allLogs) => {
  let workingMinutes = 0;
  let breakMinutes = 0;
  const periodByEmployee = new Map();
  allLogs.forEach((item) => {
    workingMinutes += workingMinutesForRow(item);
    breakMinutes += breakMinutesForRow(item);
    const key = employeeKey(item);
    periodByEmployee.set(
      key,
      (periodByEmployee.get(key) || 0) + workingMinutesForRow(item)
    );
  });
  let periodMinutes = 0;
  periodByEmployee.forEach((value) => {
    periodMinutes += value;
  });
  return {
    Duration: minutesToHms(workingMinutes),
    WorkingDay: minutesToHms(workingMinutes),
    BreakDay: minutesToHms(breakMinutes),
    WorkingPeriod: formatPeriodDuration(periodMinutes),
  };
};

const HEADERS = [
  'ID',
  'Name',
  'Department',
  'Date',
  'Location',
  'Check in',
  'Check out',
  'Duration',
  'Total Working Hrs (Day)',
  'Total Break Hrs (Day)',
  'Total Working Hrs (Period)',
  'Checkin Camera',
  'Checkout Camera',
  'View Image',
];
const IMAGE_COL = HEADERS.length - 1;

const periodLabel = (params) => {
  const { startDate, endDate } = params;
  const s = moment(startDate);
  const e = moment(endDate || startDate);
  if (!s.isValid()) return '';
  return `${s.format('DD MMM YYYY')} – ${e.isValid() ? e.format('DD MMM YYYY') : s.format('DD MMM YYYY')}`;
};

const exportToPDF = async (params) => {
  const { region } = params;
  const allLogs = await fetchAllForExport(params);
  if (!allLogs.length) {
    toast.error('No data to export');
    return;
  }

  const rowsData = buildExportRows(allLogs, region);

  const doc = new jsPDF('landscape', 'pt', 'a3');
  const pageWidth = doc.internal.pageSize.getWidth();

  // Styled header bar — blue block with a purple title panel on the right.
  const V2_BLUE = '#609ff7';
  const V2_PURPLE = '#9274f5';
  const titleBlock = 300;
  doc.setFillColor(V2_BLUE);
  doc.rect(0, 0, pageWidth, 92, 'F');
  doc.setFillColor(V2_PURPLE);
  doc.rect(pageWidth - titleBlock, 0, titleBlock, 92, 'F');
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Attendance Report', pageWidth - 24, 34, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Attendance Logs export', pageWidth - 24, 52, { align: 'right' });

  doc.setTextColor('#273657');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(periodLabel(params), 32, 118);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#61708f');
  doc.text(
    `Timezone: ${region}  •  ${rowsData.length} attendance record${rowsData.length === 1 ? '' : 's'}`,
    32,
    134
  );

  const body = rowsData.map((row) => [
    row.ID,
    row.Name,
    row.Department,
    row.Date,
    row.Location,
    row.CheckIn,
    row.CheckOut,
    row.Duration,
    row.WorkingDay,
    row.BreakDay,
    row.WorkingPeriod,
    row.CheckinCamera,
    row.CheckoutCamera,
    '', // View Image — drawn in didDrawCell
  ]);

  const grand = buildGrandTotals(allLogs);
  const foot = [[
    '', 'TOTAL (all employees)', '', '', '', '', '',
    grand.Duration,
    grand.WorkingDay,
    grand.BreakDay,
    grand.WorkingPeriod,
    '', '', '',
  ]];

  autoTable(doc, {
    head: [HEADERS],
    body,
    foot,
    showFoot: 'lastPage',
    startY: 148,
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: '#173b83', textColor: '#ffffff', fontStyle: 'bold', fontSize: 7 },
    footStyles: { fillColor: '#d7e2f7', textColor: '#173b83', fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: '#eef2fb' },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 96 },
      2: { cellWidth: 92 },
      3: { cellWidth: 58 },
      4: { cellWidth: 64 },
      5: { cellWidth: 62 },
      6: { cellWidth: 62 },
      7: { cellWidth: 54 },
      8: { cellWidth: 66 },
      9: { cellWidth: 64 },
      10: { cellWidth: 78 },
      11: { cellWidth: 110 },
      12: { cellWidth: 110 },
      [IMAGE_COL]: { cellWidth: 52 },
    },
    didDrawCell: (data) => {
      if (data.column.index === IMAGE_COL && data.section === 'body') {
        const url = rowsData[data.row.index]?.ImageUrl;
        if (!url) return;
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 255);
        doc.setFontSize(7);
        const text = 'View Image';
        const textX = data.cell.x + 4;
        const textY = data.cell.y + data.cell.height / 2 + 2;
        doc.text(text, textX, textY);
        const textWidth = doc.getTextWidth(text);
        doc.setLineWidth(0.3);
        doc.setDrawColor(0, 0, 255);
        doc.line(textX, textY + 1, textX + textWidth, textY + 1);
      }
    },
  });

  doc.save('attendance_logs_report.pdf');
};

const exportToExcel = async (params) => {
  const { region } = params;
  const allLogs = await fetchAllForExport(params);
  if (!allLogs.length) {
    toast.error('No data to export');
    return;
  }

  const rowsData = buildExportRows(allLogs, region);

  const aoa = [
    ['VideoraIQ Attendance Report'],
    ['Period', periodLabel(params)],
    ['Timezone', region],
    [],
    HEADERS,
    ...rowsData.map((row) => [
      row.ID,
      row.Name,
      row.Department,
      row.Date,
      row.Location,
      row.CheckIn,
      row.CheckOut,
      row.Duration,
      row.WorkingDay,
      row.BreakDay,
      row.WorkingPeriod,
      row.CheckinCamera,
      row.CheckoutCamera,
      '', // View Image — replaced with a HYPERLINK formula below
    ]),
    (() => {
      const grand = buildGrandTotals(allLogs);
      return [
        '', 'TOTAL (all employees)', '', '', '', '', '',
        grand.Duration,
        grand.WorkingDay,
        grand.BreakDay,
        grand.WorkingPeriod,
        '', '', '',
      ];
    })(),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Header row is at aoa index 4; data rows start at 5.
  const dataStartRow = 5;
  rowsData.forEach((row, i) => {
    if (!row.ImageUrl) return;
    const cellRef = XLSX.utils.encode_cell({ r: dataStartRow + i, c: IMAGE_COL });
    worksheet[cellRef] = {
      t: 's',
      f: `HYPERLINK("${row.ImageUrl}","View Image")`,
      v: 'View Image',
    };
  });

  worksheet['!cols'] = [
    { wch: 5 }, { wch: 22 }, { wch: 20 }, { wch: 12 }, { wch: 14 },
    { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 12 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Logs');
  XLSX.writeFile(workbook, 'attendance_logs_report.xlsx');
};

/** Entry point used by the page's Export buttons. */
export const handleAttendanceExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
};
