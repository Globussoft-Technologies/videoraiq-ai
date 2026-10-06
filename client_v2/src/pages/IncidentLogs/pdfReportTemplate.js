import moment from 'moment-timezone';
import logoUrl from '@/assets/videoraiq-logo-white.png';

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

/** The report chrome used by every list-view log PDF. */
export const drawReportHeader = async (doc, { title, subtitle, generatedAt = moment().format('DD/MM/YYYY hh:mm A') }) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');
  doc.setFillColor(38, 17, 105);
  doc.roundedRect(8, 7, pageWidth - 16, 30, 2, 2, 'F');
  doc.setFillColor(27, 18, 92);
  doc.triangle(8, 7, 92, 7, 8, 37, 'F');

  try {
    const logoDataUrl = await imageToDataUrl(logoUrl);
    doc.addImage(logoDataUrl, 'PNG', 17, 17, 50, 11);
  } catch {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('VideoralQ', 18, 24);
  }

  doc.setDrawColor(126, 93, 205);
  doc.setLineWidth(0.35);
  doc.line(74, 14, 74, 31);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 82, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(220, 230, 255);
  doc.text(subtitle || `Generated on ${generatedAt}`, 82, 27);
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.2);
};

export const reportTableOptions = {
  startY: 44,
  margin: { left: 10, right: 10 },
  styles: {
    font: 'helvetica',
    fontSize: 6.5,
    cellPadding: 1.6,
    lineColor: [218, 225, 236],
    lineWidth: 0.1,
    textColor: [54, 70, 99],
    overflow: 'linebreak',
    valign: 'middle',
  },
  headStyles: {
    fillColor: [71, 105, 178],
    textColor: [255, 255, 255],
    fontStyle: 'bold',
    fontSize: 6.5,
    cellPadding: 1.8,
  },
  alternateRowStyles: { fillColor: [247, 249, 252] },
};

export const reportSubtitle = ({ startDate, endDate, allVehicles, total, generatedAt = moment().format('DD/MM/YYYY hh:mm A') }) => {
  const range = startDate && endDate ? `${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')}` : 'All dates';
  return `${range}  |  ${allVehicles || 'All vehicles'}  |  ${total} records  |  Generated on ${generatedAt}`;
};
