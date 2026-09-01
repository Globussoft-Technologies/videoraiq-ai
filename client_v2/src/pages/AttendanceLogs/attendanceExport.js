import moment from 'moment-timezone';
import { toast } from 'sonner';
import { exportAttendanceReport } from './Api';

/**
 * Attendance Logs export.
 *
 * The file is built on the server by the shared Auto Email Report renderer, so
 * a manual export from this page and the scheduled email report are the exact
 * same spreadsheet layout: one day line per employee-day, one sub-row per
 * additional check-in/check-out session, and a per-employee-day total row
 * (Total Working Hrs / Break Hrs / Working Hrs for the period). This module
 * just fires the request with the page's current filters and saves the
 * returned binary blob — the per-session breakdown isn't in the list payload,
 * so it can't be rebuilt client-side. There is no pagination on the export, so
 * the whole filtered result set is included however large it is.
 *
 * `params` mirrors the argument set the page already assembles for
 * getAttendanceLogs.
 */

// The server's time-of-day filter compares against a UTC HH:mm, so convert the
// picker's local time the same way the list request does before sending.
const toUtcHhmm = (date, time, region) => {
  if (!date || !time) return '';
  const hasAmPm = /am|pm/i.test(time);
  const format = hasAmPm ? 'YYYY-MM-DD hh:mm A' : 'YYYY-MM-DD HH:mm';
  return moment.tz(`${date} ${time}`, format, region).utc().format('HH:mm');
};
const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/** Entry point used by the page's Export buttons. */
export const handleAttendanceExport = async (format, params) => {
  const apiFormat = format === 'excel' ? 'csv' : 'pdf';
  const extension = apiFormat === 'csv' ? 'csv' : 'pdf';

  try {
    const response = await exportAttendanceReport({
      format: apiFormat,
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

    const blob = response?.data;
    if (!blob) {
      toast.error('Export failed');
      return;
    }
    // A JSON "no data" / error response comes back as a blob too — sniff it and
    // surface the message instead of saving an empty file.
    if (blob.type && blob.type.includes('application/json')) {
      const text = await blob.text();
      let message = 'No attendance data to export';
      try {
        const parsed = JSON.parse(text);
        message = parsed?.body?.message || parsed?.message || message;
      } catch {
        /* keep default */
      }
      toast.info(message);
      return;
    }

    triggerDownload(blob, `AttendanceReport.${extension}`);
  } catch (error) {
    toast.error(error?.response?.data?.message || 'Failed to export attendance');
  }
};
