import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment-timezone';
import { toast } from 'sonner';
import logoUrl from '@/assets/videoraiq-logo-white.png';
import { fetchIncidentLogs } from './Api';
import { getConfiguredTimezone } from '@/utils/timezone';

const EXPORT_LIMIT = 10000;
const EXPORT_FILE_NAME = 'Loading-Unloading Stock Logs';

const dash = (value) => (value === null || value === undefined || value === '' ? '--' : value);
const formatTime = (value) => (
  value
    ? moment.utc(value).tz(getConfiguredTimezone()).format('DD/MM/YYYY hh:mm A')
    : '--'
);
const vehicleNumberOf = (row) => String(row?.vehicleNumber || '').trim() || 'Unknown';
const nvrNameOf = (row) => row?.nvrData?.nvrName || row?.nvrName || '--';
const cameraNameOf = (row) => (
  row?.channelData?.customName
  || row?.channelData?.name
  || row?.channelName
  || '--'
);
const boxTypesOf = (row) => (
  (Array.isArray(row?.boxTypes) ? row.boxTypes : row?.boxType ? [row.boxType] : [])
    .filter(Boolean)
    .join(', ') || '--'
);
const movementOf = (row) => row?.direction || row?.stockMovement || '--';

const imageUrlOf = (item) => {
  const path = item?.Image || item?.image || item?.imageUrl || '';
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return `${import.meta.env.VITE_INCIDENT_URL || ''}${path}`;
};

const previewUrlOf = (item) => {
  const image = imageUrlOf(item);
  if (!image) return '';
  const events = Array.isArray(item?.events) ? item.events : [];
  // Match the group image to its own incident, which may use another camera.
  const incidentId = events.length
    ? events.find((event) => imageUrlOf(event) === image)?._id
    : item?._id;
  return incidentId
    ? new URL(`/playback?incidentId=${encodeURIComponent(incidentId)}`, window.location.origin).href
    : '';
};

const fetchAllForExport = async (config, filters = {}) => {
  const response = await fetchIncidentLogs({
    endpoint: config.endpoint,
    method: config.method,
    skip: 0,
    limit: EXPORT_LIMIT,
    startDate: filters.startDate,
    endDate: filters.endDate,
    sortField: filters.sortField,
    sortOrder: filters.sortOrder,
    nvrIds: filters.nvrIds,
    channelIds: filters.channelIds,
    status: filters.status,
    search: filters.searchInput,
    vehicleNumber: filters.vehicleNumber,
    boxType: filters.boxType,
  });

  return response?.data?.body?.data?.data || [];
};

const rangeNote = (filters) => (
  filters?.startDate && filters?.endDate
    ? `${moment(filters.startDate).format('DD/MM/YYYY')} - ${moment(filters.endDate).format('DD/MM/YYYY')}`
    : 'All dates'
);

const filterNote = (filters) => (
  filters?.vehicleNumber ? `Vehicle: ${filters.vehicleNumber}` : 'All vehicles'
);

const PARENT_HEADERS = [
  'S.No',
  'Image',
  'Incident Name',
  'NVR Name',
  'Camera Name',
  'Vehicle Number',
  'Movement',
  'Box Type',
  'Loaded',
  'Unloaded',
  'Total Boxes',
  'Time of Incident',
  'Preview',
];

const parentRow = (row, serial) => [
  serial,
  imageUrlOf(row) ? 'View Image' : '--',
  dash(row?.incidentName),
  nvrNameOf(row),
  cameraNameOf(row),
  vehicleNumberOf(row),
  movementOf(row),
  boxTypesOf(row),
  row?.loadedBoxCount ?? 0,
  row?.unloadedBoxCount ?? 0,
  row?.boxCount ?? row?.count ?? 0,
  formatTime(row?.timeOfIncident || row?.createdAt),
  previewUrlOf(row) ? 'Click for preview' : '--',
];

