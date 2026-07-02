import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { getAllAccessLogsDetails } from './Api';

const convertToUTC = (date, time, region) => {
  if (!date || !time) return null;
  const hasAmPm = /am|pm/i.test(time);
  const format = hasAmPm ? 'YYYY-MM-DD hh:mm A' : 'YYYY-MM-DD HH:mm';
  return moment.tz(`${date} ${time}`, format, region).utc().format('HH:mm');
};

const getSingleImageUrl = (item) => {
  const img =
    item?.sessions?.[0]?.images?.frameImage ||
    item?.sessions?.[0]?.images?.personImage ||
    item?.sessions?.[0]?.images?.faceImage;
  return img ? `${import.meta.env.VITE_BACKEND}/api/v1/uploads/${img}` : '';
};

export const formatAccessTime = (enteredIn, exitTiming, region) => {
  const inMoment = enteredIn ? moment.utc(enteredIn).tz(region) : null;
  const outMoment = exitTiming ? moment.utc(exitTiming).tz(region) : null;

  if (!inMoment) return '--';

  let diffText = '';
  if (inMoment && outMoment) {
    const diffMs = outMoment.diff(inMoment);
    const duration = moment.duration(diffMs);
    const totalMinutes = Math.floor(duration.asMinutes());
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0 && minutes === 0) diffText = '';
    else if (hours === 0) diffText = ` (${minutes}Mins)`;
    else if (minutes === 0) diffText = ` (${hours}Hrs)`;
    else diffText = ` (${hours} Hrs ${minutes} Mins)`;
  }

  return outMoment
    ? `${inMoment.format('hh:mm A')} - ${outMoment.format('hh:mm A')}${diffText}`
    : inMoment.format('hh:mm A');
};

/**
 * Fetch the full (unpaginated) result set for export using the current filters.
 * `params` mirrors the exact getAllAccessLogsDetails body used by the page.
 */
const fetchAllForExport = async (params) => {
  const {
    startDate,
    endDate,
    searchInput,
    skip,
    limit,
    sortOrder,
    sortField,
    selectedDepartments,
    channelIds,
    nvrIds,
    employeeLocations,
    removeUnknown,
    fromTime,
    toTime,
    region,
  } = params;

  const utcFromTime = convertToUTC(startDate, fromTime, region);
  const utcToTime = convertToUTC(startDate, toTime, region);

  const payload = {
    startDate,
    endDate,
    searchQuery: searchInput || '',
    skip,
    limit,
    sortOrder,
    sortField,
    departmentIds: selectedDepartments,
    channelIds,
    nvrIds,
    employeeLocations,
    removeUnknown,
    isExport: true,
    ...(fromTime && toTime && { fromTime: utcFromTime, toTime: utcToTime }),
  };

  const res = await getAllAccessLogsDetails(payload);
  return res?.data?.body?.data?.usersLogs || [];
};

const exportToExcel = async (params) => {
  const { region } = params;
  const allLogs = await fetchAllForExport(params);

  if (!allLogs.length) {
    toast.error('No data to export');
    return;
  }

  const excelData = allLogs.map((log, index) => {
    const sessions = log.sessions || [];
    const enteredIn = sessions?.length ? sessions[0].timestamp : null;
    const exitTiming = sessions?.length > 1 ? sessions[sessions.length - 1].timestamp : null;

    return {
      ID: index + 1,
      Name: log.userInfo?.userName || 'Unknown',
      Department: log.department?.departmentName || 'unknown',
      Date: log.date ? moment.utc(log.date).tz(region).format('DD/MM/YYYY') : '--',
      Location: log.userInfo?.location || '--',
      'Access Time': formatAccessTime(enteredIn, exitTiming, region),
      Camera: sessions[0]?.channel?.name || '--',
      viewImage: '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);

  allLogs.forEach((log, index) => {
    const url = getSingleImageUrl(log);
    const cellRef = XLSX.utils.encode_cell({ r: index + 1, c: 7 });
    worksheet[cellRef] = { t: 'f', f: `HYPERLINK("${url}", "View Image")` };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Access Logs');
  XLSX.writeFile(workbook, 'access_logs_report.xlsx');
};

const exportToPDF = async (params) => {
  const { region } = params;
  const allLogs = await fetchAllForExport(params);

  if (!allLogs.length) {
    toast.error('No data to export');
    return;
  }

  const doc = new jsPDF('landscape');
  doc.setFont('helvetica');
  doc.setFontSize(12);
  doc.text('Access Logs Report', 14, 12);
  doc.text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm')}`, 14, 18);

  const headers = [
    'ID',
    'Name',
    'Department',
    'Date',
    'Location',
    'Access Time',
    'Camera',
    'View Image',
  ];

  const rows = allLogs.map((log, index) => {
    const sessions = log.sessions || [];
    const enteredIn = sessions?.length ? sessions[0].timestamp : null;
    const exitTiming = sessions?.length > 1 ? sessions[sessions.length - 1].timestamp : null;

    return [
      index + 1,
      log.userInfo?.userName || 'Unknown',
      log.department?.departmentName || '--',
      log.date ? moment.utc(log.date).tz(region).format('DD/MM/YYYY') : '--',
      log.userInfo?.location || '--',
      formatAccessTime(enteredIn, exitTiming, region),
      sessions[0]?.channel?.name || '--',
    ];
  });

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 20,
    styles: { fontSize: 8 },
    didDrawCell: function (data) {
      if (data.column.index === 7 && data.section === 'body') {
        const url = getSingleImageUrl(allLogs[data.row.index]);
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 255);
        const text = 'View Image';
        const textX = data.cell.x + 4;
        const textY = data.cell.y + data.cell.height / 2 + 2;
        doc.text(text, textX, textY);
        const textWidth = doc.getTextWidth(text);
        doc.setLineWidth(0.5);
        doc.line(textX, textY + 1, textX + textWidth, textY + 1);
        doc.setDrawColor(0, 0, 255);
      }
    },
  });

  doc.save('access_logs_report.pdf');
};

/** Entry point used by the page's Export buttons. */
export const handleAccessExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
};
