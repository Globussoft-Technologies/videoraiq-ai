// Older schedules without a report type use the server's Total report default.
export function packingEmailSchedules(reports = [], reportType = 'comparison') {
  return reports.filter((report) =>
    (report.incidentTypes || []).includes('boxPackingDetection') &&
    (report.reportType || 'total') === reportType);
}
