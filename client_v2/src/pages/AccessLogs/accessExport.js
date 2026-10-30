import { getAccessTimes } from './accessTimes';
import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { getAllAccessLogsDetails } from './Api';
import logoUrl from '@/assets/videoraiq-logo-white.png';

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
  if (!img) return '';
  const backend = String(import.meta.env.VITE_BACKEND || '').replace(/\/+$/, '');
  const imagePath = String(img).replace(/^\/+/, '');
  return new URL(`${backend}/uploads/${imagePath}`, window.location.origin).href;
};

const getGridImageUrl = (item) => {
  const images = item?.sessions?.[0]?.images;
  const img = images?.personImage || images?.frameImage || images?.faceImage || item?.userInfo?.profilePics?.[0];
  return img ? `${import.meta.env.VITE_BACKEND}/uploads/${String(img).replace(/^\/+/, '')}` : '';
};

export const formatAccessTime = (enteredIn, exitTiming, region) => {
  const inMoment = enteredIn ? moment.utc(enteredIn).tz(region) : null;
  const outMoment = exitTiming ? moment.utc(exitTiming).tz(region) : null;

  if (!inMoment) return outMoment ? outMoment.format('hh:mm A') : '--';

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
    const { enteredIn, exitTiming } = getAccessTimes(sessions);

    return {
      ID: index + 1,
      Name: log.userInfo?.userName || 'Unknown',
      Department: log.department?.departmentName || '--' ,
      Date: log.date ? moment.utc(log.date).tz(region).format('DD/MM/YYYY') : '--',
      Location: log.userInfo?.location || log.nvrInfo?.location || '--',
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
    const { enteredIn, exitTiming } = getAccessTimes(sessions);

    return [
      index + 1,
      log.userInfo?.userName || 'Unknown',
      log.department?.departmentName || '--',
      log.date ? moment.utc(log.date).tz(region).format('DD/MM/YYYY') : '--',
      log.userInfo?.location || log.nvrInfo?.location || '--',
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

const loadGridLogo = async () => {
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

const drawAccessGridHeader = (doc, logo, region, page, pageCount) => {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setFillColor(246, 248, 253);
  doc.rect(0, 0, width, height, 'F');
  doc.setFillColor(34, 25, 91);
  doc.rect(0, 0, width, 25, 'F');
  doc.setFillColor(91, 96, 242);
  doc.rect(width - 8, 0, 8, 25, 'F');
  let logoDrawn = false;
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 9, 7, 42, 12);
      logoDrawn = true;
    } catch {
      // Use the text mark when the bundled image is unavailable.
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
  doc.text('Access Logs', 63, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(218, 225, 255);
  doc.text('GRID REPORT', 63, 18);
  doc.setDrawColor(225, 230, 240);
  doc.line(8, height - 10, width - 8, height - 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(105, 115, 140);
  doc.text(`Generated ${moment().tz(region).format('DD/MM/YYYY hh:mm A')}`, 8, height - 5);
  doc.text(`Page ${page} of ${pageCount}`, width - 8, height - 5, { align: 'right' });
};

const drawAccessDetailIcon = (doc, line, x, y) => {
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
  } else if (line === 4) {
    doc.circle(x, y - 0.8, 1.2);
    doc.line(x, y - 0.8, x, y - 1.5);
    doc.line(x, y - 0.8, x + 0.6, y - 0.5);
  } else if (line === 5) {
    doc.roundedRect(x - 1.3, y - 1.8, 1.9, 2.2, 0.2, 0.2);
    doc.line(x + 0.6, y - 1.2, x + 1.3, y - 1.7);
    doc.line(x + 0.6, y - 0.2, x + 1.3, y + 0.3);
    doc.line(x + 1.3, y - 1.7, x + 1.3, y + 0.3);
  } else if (line === 6) {
    doc.line(x - 1.3, y - 1.9, x + 0.3, y - 1.9);
    doc.line(x + 0.3, y - 1.9, x + 1.3, y - 0.8);
    doc.line(x + 1.3, y - 0.8, x + 0.3, y + 0.5);
    doc.line(x + 0.3, y + 0.5, x - 1.3, y + 0.5);
    doc.line(x - 1.3, y + 0.5, x - 1.3, y - 1.9);
    doc.circle(x - 0.7, y - 1.2, 0.2);
  }
};

const exportToGridPDF = async (params) => {
  const allLogs = await fetchAllForExport(params);
  if (!allLogs.length) {
    toast.error('No data to export');
    return;
  }

  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 8;
  const gap = 4;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const cardHeight = 80;
  let progress = 0;
  let pageImages = [];
  const progressId = 'access-grid-pdf';
  toast.loading(`Preparing grid PDF... 0/${allLogs.length}`, { id: progressId });

  try {
    const logo = await loadGridLogo();
    for (let i = 0; i < allLogs.length; i += 1) {
      const position = i % 8;
      if (i > 0 && position === 0) doc.addPage();
      if (position === 0) {
        drawAccessGridHeader(doc, logo, params.region, Math.floor(i / 8) + 1, Math.ceil(allLogs.length / 8));
        pageImages = await Promise.all(allLogs.slice(i, i + 8).map(async (item) => {
          const url = getGridImageUrl(item);
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
        }));
      }
      const x = margin + (position % 4) * (cardWidth + gap);
      const y = 29 + Math.floor(position / 4) * (cardHeight + gap);
      const log = allLogs[i];
      const sessions = log.sessions || [];
      const { enteredIn, exitTiming } = getAccessTimes(sessions);
      const imageUrl = getGridImageUrl(log);

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(220, 225, 238);
      doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');
      doc.setFillColor(232, 236, 247);
      doc.rect(x + 1, y + 1, cardWidth - 2, 39, 'F');
      if (imageUrl) {
        if (pageImages[position]) {
          doc.addImage(pageImages[position], 'JPEG', x + 1, y + 1, cardWidth - 2, 39, undefined, 'FAST');
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(91, 101, 129);
          doc.text('View image', x + 4, y + 22);
        }
        doc.link(x + 1, y + 1, cardWidth - 2, 39, { url: imageUrl });
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(91, 101, 129);
        doc.text('No image', x + 4, y + 22);
      }

      const tagLabel = log.tag ? 'Tagged' : 'Untagged';
      doc.setFillColor(...(log.tag ? [27, 163, 99] : [86, 96, 230]));
      doc.roundedRect(x + cardWidth - 25, y + 3, 22, 6, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(255, 255, 255);
      doc.text(tagLabel, x + cardWidth - 14, y + 7.1, { align: 'center' });
      doc.setFillColor(91, 96, 242);
      doc.rect(x + 1, y + 40, cardWidth - 2, 1, 'F');

      const details = [
        ['Employee Name', log.userInfo?.userName || 'Unknown'],
        ['Department', log.department?.departmentName || '--'],
        ['Date', log.date ? moment.utc(log.date).tz(params.region).format('DD/MM/YYYY') : '--'],
        ['Location', log.userInfo?.location || log.nvrInfo?.location || '--'],
        ['Access Time', formatAccessTime(enteredIn, exitTiming, params.region)],
        ['Camera', sessions[0]?.channel?.name || '--'],
        ['Tag Status', tagLabel],
      ];
      details.forEach(([label, value], line) => {
        const textY = y + 46 + line * 4.5;
        drawAccessDetailIcon(doc, line, x + 4.6, textY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(91, 102, 130);
        doc.text(label, x + 7, textY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(22, 34, 69);
        doc.text(doc.splitTextToSize(String(value), cardWidth - 32)[0] || '--', x + 28, textY);
      });
      progress += 1;
      if (progress % 10 === 0 || progress === allLogs.length) {
        toast.loading(`Preparing grid PDF... ${progress}/${allLogs.length}`, { id: progressId });
      }
    }
    doc.save('access_logs_report_grid.pdf');
    toast.success('Grid PDF downloaded');
  } catch (error) {
    console.error('Failed to export access logs grid PDF:', error);
    toast.error('Failed to export grid PDF');
  } finally {
    toast.dismiss(progressId);
  }
};

/** Entry point used by the page's Export buttons. */
export const handleAccessExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
  if (format === 'pdf-grid') await exportToGridPDF(params);
};
