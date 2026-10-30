export const TAGGED_PDF_PAGE_SIZE = 6;

/** Draw one portrait A4 page with two columns and three rows. */
export function drawTaggedPdfPage(doc, records, images, { pageNumber, totalPages, generatedAt }) {
  const margin = 12, gap = 6, top = 30, height = 78;
  const width = (doc.internal.pageSize.getWidth() - margin * 2 - gap) / 2;
  doc.setTextColor(20, 30, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Tagged Users Report', margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated: ${generatedAt}`, margin, 21);

  records.forEach((record, index) => {
    const x = margin + (index % 2) * (width + gap);
    const y = top + Math.floor(index / 2) * (height + gap);
    doc.setDrawColor(220, 225, 235);
    doc.roundedRect(x, y, width, height, 2, 2);
    doc.setFillColor(240, 243, 248);
    doc.rect(x + 2, y + 2, width - 4, 30, 'F');
    const image = images[index];
    let imageDrawn = false;
    if (image) {
      try {
        const props = doc.getImageProperties(image);
        const scale = Math.min((width - 4) / props.width, 30 / props.height);
        const w = props.width * scale, h = props.height * scale;
        doc.addImage(image, props.fileType, x + (width - w) / 2, y + 2 + (30 - h) / 2, w, h, undefined, 'FAST');
        imageDrawn = true;
      } catch { /* Keep the record and its source link when a photo cannot be embedded. */ }
    }
    if (!imageDrawn) {
      doc.setFontSize(9);
      doc.setTextColor(100, 110, 130);
      doc.text('Photo unavailable', x + width / 2, y + 18, { align: 'center' });
    }
    if (record.imageUrl) doc.link(x + 2, y + 2, width - 4, 30, { url: record.imageUrl });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 30, 50);
    doc.text(doc.splitTextToSize(record.name || 'Unknown', width - 8).slice(0, 1), x + 4, y + 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    record.details.forEach(([label, value], row) => {
      const line = doc.splitTextToSize(`${label}: ${value || '--'}`, width - 8)[0];
      doc.text(line, x + 4, y + 44 + row * 5);
    });
  });
  doc.setTextColor(100, 110, 130);
  doc.setFontSize(8);
  doc.text(`Page ${pageNumber} of ${totalPages}`, doc.internal.pageSize.getWidth() / 2, 290, { align: 'center' });
}

/** Download only for exports; bound latency and resize photos before embedding. */
export function loadTaggedPdfImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = image.onerror = null;
      image.src = '';
      resolve(data);
    };
    const timer = setTimeout(() => finish(null), 10000);
    image.crossOrigin = 'anonymous';
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const scale = Math.min(1, 640 / image.naturalWidth, 400 / image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.75));
      } catch { finish(null); }
    };
    image.src = url;
  });
}
