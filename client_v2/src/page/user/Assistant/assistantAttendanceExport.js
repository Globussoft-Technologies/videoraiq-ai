import * as XLSX from 'xlsx';
import moment from 'moment-timezone';
import { toast } from 'sonner';
import { exportAttendanceReport } from '@/pages/AttendanceLogs/Api';
import { handleAttendanceExport } from '@/pages/AttendanceLogs/attendanceExport';

// The attendance API intentionally returns CSV for its spreadsheet report.
// The assistant contract promises Excel, so convert that authorized API blob
// to a native XLSX workbook in the browser instead of downloading a renamed
// CSV file.
const toUtcHhmm = (date, time, timezone) => {
  if (!date || !time) return '';
  const format = /am|pm/i.test(time) ? 'YYYY-MM-DD hh:mm A' : 'YYYY-MM-DD HH:mm';
  return moment.tz(`${date} ${time}`, format, timezone).utc().format('HH:mm');
};

const exportParams = (params) => ({
  format: 'csv',
  searchInput: params.searchInput,
  nvrId: Array.isArray(params.nvrIds) ? params.nvrIds.join(',') : '',
  cameraId: Array.isArray(params.cameraId) ? params.cameraId.join(',') : '',
  startDate: params.startDate,
  endDate: params.endDate,
  sortField: params.sortField,
  sortOrder: params.sortOrder,
  departmentIds: (params.selectedDepartments || []).join(','),
  fromTime: toUtcHhmm(params.startDate, params.fromTime, params.region),
  toTime: toUtcHhmm(params.startDate, params.toTime, params.region),
  timeType: params.timeType,
  employeeLocations: params.employeeLocations,
  status: params.statusFilter,
  timezone: params.region,
});

const triggerExcelDownload = (workbook, filename) => {
  XLSX.writeFile(workbook, filename);
  return true;
};

export async function handleAssistantAttendanceExport(format, params = {}) {
  if (format === 'pdf') return handleAttendanceExport(format, params);
  if (format !== 'excel' && format !== 'xlsx') throw new Error(`Unsupported attendance export format: ${format}`);

  try {
    const response = await exportAttendanceReport(exportParams(params));
    const blob = response?.data;
    if (!blob) throw new Error('Attendance export returned no file');
    if (blob.type?.includes('application/json')) {
      const message = await blob.text();
      let detail = 'No attendance data to export';
      try {
        const parsed = JSON.parse(message);
        detail = parsed?.body?.message || parsed?.message || detail;
      } catch {
        // Keep the user-facing fallback above for non-JSON error blobs.
      }
      toast.info(detail);
      return false;
    }

    const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    return triggerExcelDownload(workbook, 'AttendanceReport.xlsx');
  } catch (error) {
    toast.error(error?.response?.data?.message || error?.message || 'Failed to export attendance');
    return false;
  }
}
