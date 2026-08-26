import axios from 'axios';
import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import getAccessToken from '@/utils/getAccessToken';
import logoUrl from '@/assets/videoraiq-logo-white.png';

const HOST = import.meta.env.VITE_BACKEND;

const getHeaders = () => ({
  Accept: 'application/json',
  'x-access-token': getAccessToken(),
});

const getCarImageUrl = (item) => {
  const path = item.Image || item.image || item.imageUrl || item.carImage || item.carImageUrl || '';
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
  return `${INCIDENT_URL}${path}`;
};

const getModelName = (item) =>
  item.modelName ||
  item.modelname ||
  item.model_name ||
  item.carModelName ||
  item.carModel ||
  item.model ||
  '--';

const getYear = (item) => item.year || item.modelYear || item.carYear || '--';
const getColor = (item) => item.color || item.colour || item.carColor || '--';
const getCompany = (item) => item.company || item.make || item.carCompany || '--';

const formatIncidentTime = (value) =>
  value ? moment.utc(value).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A') : '--';

const fetchAllForExport = async ({
  startDate,
  endDate,
  sortField,
  sortOrder,
  nvrIds,
  channelIds,
  vehicleNumber,
  searchInput,
}) => {
  const res = await axios.post(
    `${HOST}/incidents/logs/car-model-detection`,
    {},
    {
      params: {
        skip: 0,
        limit: 10000,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(sortField && { sortField }),
        ...(sortOrder && { sortOrder }),
        ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
        ...(channelIds?.length && { channelIds: channelIds.join(',') }),
        ...(vehicleNumber && { vehicleNumber }),
        ...(searchInput && { search: searchInput }),
      },
      headers: getHeaders(),
    }
  );

  const list = res?.data?.body?.data?.data || [];
  return list.map((item) => ({
    modelName: getModelName(item),
    vehicleNumber: item.vehicleNumber || '--',
    vehicleVisitCount: Number(item.vehicleLogCount || 0),
    company: getCompany(item),
    color: getColor(item),
    year: getYear(item),
    nvrName: item.nvrData?.nvrName || '--',
    channelName: item.channelData?.name || '--',
    incidentTime: formatIncidentTime(item.timeOfIncident || item.createdAt),
    imageUrl: getCarImageUrl(item),
  }));
};

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

const exportToPDF = async (params) => {
  try {
    const allLogs = await fetchAllForExport(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(245, 248, 255);
    doc.rect(0, 0, pageWidth, 210, 'F');
    doc.setFillColor(38, 17, 105);
    doc.roundedRect(8, 7, pageWidth - 16, 30, 2, 2, 'F');
    doc.setFillColor(49, 36, 137);
    doc.roundedRect(8, 7, pageWidth - 16, 30, 2, 2, 'F');
    doc.setFillColor(27, 18, 92);
    doc.triangle(8, 7, 92, 7, 8, 37, 'F');

    try {
      const logoDataUrl = await imageToDataUrl(logoUrl);
      doc.addImage(logoDataUrl, 'PNG', 17, 17, 50, 11);
    } catch {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text('VideorAIQ', 18, 24);
    }

    doc.setDrawColor(70, 91, 178);
    doc.line(74, 14, 74, 31);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Car Detection Logs', 82, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(220, 230, 255);
    doc.text(`Generated on ${moment().format('DD/MM/YYYY hh:mm A')} | Total records: ${allLogs.length}`, 82, 27);

    const headers = [
      '#',
      'Model Name',
      'Vehicle Number',
      'Vehicle Visit Count',
      'Company',
      'Colour',
      'Year',
      'NVR Name',
      'Camera Name',
      'Time',
      'Image',
    ];
    const tableRows = allLogs.map((row, i) => [
      i + 1,
      row.modelName,
      row.vehicleNumber,
      row.vehicleVisitCount,
      row.company,
      row.color,
      row.year,
      row.nvrName,
      row.channelName,
      row.incidentTime,
      '',
    ]);

    autoTable(doc, {
      head: [headers],
      body: tableRows,
      startY: 45,
      margin: { left: 10, right: 10 },
      styles: {
        fontSize: 7,
        cellPadding: 2.2,
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [35, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 9 },
        10: { cellWidth: 25 },
      },
      didDrawCell: (data) => {
        if (data.column.index === 10 && data.section === 'body') {
          const url = allLogs[data.row.index]?.imageUrl;
          if (url) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
            doc.setTextColor(37, 99, 235);
            const text = 'View Image';
            const textX = data.cell.x + 3;
            const textY = data.cell.y + data.cell.height / 2 + 2;
            doc.text(text, textX, textY);
            doc.setDrawColor(37, 99, 235);
            doc.line(textX, textY + 1, textX + doc.getTextWidth(text), textY + 1);
            doc.setTextColor(0, 0, 0);
          }
        }
      },
    });

    doc.save('car_detection_logs.pdf');
  } catch (error) {
    console.log('Failed to export car logs PDF:', error);
    toast.error('Failed to export PDF');
  }
};

const exportToExcel = async (params) => {
  try {
    const allLogs = await fetchAllForExport(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const headerRows = [
      ['VIDEORAIQ', '', '', '', '', '', '', '', '', '', ''],
      ['Car Detection Logs', '', '', '', '', '', '', '', '', '', ''],
      [`Generated on ${moment().format('DD/MM/YYYY HH:mm')}`, '', '', '', `Total records: ${allLogs.length}`, '', '', '', '', '', ''],
      [],
    ];

    const tableRows = allLogs.map((row, i) => [
      i + 1,
      row.modelName,
      row.vehicleNumber,
      row.vehicleVisitCount,
      row.company,
      row.color,
      row.year,
      row.nvrName,
      row.channelName,
      row.incidentTime,
      row.imageUrl ? 'View Image' : '',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([
      ...headerRows,
      ['#', 'Model Name', 'Vehicle Number', 'Vehicle Visit Count', 'Company', 'Colour', 'Year', 'NVR Name', 'Camera Name', 'Time', 'Image'],
      ...tableRows,
    ]);

    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      { s: { r: 2, c: 4 }, e: { r: 2, c: 10 } },
    ];
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 22 },
      { wch: 18 },
      { wch: 20 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
      { wch: 22 },
      { wch: 24 },
      { wch: 22 },
      { wch: 16 },
    ];

    allLogs.forEach((row, i) => {
      if (row.imageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 5, c: 10 });
        worksheet[cellRef] = {
          t: 's',
          v: 'View Image',
          l: { Target: row.imageUrl, Tooltip: 'Open car image' },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Car Logs');
    XLSX.writeFile(workbook, 'car_detection_logs.xlsx');
  } catch (error) {
    console.log('Failed to export car logs Excel:', error);
    toast.error('Failed to export Excel');
  }
};

export const handleCarExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
};
