import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment-timezone';
import { toast } from 'sonner';
import logoUrl from '@/assets/videoraiq-logo-white.png';
import { fetchVehicleCheckInOutLogs } from './Api';

/**
 * Export for the Vehicle Check-In / Check-Out log.
 *
 * Both formats carry the sub-documents, because a row without its crossings
 * loses the only evidence for the custody state beside it. Both are also driven
 * by the same filter object the on-screen table uses, so an export always
 * matches what the user is looking at rather than the whole collection.
 *
 * Columns mirror the on-screen table exactly -- parent rows carry what the main
 * table shows, crossing rows carry what the expanded panel shows. Nothing extra.
 */

// One request rather than one per vehicle: `includeHistory` returns each
// vehicle's crossings inline. The cap mirrors the other log exports.
const EXPORT_LIMIT = 10000;

const fmt = (value) => (value ? moment(value).format('DD/MM/YYYY hh:mm A') : '--');
const dash = (value) => (value === null || value === undefined || value === '' ? '--' : value);
const cameraOf = (row) => row?.channelData?.customName || row?.channelData?.name || '--';
const custodyLabel = (row) => (row.custody ? 'In custody' : 'Returned');

/** Same resolver the page uses -- DS sends a path, not a URL. */
const imageUrlOf = (item) => {
  const path = item?.Image || item?.image || item?.imageUrl || '';
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${import.meta.env.VITE_INCIDENT_URL || ''}${path}`;
};

const stamp = () => moment().format('YYYYMMDD_HHmm');

/** Every vehicle under the current filters, each with its crossings. */
const fetchAllForExport = async (filters = {}) => {
  const res = await fetchVehicleCheckInOutLogs({
    ...filters,
    skip: 0,
    limit: EXPORT_LIMIT,
    includeHistory: true,
  });
  return res?.data?.body?.data?.data || [];
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

const rangeNote = (filters) =>
  filters?.startDate && filters?.endDate
    ? `${moment(filters.startDate).format('DD/MM/YYYY')} - ${moment(filters.endDate).format('DD/MM/YYYY')}`
    : 'All dates';

const custodyNote = (filters) =>
  filters?.custody === 'true'
    ? 'In custody only'
    : filters?.custody === 'false'
      ? 'Returned only'
      : 'All vehicles';

// Parent row -- exactly the columns the on-screen table shows, plus a link to
// the camera image the table renders as a thumbnail.
const PARENT_HEADERS = [
  'S.No',
  'Vehicle Number',
  'Custody',
  'In / Out',
  'NVR Name',
  'Camera Name',
  'First Check-In',
  'Image',
];

const parentRow = (row, serial) => [
  serial,
  dash(row.vehicleNumber),
  custodyLabel(row),
  `${row.checkInCount ?? 0} / ${row.checkOutCount ?? 0}`,
  dash(row?.nvrData?.nvrName),
  cameraOf(row),
  fmt(row.timeOfIncident),
  imageUrlOf(row) ? 'View Image' : '--',
];

// A crossing rendered as an indented child row, aligned under the parent
// columns. Shared by the PDF table and the Excel Vehicles sheet.
const childRow = (c) => [
  '', // S.No
  `- ${c.checkin ? 'Check-In' : 'Check-Out'}`, // Vehicle Number column
  '', // Custody
  '', // In / Out
  dash(c?.nvrData?.nvrName), // NVR Name
  c?.channelData?.customName || c?.channelData?.name || '--', // Camera Name
  fmt(c.timeOfIncident), // First Check-In column
  imageUrlOf(c) ? 'View Image' : '--', // Image
];

// Crossing row -- what the expanded panel shows, plus its "View image" link.
const CROSSING_HEADERS = ['Direction', 'Time', 'NVR Name', 'Camera Name', 'Zone', 'Image'];

const crossingCells = (c) => [
  c.checkin ? 'Check-In' : 'Check-Out',
  fmt(c.timeOfIncident),
  dash(c?.nvrData?.nvrName),
  c?.channelData?.customName || c?.channelData?.name || '--',
  dash(c.zone),
  imageUrlOf(c) ? 'View Image' : '--',
];

/**
 * Branded report header, shared by both PDF sections. Mirrors the header used
 * by the other log exports (Sleep Activity, Car Logs).
 */
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

/**
 * Excel: a "Vehicles" sheet that mirrors the on-screen table -- each vehicle
 * followed by its crossings as indented child rows -- plus a flat "Crossings"
 * sheet that repeats the plate on every row so it stands alone as a lookup.
 */
const exportToExcel = async (filters) => {
  try {
    const rows = await fetchAllForExport(filters);
    if (!rows.length) {
      toast.error('Nothing to export for these filters');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const generatedAt = moment().format('DD/MM/YYYY hh:mm A');

    const headerBlock = (columnCount) => {
      const pad = new Array(Math.max(0, columnCount - 1)).fill('');
      return [
        ['VIDEORAIQ', ...pad],
        ['Vehicle Check-In / Check-Out Logs', ...pad],
        [`${rangeNote(filters)}  |  ${custodyNote(filters)}`, ...pad],
        [`Generated on ${generatedAt}  |  Total vehicles: ${rows.length}`, ...pad],
        [],
      ];
    };
    const mergesFor = (columnCount) =>
      [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: columnCount - 1 } }));

    // Header block is 5 rows, then the column-header row -- data starts here.
    const DATA_START = 6;
    const IMAGE_COL = PARENT_HEADERS.length - 1;
    // Turn a "View Image" cell into a real hyperlink.
    const linkImageCell = (sheet, rowIndex, colIndex, url) => {
      if (!url) return;
      const ref = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      sheet[ref] = { t: 's', v: 'View Image', l: { Target: url, Tooltip: 'Open camera image' } };
    };

    // Sheet 1: Vehicles -- each vehicle followed by its crossings, exactly as
    // the table renders when a row is expanded. Only the child rows carry an
    // image link (a vehicle's image is its first crossing's image).
    const vehicleLines = [];
    let serial = 0;
    rows.forEach((row) => {
      serial += 1;
      vehicleLines.push({ cells: parentRow(row, serial), url: imageUrlOf(row) });
      (row.crossings || []).forEach((c) => {
        vehicleLines.push({ cells: childRow(c), url: imageUrlOf(c) });
      });
    });

    const summary = XLSX.utils.aoa_to_sheet([
      ...headerBlock(PARENT_HEADERS.length),
      PARENT_HEADERS,
      ...vehicleLines.map((line) => line.cells),
    ]);
    summary['!merges'] = mergesFor(PARENT_HEADERS.length);
    summary['!cols'] = PARENT_HEADERS.map(() => ({ wch: 18 }));
    vehicleLines.forEach((line, i) =>
      linkImageCell(summary, DATA_START + i, IMAGE_COL, line.url),
    );
    XLSX.utils.book_append_sheet(workbook, summary, 'Vehicles');

    // Sheet 2: Crossings -- flat lookup, one row per crossing with the plate.
    const crossingHeaders = ['S.No', 'Vehicle Number', ...CROSSING_HEADERS];
    const flatCrossings = rows.flatMap((row) => row.crossings || []);
    const crossingRows = rows
      .flatMap((row) =>
        (row.crossings || []).map((c) => [dash(row.vehicleNumber), ...crossingCells(c)]),
      )
      .map((cells, i) => [i + 1, ...cells]);
    const crossings = XLSX.utils.aoa_to_sheet([
      ...headerBlock(crossingHeaders.length),
      crossingHeaders,
      ...crossingRows,
    ]);
    crossings['!merges'] = mergesFor(crossingHeaders.length);
    crossings['!cols'] = crossingHeaders.map(() => ({ wch: 18 }));
    flatCrossings.forEach((c, i) =>
      linkImageCell(crossings, DATA_START + i, crossingHeaders.length - 1, imageUrlOf(c)),
    );
    XLSX.utils.book_append_sheet(workbook, crossings, 'Crossings');

    XLSX.writeFile(workbook, `vehicle_check_in_out_${stamp()}.xlsx`);
    toast.success(`Exported ${rows.length} vehicles`);
  } catch (error) {
    console.error('Failed to export vehicle check-in/out Excel:', error);
    toast.error('Failed to export Excel');
  }
};

/**
 * PDF: each vehicle's crossings printed directly beneath it.
 *
 * autoTable's `didDrawPage` cannot nest tables, so the crossings are emitted as
 * extra body rows with a marker column that the styling hook keys off. That
 * keeps parent and children on the same page flow and lets the table break
 * across pages without orphaning a child from its vehicle.
 */
const exportToPDF = async (filters) => {
  try {
    const rows = await fetchAllForExport(filters);
    if (!rows.length) {
      toast.error('Nothing to export for these filters');
      return;
    }

    const doc = new jsPDF('landscape');
    const generatedAt = moment().format('DD/MM/YYYY hh:mm A');
    await drawReportHeader(
      doc,
      'Vehicle Check-In / Check-Out Logs',
      `${rangeNote(filters)}  |  ${custodyNote(filters)}  |  ${rows.length} vehicles  |  Generated on ${generatedAt}`,
    );

    // Column indices into PARENT_HEADERS: 0 S.No, 2 Custody, 10 First Check-In, 11 Image.
    const IMAGE_COL = PARENT_HEADERS.length - 1;
    const body = [];
    let serial = 0;
    rows.forEach((row) => {
      serial += 1;
      body.push({ _child: false, url: imageUrlOf(row), cells: parentRow(row, serial) });
      (row.crossings || []).forEach((c) => {
        body.push({ _child: true, url: imageUrlOf(c), cells: childRow(c) });
      });
    });

    autoTable(doc, {
      startY: 44,
      margin: { left: 10, right: 10 },
      head: [PARENT_HEADERS],
      body: body.map((r) => r.cells),
      styles: { fontSize: 7, cellPadding: 1.6, lineColor: [226, 232, 240], lineWidth: 0.1, overflow: 'linebreak' },
      headStyles: { fillColor: [47, 111, 208], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        [IMAGE_COL]: { cellWidth: 20 },
      },
      // Child rows are visually subordinate rather than being a second table,
      // so a vehicle and its crossings never get split across a page boundary
      // by two independent tables.
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const meta = body[data.row.index];
        if (meta?._child) {
          data.cell.styles.fillColor = [245, 247, 250];
          data.cell.styles.textColor = [90, 98, 116];
          data.cell.styles.fontSize = 6.5;
        } else if (data.column.index === 2) {
          const label = data.cell.raw;
          data.cell.styles.textColor =
            label === 'In custody' ? [180, 105, 14] : [31, 138, 83];
          data.cell.styles.fontStyle = 'bold';
        }
        // Blue link styling for a live "View Image" cell.
        if (data.column.index === IMAGE_COL && meta?.url) {
          data.cell.styles.textColor = [37, 99, 235];
        }
      },
      // Add the clickable region over the "View Image" cell autoTable drew.
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== IMAGE_COL) return;
        const url = body[data.row.index]?.url;
        if (!url) return;
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
      },
    });

    doc.save(`vehicle_check_in_out_${stamp()}.pdf`);
    toast.success(`Exported ${rows.length} vehicles`);
  } catch (error) {
    console.error('Failed to export vehicle check-in/out PDF:', error);
    toast.error('Failed to export PDF');
  }
};

export const handleVehicleCheckInOutExport = async (format, filters) => {
  if (format === 'excel') await exportToExcel(filters);
  if (format === 'pdf') await exportToPDF(filters);
};
