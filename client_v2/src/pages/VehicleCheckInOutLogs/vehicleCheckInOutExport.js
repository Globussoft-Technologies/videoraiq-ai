import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment-timezone';
import { toast } from 'sonner';
import { fetchVehicleCheckInOutLogs } from './Api';

/**
 * Export for the Vehicle Check-In / Check-Out log.
 *
 * Both formats carry the sub-documents, because a row without its crossings
 * loses the only evidence for the custody state beside it. Both are also driven
 * by the same filter object the on-screen table uses, so an export always
 * matches what the user is looking at rather than the whole collection.
 */

// One request rather than one per vehicle: `includeHistory` returns each
// vehicle's crossings inline. The cap mirrors the other log exports.
const EXPORT_LIMIT = 10000;

const fmt = (value) => (value ? moment(value).format('DD/MM/YYYY hh:mm A') : '--');
const dash = (value) => (value === null || value === undefined || value === '' ? '--' : value);
const cameraOf = (row) => row?.channelData?.customName || row?.channelData?.name || '--';
const custodyLabel = (row) => (row.custody ? 'In custody' : 'Returned');

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

const PARENT_HEADERS = [
  'Vehicle Number',
  'Model Name',
  'Custody',
  'Check-Ins',
  'Check-Outs',
  'Company',
  'Colour',
  'Year',
  'NVR Name',
  'Camera Name',
  'First Check-In',
  'Last Activity',
];

const parentRow = (row) => [
  dash(row.vehicleNumber),
  dash(row.model_name),
  custodyLabel(row),
  row.checkInCount ?? 0,
  row.checkOutCount ?? 0,
  dash(row.company),
  dash(row.color),
  dash(row.year),
  dash(row?.nvrData?.nvrName),
  cameraOf(row),
  fmt(row.timeOfIncident),
  fmt(row.lastEventAt),
];

/**
 * Excel: two sheets rather than indented rows.
 *
 * A flat sheet is what people filter and pivot on, and interleaving child rows
 * under parents breaks both. The Crossings sheet repeats the plate on every
 * row so it stands alone as a lookup.
 */
const exportToExcel = async (filters) => {
  try {
    const rows = await fetchAllForExport(filters);
    if (!rows.length) {
      toast.error('Nothing to export for these filters');
      return;
    }

    const workbook = XLSX.utils.book_new();

    const summary = XLSX.utils.aoa_to_sheet([
      PARENT_HEADERS,
      ...rows.map(parentRow),
    ]);
    summary['!cols'] = PARENT_HEADERS.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(workbook, summary, 'Vehicles');

    const crossingRows = rows.flatMap((row) =>
      (row.crossings || []).map((c) => [
        dash(row.vehicleNumber),
        dash(row.model_name),
        c.checkin ? 'Check-In' : 'Check-Out',
        fmt(c.timeOfIncident),
        dash(c.zone),
        dash(c.severity),
        dash(c?.nvrData?.nvrName),
        c?.channelData?.customName || c?.channelData?.name || '--',
      ]),
    );

    const crossings = XLSX.utils.aoa_to_sheet([
      [
        'Vehicle Number',
        'Model Name',
        'Direction',
        'Time',
        'Zone',
        'Severity',
        'NVR Name',
        'Camera Name',
      ],
      ...crossingRows,
    ]);
    crossings['!cols'] = new Array(8).fill({ wch: 18 });
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

    doc.setFontSize(14);
    doc.text('Vehicle Check-In / Check-Out Logs', 14, 14);
    doc.setFontSize(9);
    doc.setTextColor(110);
    const range =
      filters?.startDate && filters?.endDate
        ? `${moment(filters.startDate).format('DD/MM/YYYY')} – ${moment(filters.endDate).format('DD/MM/YYYY')}`
        : 'All dates';
    const custodyNote =
      filters?.custody === 'true'
        ? 'In custody only'
        : filters?.custody === 'false'
          ? 'Returned only'
          : 'All vehicles';
    doc.text(`${range} · ${custodyNote} · ${rows.length} vehicles · generated ${generatedAt}`, 14, 20);
    doc.setTextColor(0);

    const body = [];
    rows.forEach((row) => {
      body.push({ _child: false, cells: parentRow(row) });
      (row.crossings || []).forEach((c) => {
        body.push({
          _child: true,
          cells: [
            '',
            `↳ ${c.checkin ? 'Check-In' : 'Check-Out'}`,
            fmt(c.timeOfIncident),
            dash(c.zone),
            dash(c.severity),
            dash(c?.nvrData?.nvrName),
            c?.channelData?.customName || c?.channelData?.name || '--',
            '',
            '',
            '',
            '',
            '',
          ],
        });
      });
    });

    autoTable(doc, {
      startY: 26,
      head: [PARENT_HEADERS],
      body: body.map((r) => r.cells),
      styles: { fontSize: 7, cellPadding: 1.6 },
      headStyles: { fillColor: [47, 111, 208], textColor: 255 },
      // Child rows are visually subordinate rather than being a second table,
      // so a vehicle and its crossings never get split across a page boundary
      // by two independent tables.
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        if (body[data.row.index]?._child) {
          data.cell.styles.fillColor = [245, 247, 250];
          data.cell.styles.textColor = [90, 98, 116];
          data.cell.styles.fontSize = 6.5;
        } else if (data.column.index === 2) {
          const label = data.cell.raw;
          data.cell.styles.textColor =
            label === 'In custody' ? [180, 105, 14] : [31, 138, 83];
          data.cell.styles.fontStyle = 'bold';
        }
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
