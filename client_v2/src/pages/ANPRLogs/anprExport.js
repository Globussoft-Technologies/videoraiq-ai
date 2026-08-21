import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { fetchVehicleObstructionLogs } from './Api';
import { taggedUserName } from '@/helpers/vehicleTagging';

/**
 * Fetch the full (unpaginated) result set for export using the current filters,
 * mapped to the export row shape. Mirrors the V1 ANPRLogs export exactly.
 */
const fetchAllForExport = async (params) => {
  const {
    startDate,
    endDate,
    sortField,
    sortOrder,
    nvrIds,
    channelIds,
    severity,
    resolved,
    reportStatus,
    vehicleNumber,
    tagStatus,
    searchInput,
  } = params;

  const res = await fetchVehicleObstructionLogs({
    skip: 0,
    limit: 10000,
    startDate,
    endDate,
    sortField,
    sortOrder,
    nvrIds,
    channelIds,
    severity,
    resolved,
    reportStatus,
    vehicleNumber,
    tagStatus,
    search: searchInput,
  });

  const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
  const list = res?.data?.body?.data?.data || [];
  return list.map((item) => ({
    incidentName: item.incidentName || '--',
    nvrName: item.nvrData?.nvrName || '--',
    channelName: item.channelData?.name || '--',
    vehicleNumber: item.vehicleNumber || '--',
    taggedUser: taggedUserName(item.taggedUser) || '--',
    createdAt: item.createdAt
      ? moment.utc(item.createdAt).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A')
      : '--',
    severity: item.severity || '--',
    incidentImageUrl: item.Image ? `${INCIDENT_URL}${item.Image}` : '',
  }));
};

const exportToPDF = async (params) => {
  try {
    const allLogs = await fetchAllForExport(params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF('landscape');
    doc.setFont('helvetica');
    doc.setFontSize(12);
    doc.text('Vehicle & Obstruction Detection Logs', 14, 12);
    doc.setFontSize(9);
    doc.text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm')}`, 14, 18);

    const headers = ['#', 'Incident Name', 'NVR Name', 'Camera Name', 'Vehicle Number', 'Tagged User', 'Created At', 'Severity', 'Image'];
    const tableRows = allLogs.map((row, i) => [
      i + 1,
      row.incidentName,
      row.nvrName,
      row.channelName,
      row.vehicleNumber,
      row.taggedUser,
      row.createdAt,
      row.severity,
      '',
    ]);

    autoTable(doc, {
      head: [headers],
      body: tableRows,
      startY: 24,
      styles: { fontSize: 7 },
      columnStyles: { 8: { cellWidth: 40 } },
      didDrawCell: (data) => {
        if (data.column.index === 8 && data.section === 'body') {
          const url = allLogs[data.row.index]?.incidentImageUrl;
          if (url) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
            doc.setTextColor(0, 0, 255);
            const text = 'View Image';
            const textX = data.cell.x + 4;
            const textY = data.cell.y + data.cell.height / 2 + 2;
            doc.text(text, textX, textY);
            const textWidth = doc.getTextWidth(text);
            doc.setLineWidth(0.3);
            doc.line(textX, textY + 1, textX + textWidth, textY + 1);
            doc.setTextColor(0, 0, 0);
          }
        }
      },
    });
    doc.save('vehicle_obstruction_logs.pdf');
  } catch {
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

    const data = allLogs.map((row, i) => ({
      '#': i + 1,
      'Incident Name': row.incidentName,
      'NVR Name': row.nvrName,
      'Camera Name': row.channelName,
      'Vehicle Number': row.vehicleNumber,
      'Tagged User': row.taggedUser,
      'Created At': row.createdAt,
      Severity: row.severity,
      Image: '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    allLogs.forEach((row, i) => {
      if (row.incidentImageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: 8 });
        worksheet[cellRef] = { t: 'f', f: `HYPERLINK("${row.incidentImageUrl}", "View Image")` };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicle Obstruction Logs');
    XLSX.writeFile(workbook, 'vehicle_obstruction_logs.xlsx');
  } catch {
    toast.error('Failed to export Excel');
  }
};

/** Entry point used by the page's Export buttons. */
export const handleANPRExport = async (format, params) => {
  if (format === 'excel') await exportToExcel(params);
  if (format === 'pdf') await exportToPDF(params);
};