const eventDirection = (event) => String(event?.direction || '').toLowerCase();
const childRow = (event) => {
  const direction = eventDirection(event);
  const count = event?.boxCount ?? 0;
  return [
    '',
    imageUrlOf(event) ? 'View Image' : '--',
    `- ${direction || 'Stock movement'}`,
    dash(event?.nvrName),
    dash(event?.channelName),
    '',
    direction || '--',
    dash(event?.boxType),
    direction === 'loading' ? count : 0,
    direction === 'unloading' ? count : 0,
    count,
    formatTime(event?.timeOfIncident),
    previewUrlOf(event) ? 'Click for preview' : '--',
  ];
};

const MOVEMENT_HEADERS = [
  'S.No',
  'Vehicle Number',
  'Movement',
  'Box Type',
  'Boxes',
  'NVR Name',
  'Camera Name',
  'Description',
  'Time',
  'Image',
  'Preview',
];

const movementRow = (vehicle, event, serial) => [
  serial,
  vehicleNumberOf(vehicle),
  eventDirection(event) || '--',
  dash(event?.boxType),
  event?.boxCount ?? 0,
  dash(event?.nvrName),
  dash(event?.channelName),
  dash(event?.description),
  formatTime(event?.timeOfIncident),
  imageUrlOf(event) ? 'View Image' : '--',
  previewUrlOf(event) ? 'Click for preview' : '--',
];

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

const drawReportHeader = async (doc, title, subtitle) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(38, 17, 105);
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
  doc.text(title, 82, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(220, 230, 255);
  doc.text(subtitle, 82, 27);
  doc.setTextColor(0, 0, 0);
};

const excelHeaderBlock = (columnCount, filters, total) => {
  const pad = new Array(Math.max(0, columnCount - 1)).fill('');
  return [
    ['VIDEORAIQ', ...pad],
    ['Loading/Unloading Stock Logs', ...pad],
    [`${rangeNote(filters)}  |  ${filterNote(filters)}`, ...pad],
    [`Generated on ${moment().format('DD/MM/YYYY hh:mm A')}  |  Total vehicles: ${total}`, ...pad],
    [],
  ];
};

const excelMerges = (columnCount) => (
  [0, 1, 2, 3].map((row) => ({ s: { r: row, c: 0 }, e: { r: row, c: columnCount - 1 } }))
);

const linkImageCell = (sheet, rowIndex, columnIndex, url) => {
  if (!url) return;
  const ref = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  sheet[ref] = {
    t: 's',
    v: 'View Image',
    l: { Target: url, Tooltip: 'Open incident image' },
  };
};

const linkPreviewCell = (sheet, rowIndex, columnIndex, url) => {
  if (!url) return;
  const ref = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  sheet[ref] = {
    t: 's',
    v: 'Click for preview',
    l: { Target: url, Tooltip: 'Open playback for this detection' },
  };
};

