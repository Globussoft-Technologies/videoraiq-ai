import { drawSplitReportHeader } from './splitReportHeader.js';
import { saveBlob } from './downloadUtils.js';

const title = 'Camera Inventory Report';
const headers = ['S No', 'NVR', 'Camera', 'Location', 'Camera status', 'Detection', 'Detection state', 'Zones', 'Severity', 'Setting name', 'Zone image age', 'Zone image'];
const imageColumn = headers.length - 1;
const imageLabel = 'View image';
export const inventoryMetrics = [
  ['NVRs', 'nvrs'], ['Cameras', 'cameras'], ['Running', 'running'],
  ['Stopped', 'stopped'], ['Detection types', 'detectionTypes'],
  ['Detections on', 'detectionsOn'], ['Detections off', 'detectionsOff'],
  ['No detection', 'camerasWithoutDetections'],
];

function inventoryRows(data) {
  return data.nvrs.flatMap((group) => group.cameras.flatMap((camera) => {
    const base = [group.name, camera.name, camera.location || group.location || '', camera.status || 'unknown'];
    const age = camera.image?.age || '';
    if (!camera.detections?.length) {
      return [{ cells: [...base, data.detectionsRead ? 'No detection linked' : 'Not read', '', '', '', '', age], cameraImage: camera.image?.href }];
    }
    return camera.detections.map((item) => ({
      cells: [...base, item.detection, item.state || 'unknown', item.zones?.join(', ') || '',
        item.severity || '', item.settingName || '', age],
      detectionImage: item.image,
      cameraImage: camera.image?.href,
    }));
  }));
}

