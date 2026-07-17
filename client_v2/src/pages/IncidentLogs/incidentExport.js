import moment from 'moment-timezone';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { fetchIncidentLogs } from './Api';
import { formatStatus } from './incidentColumns';

/**
 * Fetch the full (unpaginated) result set for export using the current filters,
 * mapped to the export row shape. Mirrors the V1 EmployeeLogs export.
 */
const fetchAllForExport = async (config, params) => {
  const { startDate, endDate, sortField, sortOrder, nvrIds, channelIds, severity, status, searchInput } = params;

  const res = await fetchIncidentLogs({
    endpoint: config.endpoint,
    skip: 0,
    limit: 10000,
    startDate,
    endDate,
    sortField,
    sortOrder,
    nvrIds,
    channelIds,
    severity,
    status,
    search: searchInput,
  });

  const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
  const list = res?.data?.body?.data?.data || [];
  return list.map((item) => ({
    incidentName: item.incidentName || '--',
    currentStatus: formatStatus(item.currentStatus || '--', config),
    nvrName: item.nvrData?.nvrName || '--',
    channelName: item.channelData?.name || '--',
    createdAt: item.createdAt
      ? moment.utc(item.createdAt).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A')
      : '--',
    severity: item.severity || '--',
    incidentImageUrl: item.Image ? `${INCIDENT_URL}${item.Image}` : '',
  }));
};

// Column descriptors shared by the Excel + PDF exporters. The Status column is
// only present for log types that carry a current-status value.
const buildExportColumns = (config) => {
  const cols = [{ key: 'incidentName', label: 'Incident Name' }];
  if (config.showStatus) cols.push({ key: 'currentStatus', label: 'Current Status' });
  cols.push(
    { key: 'nvrName', label: 'NVR Name' },
    { key: 'channelName', label: 'Camera Name' },
    { key: 'severity', label: 'Severity' },
    { key: 'createdAt', label: 'Time of Incident' }
  );
  return cols;
};

const exportToPDF = async (config, params) => {
  try {
    const allLogs = await fetchAllForExport(config, params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF('landscape');
    doc.setFont('helvetica');
    doc.setFontSize(12);
    doc.text(config.title, 14, 12);
    doc.setFontSize(9);
    doc.text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm')}`, 14, 18);

    const cols = buildExportColumns(config);
    const headers = ['#', ...cols.map((c) => c.label), 'Image'];
    const imageColIndex = headers.length - 1;
    const tableRows = allLogs.map((row, i) => [i + 1, ...cols.map((c) => row[c.key]), '']);

    autoTable(doc, {
      head: [headers],
      body: tableRows,
      startY: 24,
      styles: { fontSize: 7 },
      columnStyles: { [imageColIndex]: { cellWidth: 40 } },
      didDrawCell: (data) => {
        if (data.column.index === imageColIndex && data.section === 'body') {
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
    doc.save(`${config.fileName}.pdf`);
  } catch {
    toast.error('Failed to export PDF');
  }
};

const exportToExcel = async (config, params) => {
  try {
    const allLogs = await fetchAllForExport(config, params);
    if (!allLogs.length) {
      toast.error('No data to export');
      return;
    }

    const cols = buildExportColumns(config);
    const data = allLogs.map((row, i) => {
      const rec = { '#': i + 1 };
      cols.forEach((c) => {
        rec[c.label] = row[c.key];
      });
      rec.Image = '';
      return rec;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const imageColIndex = cols.length + 1; // after '#' + all cols

    allLogs.forEach((row, i) => {
      if (row.incidentImageUrl) {
        const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: imageColIndex });
        worksheet[cellRef] = { t: 'f', f: `HYPERLINK("${row.incidentImageUrl}", "View Image")` };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, config.sheetName || 'Logs');
    XLSX.writeFile(workbook, `${config.fileName}.xlsx`);
  } catch {
    toast.error('Failed to export Excel');
  }
};

/** Entry point used by the page's Export buttons. */
export const handleIncidentExport = async (format, config, params) => {
  if (format === 'excel') await exportToExcel(config, params);
  if (format === 'pdf') await exportToPDF(config, params);
};