const exportToExcel = async (config, filters) => {
  try {
    const vehicles = await fetchAllForExport(config, filters);
    if (!vehicles.length) {
      toast.error('Nothing to export for these filters');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const dataStart = 6;
    const imageColumn = 1;
    const groupedLines = [];

    vehicles.forEach((vehicle, index) => {
      groupedLines.push({ cells: parentRow(vehicle, index + 1), image: imageUrlOf(vehicle), preview: previewUrlOf(vehicle) });
      (vehicle.events || []).forEach((event) => {
        groupedLines.push({ cells: childRow(event), image: imageUrlOf(event), preview: previewUrlOf(event) });
      });
    });

    const vehiclesSheet = XLSX.utils.aoa_to_sheet([
      ...excelHeaderBlock(PARENT_HEADERS.length, filters, vehicles.length),
      PARENT_HEADERS,
      ...groupedLines.map((line) => line.cells),
    ]);
    vehiclesSheet['!merges'] = excelMerges(PARENT_HEADERS.length);
    vehiclesSheet['!cols'] = PARENT_HEADERS.map((header) => ({ wch: Math.max(14, header.length + 3) }));
    groupedLines.forEach((line, index) => {
      linkImageCell(vehiclesSheet, dataStart + index, imageColumn, line.image);
      linkPreviewCell(vehiclesSheet, dataStart + index, PARENT_HEADERS.indexOf('Preview'), line.preview);
    });
    XLSX.utils.book_append_sheet(workbook, vehiclesSheet, 'Vehicles');

    const movementLines = vehicles.flatMap((vehicle) => (
      (vehicle.events || []).map((event) => ({ vehicle, event }))
    ));
    const movementRows = movementLines.map(({ vehicle, event }, index) => (
      movementRow(vehicle, event, index + 1)
    ));
    const movementsSheet = XLSX.utils.aoa_to_sheet([
      ...excelHeaderBlock(MOVEMENT_HEADERS.length, filters, vehicles.length),
      MOVEMENT_HEADERS,
      ...movementRows,
    ]);
    movementsSheet['!merges'] = excelMerges(MOVEMENT_HEADERS.length);
    movementsSheet['!cols'] = MOVEMENT_HEADERS.map((header) => ({ wch: Math.max(14, header.length + 3) }));
    movementLines.forEach(({ event }, index) => {
      linkImageCell(movementsSheet, dataStart + index, MOVEMENT_HEADERS.indexOf('Image'), imageUrlOf(event));
      linkPreviewCell(movementsSheet, dataStart + index, MOVEMENT_HEADERS.indexOf('Preview'), previewUrlOf(event));
    });
    XLSX.utils.book_append_sheet(workbook, movementsSheet, 'Movements');

    XLSX.writeFile(workbook, `${EXPORT_FILE_NAME}.xlsx`);
    toast.success(`Exported ${vehicles.length} vehicles`);
  } catch (error) {
    console.error('Failed to export loading/unloading stock Excel:', error);
    toast.error('Failed to export Excel');
  }
};

const exportToPDF = async (config, filters) => {
  try {
    const vehicles = await fetchAllForExport(config, filters);
    if (!vehicles.length) {
      toast.error('Nothing to export for these filters');
      return;
    }

    const doc = new jsPDF('landscape');
    await drawReportHeader(
      doc,
      'Loading/Unloading Stock Logs',
      `${rangeNote(filters)}  |  ${filterNote(filters)}  |  ${vehicles.length} vehicles  |  Generated on ${moment().format('DD/MM/YYYY hh:mm A')}`,
    );

    const body = [];
    vehicles.forEach((vehicle, index) => {
      body.push({ child: false, image: imageUrlOf(vehicle), preview: previewUrlOf(vehicle), cells: parentRow(vehicle, index + 1) });
      (vehicle.events || []).forEach((event) => {
        body.push({ child: true, image: imageUrlOf(event), preview: previewUrlOf(event), cells: childRow(event) });
      });
    });

    autoTable(doc, {
      startY: 44,
      margin: { left: 8, right: 8 },
      head: [PARENT_HEADERS],
      body: body.map((line) => line.cells),
      styles: {
        fontSize: 6.2,
        cellPadding: 1.3,
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
        overflow: 'linebreak',
      },
      headStyles: { fillColor: [47, 111, 208], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 18 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const line = body[data.row.index];
        if (line?.child) {
          data.cell.styles.fillColor = [245, 247, 250];
          data.cell.styles.textColor = [90, 98, 116];
          data.cell.styles.fontSize = 5.8;
        }
        if ((data.column.index === 1 && line?.image)
          || (data.column.index === PARENT_HEADERS.indexOf('Preview') && line?.preview)) {
          data.cell.styles.textColor = [37, 99, 235];
        }
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const line = body[data.row.index];
        const url = data.column.index === 1
          ? line?.image
          : data.column.index === PARENT_HEADERS.indexOf('Preview') ? line?.preview : null;
        if (url) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
      },
    });

    doc.save(`${EXPORT_FILE_NAME}.pdf`);
    toast.success(`Exported ${vehicles.length} vehicles`);
  } catch (error) {
    console.error('Failed to export loading/unloading stock PDF:', error);
    toast.error('Failed to export PDF');
  }
};

export const handleStockCountingExport = async (format, config, filters) => {
  if (format === 'excel') await exportToExcel(config, filters);
  if (format === 'pdf') await exportToPDF(config, filters);
};
