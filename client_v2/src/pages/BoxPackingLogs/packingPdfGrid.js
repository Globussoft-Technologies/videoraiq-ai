// Fixed print dimensions fit two complete rows on the first landscape A4 page.
export function drawPackingPdfGrid(doc, records, images, { linkFor = (url) => url, firstY = 62 } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth(), pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14, gap = 5, columns = 4, height = 76;
  const width = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
  const ink = [15, 23, 42], muted = [100, 116, 139], rule = [220, 222, 240];
  let y = firstY;
  const text = (value, x, baseline, maxWidth, size = 6.5, color = ink, bold = false, align = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    let rendered = String(value ?? '—');
    while (doc.getTextWidth(rendered) > maxWidth && rendered.length > 1) rendered = rendered.slice(0, -2) + '~';
    doc.text(rendered, x, baseline, { align });
  };
  records.forEach((record, index) => {
    const column = index % columns;
    if (!column && index) y += height + gap;
    if (!column && y + height > pageHeight - 12) {
      doc.addPage(); y = 19;
      text('Box Packing Alert Logs', margin, 11, pageWidth - margin * 2, 10, ink, true);
    }
    const x = margin + column * (width + gap), pad = 2.5;
    doc.setDrawColor(...rule); doc.setFillColor(249, 248, 255); doc.roundedRect(x, y, width, height, 2, 2, 'FD');
    const ix = x + .5, iy = y + .5, iw = width - 1, ih = 27;
    doc.setFillColor(10, 15, 26); doc.rect(ix, iy, iw, ih, 'F');
    const image = images[index];
    if (image) {
      try {
        const props = doc.getImageProperties(image), scale = Math.min(iw / props.width, ih / props.height);
        const w = props.width * scale, h = props.height * scale;
        doc.addImage(image, props.fileType, ix + (iw - w) / 2, iy + (ih - h) / 2, w, h, undefined, 'FAST');
      } catch { text('Snapshot unavailable', x + width / 2, iy + ih / 2, iw - 4, 7, [180, 188, 205], false, 'center'); }
    } else text('Snapshot unavailable', x + width / 2, iy + ih / 2, iw - 4, 7, [180, 188, 205], false, 'center');
    if (record.Snapshot) doc.link(ix, iy, iw, ih, { url: linkFor(record.Snapshot) });
    text(record['Box ID'], x + pad, y + 32, width - pad * 2, 8, [79, 70, 229], true);
    const details = [['Completed by', record['Completed By']], ['NVR', record.NVR], ['Camera', record['Camera Name']], ['Date', record.Date], ['Start', record['Start time']], ['End', record['End time']]];
    details.forEach(([label, value], row) => {
      const baseline = y + 36.5 + row * 3.7;
      text(label, x + pad, baseline, 18, 5.8, muted);
      text(value, x + width - pad, baseline, width - 23, 6, label === 'Completed by' ? [147, 51, 234] : ink, false, 'right');
      doc.setDrawColor(...rule); doc.setLineWidth(.1); doc.line(x + pad, baseline + 1.2, x + width - pad, baseline + 1.2);
    });
    const metricY = y + 65.5, metricWidth = width - pad * 2;
    const [label, value, fill, color] = ['Time to complete', record['Time to complete'], [246, 237, 255], [147, 51, 234]];
    doc.setFillColor(...fill); doc.roundedRect(x + pad, metricY, metricWidth, 7.5, 1, 1, 'F');
    text(label, x + pad + 1.5, metricY + 2.5, metricWidth - 3, 5, muted);
    text(value, x + pad + 1.5, metricY + 6, metricWidth - 3, 7, color, true);
  });
  return { pages: doc.getNumberOfPages(), columns, cardHeight: height };
}
