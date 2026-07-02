import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { getAttendanceLogs } from './Api';

const convertToRegionTime = (utcTime, region) => {
  if (!utcTime) return '--';
  return moment.utc(utcTime).tz(region).format('hh:mm:ss A');
};

const getSingleImageUrl = (item) => {
  const img =
    item?.imageUrls?.[0]?.images?.person ||
    item?.imageUrls?.[0]?.images?.face ||
    item?.imageUrls?.[0]?.images?.frame;
  return img ? `${import.meta.env.VITE_BACKEND}/api/v1/uploads/${img}` : '';
};

const rowDate = (item) =>
  moment(item.logInTime).isValid()
    ? moment(item.logInTime).format('DD/MM/YYYY')
    : moment(item.logOutTime).isValid()
      ? moment(item.logOutTime).format('DD/MM/YYYY')
      : '-';

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
    employeeLocations
  );

  return response?.data?.body?.data?.attendanceLogs || [];
};

const exportToPDF = async (params) => {
  const { region } = params;
  const allLogs = await fetchAllForExport(params);
  if (!allLogs.length) {
    toast.error('No data to export');
    return;
  }

  const baseData = allLogs.map((item, index) => ({
    ID: index + 1,
    Name: item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : '--',
    Department: item.employee?.departmentId?.departmentName || '--',
    Date: rowDate(item),
    Location: item.employee?.location || '--',
    CheckIn: convertToRegionTime(item.logInTime, region),
    CheckOut: item.logOutTime === '--' ? '--' : convertToRegionTime(item.logOutTime, region),
    CheckinCamera: item.checkinCam ? item.checkinCam : '--',
    CheckoutCamera: item.checkoutCam ? item.checkoutCam : '--',
    ImageUrl: getSingleImageUrl(item),
  }));

  const doc = new jsPDF('landscape');
  doc.setFont('helvetica');
  doc.setFontSize(12);
  doc.text('Attendance Logs Report', 14, 12);
  doc.text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm')}`, 14, 18);

  const headers = [
    'ID',
    'Name',
    'Department',
    'Date',
    'Location',
    'Check in',
    'Check out',
    'Checkin Camera',
    'Checkout Camera',
    'View Image',
  ];

  const rows = baseData.map((row) => [
    row.ID,
    row.Name,
    row.Department,
    row.Date,
    row.Location,
    row.CheckIn,
    row.CheckOut,
    row.CheckinCamera,
    row.CheckoutCamera,
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 26,
    styles: { fontSize: 7 },
    columnStyles: { 9: { cellWidth: 40 } },
    didDrawCell: function (data) {
      if (data.column.index === 9 && data.section === 'body') {
        const imageUrl = baseData[data.row.index].ImageUrl;
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: imageUrl });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 255);
        const text = 'View Image';
        const textX = data.cell.x + 4;
        const textY = data.cell.y + data.cell.height / 2 + 2;
        doc.text(text, textX, textY);
        const textWidth = doc.getTextWidth(text);
        doc.setLineWidth(0.3);
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

  const data = allLogs.map((item, index) => ({
    ID: index + 1,
    Name: item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : '--',
    Department: item.employee?.departmentId?.departmentName || 'Unknown',
    Date: rowDate(item),
    Location: item.employee?.location || '--',
    'Check in': convertToRegionTime(item.logInTime, region),
    'Check out': item.logOutTime === '--' ? '--' : convertToRegionTime(item.logOutTime, region),
    'Checkin Camera': item.checkinCam ? item.checkinCam : '--',
    'Checkout Camera': item.checkoutCam ? item.checkoutCam : '--',
    'View Image': '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  allLogs.forEach((item, index) => {
    const url = getSingleImageUrl(item);
    const cellRef = XLSX.utils.encode_cell({ r: index + 1, c: 9 });
    worksheet[cellRef] = { t: 'f', f: `HYPERLINK("${url}", "View Image")` };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Logs');
  XLSX.writeFile(workbook, 'attendance_logs_report.xlsx');
};

/** Entry point used by the page's Export buttons. */
export const handleAttendanceExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
};