export async function exportCameraInventory(data, format, snapshotLabel, imageUrl) {
  const entries = inventoryRows(data);
  const links = entries.map(({ detectionImage, cameraImage }) => imageUrl(detectionImage) || imageUrl(cameraImage));
  const rows = entries.map(({ cells }, index) => [
    index + 1,
    ...cells,
    links[index] ? imageLabel : 'No image',
  ]);
  const metrics = inventoryMetrics.map(([label, key]) => [label, data.totals?.[key] ?? 'Unavailable']);
  const scope = ['nvr', 'camera', 'detection'].flatMap((key) => data.scope?.[key] ? [key.toUpperCase() + ': ' + data.scope[key]] : []).join('  |  ');

  if (format === 'csv') {
    const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
    const cell = (value) => {
      const text = String(value ?? '');
      const safe = /^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? "'" + text : text;
      return quote(safe);
    };
    const records = rows.map((row, index) => row.map((value, column) => {
      const url = links[index];
      // Only the generated HTTP image URL may appear in an executable CSV cell.
      if (column === imageColumn && /^https?:\/\/[^\s"\\]+$/i.test(url || '')) {
        return quote(`=HYPERLINK("${url}","${imageLabel}")`);
      }
      return cell(value);
    }).join(','));
    saveBlob(new Blob(['\uFEFF', [headers.map(cell).join(','), ...records].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }), 'camera-inventory.csv');
    return;
  }

  if (format === 'xlsx') {
    const { default: XLSX } = await import('xlsx-js-style');
    const book = XLSX.utils.book_new();
    const summary = metrics.map(([label, value]) => label + ': ' + value).join('  |  ');
    const metadata = [snapshotLabel, scope, summary, ...(data.notes || [])].filter(Boolean);
    const top = [[title], ...metadata.map((line) => [line]), []];
    const grid = [...top, headers, ...rows];
    const sheet = XLSX.utils.aoa_to_sheet(grid);
    sheet['!merges'] = top.slice(0, -1).map((_, r) => ({ s: { r, c: 0 }, e: { r, c: imageColumn } }));
    const widths = [9, 21, 27, 21, 16, 28, 17, 30, 13, 27, 18, 23];
    sheet['!cols'] = widths.map((wch) => ({ wch }));
    sheet['!rows'] = grid.map((row, index) => {
      const lines = row.map((value, col) => String(value ?? '').split('\n').reduce(
        (count, line) => count + Math.max(1, Math.ceil(line.length / (index < top.length ? 150 : widths[col] - 3))), 0,
      ));
      return { hpt: index === 0 ? 28 : Math.min(400, Math.max(19, 15 * Math.max(1, ...lines))) };
    });
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ r: top.length, c: 0 }, { r: top.length + rows.length, c: imageColumn }) };
    for (const address of Object.keys(sheet).filter((key) => !key.startsWith('!'))) {
      const { r, c } = XLSX.utils.decode_cell(address);
      const heading = r === 0 || r === top.length;
      const link = c === imageColumn ? links[r - top.length - 1] : '';
      if (link) sheet[address].l = { Target: link };
      sheet[address].s = {
        font: { bold: heading, underline: Boolean(link), color: { rgb: heading ? 'FFFFFF' : link ? '4534C8' : '202644' }, sz: r === 0 ? 16 : 11 },
        fill: { patternType: 'solid', fgColor: { rgb: r === 0 ? '7092EA' : heading ? '342B73' : r % 2 ? 'F1F3FC' : 'FFFFFF' } },
        alignment: { vertical: 'center', wrapText: true },
      };
    }
    XLSX.utils.book_append_sheet(book, sheet, 'Camera inventory');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'camera-inventory.xlsx');
    return;
  }

  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title });
  const margin = { top: 34, left: 10, right: 10, bottom: 14 };
  let startY = margin.top;
  const context = [
    ...(snapshotLabel ? [[{ content: snapshotLabel, styles: { fontSize: 10, fontStyle: 'bold' } }]] : []),
    ...(scope ? [[scope]] : []),
  ];
  if (context.length) {
    autoTable(doc, {
      margin, startY, theme: 'plain', body: context,
      styles: { fontSize: 8, cellPadding: { top: 0, bottom: 1.8, left: 0, right: 0 }, textColor: [42, 46, 76] },
    });
    startY = doc.lastAutoTable.finalY + 2;
  }
  autoTable(doc, {
    margin, startY, theme: 'grid', showHead: 'firstPage',
    head: [metrics.map(([label]) => label)],
    body: [metrics.map(([, value]) => String(value))],
    styles: { cellWidth: (doc.internal.pageSize.getWidth() - margin.left - margin.right) / metrics.length,
      cellPadding: 2.2, lineWidth: 0.2, lineColor: [223, 227, 240], textColor: [42, 46, 76] },
    headStyles: { fillColor: [239, 238, 251], fontSize: 8 },
    bodyStyles: { fillColor: [249, 249, 253], fontSize: 11, fontStyle: 'bold' },
  });
  startY = doc.lastAutoTable.finalY + 3;
  if (data.notes?.some(Boolean)) {
    autoTable(doc, {
      margin, startY, theme: 'plain', body: data.notes.filter(Boolean).map((note) => [note]),
      styles: { fontSize: 8, cellPadding: { top: 1.6, bottom: 1.6, left: 2.2, right: 2.2 },
        fillColor: [245, 246, 252], textColor: [60, 69, 98] },
    });
    startY = doc.lastAutoTable.finalY + 3;
  }
  autoTable(doc, {
    margin, startY, head: [headers], body: rows.map((row) => row.map((cell) => cell ?? '')),
    showHead: 'everyPage', rowPageBreak: 'avoid', theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', lineColor: [223, 227, 240] },
    headStyles: { fillColor: [52, 43, 115], textColor: 255 },
    alternateRowStyles: { fillColor: [241, 243, 252] },
    columnStyles: { 0: { cellWidth: 13, halign: 'center' }, [imageColumn]: { cellWidth: 24 } },
    didParseCell: ({ section, column, row, cell }) => {
      if (section === 'body' && column.index === imageColumn && links[row.index]) cell.styles.textColor = [69, 52, 200];
    },
    didDrawCell: ({ section, column, row, cell }) => {
      if (section !== 'body' || column.index !== imageColumn) return;
      const url = links[row.index];
      if (url) doc.link(cell.x, cell.y, cell.width, cell.height, { url });
    },
  });
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawSplitReportHeader(doc, { title, subtitle: 'Camera inventory snapshot' });
    doc.setFontSize(8);
    doc.text('Page ' + page + ' of ' + pageCount, doc.internal.pageSize.getWidth() - 10, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
  }
  saveBlob(doc.output('blob'), 'camera-inventory.pdf');
}
