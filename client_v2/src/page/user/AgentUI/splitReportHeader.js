export function drawSplitReportHeader(doc, { title, subtitle = 'Detection Report' }) {
  const width = doc.internal.pageSize.getWidth();
  const headerHeight = 27;
  doc.setFillColor(112, 146, 234);
  doc.rect(0, 0, width * .72, headerHeight, 'F');
  doc.setFillColor(156, 104, 224);
  doc.rect(width * .72, 0, width * .28, headerHeight, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('VideoraIQ', 10, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(239, 245, 255);
  doc.text('Smart Surveillance Powered by AI', 10, 19);
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const titleLines = doc.splitTextToSize(title, width * .28 - 15);
  if (titleLines.length > 2) {
    doc.setFontSize(Math.max(7, 12 * (width * .28 - 15) / doc.getTextWidth(title) * 2));
  }
  const fittedTitle = doc.splitTextToSize(title, width * .28 - 15);
  doc.text(fittedTitle, width - 10, fittedTitle.length > 1 ? 9 : 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(249, 242, 255);
  doc.text(subtitle, width - 10, 19, { align: 'right' });
  doc.setTextColor(32, 38, 68);
}
