import api, { unwrap, unwrapWithMessage } from '@/helpers/client';

const BASE = '/measurement-auto-email-reports';

/**
 * Saved Mattress Measurement Logs email-report schedules.
 * Filters (all server-side):
 *   search     — schedule title OR recipient email (case-insensitive)
 *   status     — 'active' | 'paused'
 *   frequency  — 'daily' | 'weekly' | 'monthly' | 'custom'
 *   reportType — 'full' | 'pass' | 'mismatch' | 'qrerror'
 */
export async function getReportSchedules({
  page = 1,
  limit = 50,
  search = '',
  status = '',
  frequency = '',
  reportType = '',
} = {}) {
  const params = { page, limit };
  if (search) params.search = search;
  if (status) params.status = status;
  if (frequency) params.frequency = frequency;
  if (reportType) params.reportType = reportType;
  const res = await api.get(BASE, { params });
  const data = unwrap(res) || {};
  return {
    reports: data.reports ?? [],
    total: data.total ?? (data.reports ?? []).length,
  };
}

export async function getReportFormOptions() {
  const res = await api.get(`${BASE}/form-options`);
  const data = unwrap(res) || {};
  return {
    recipients: data.recipients ?? [],
    stations: data.stations ?? [],
  };
}

export async function createReportSchedule(payload) {
  const res = await api.post(BASE, payload);
  return unwrapWithMessage(res);
}

export async function updateReportSchedule(id, payload) {
  const res = await api.put(`${BASE}/${id}`, payload);
  return unwrapWithMessage(res);
}

export async function deleteReportSchedule(id) {
  const res = await api.delete(`${BASE}/${id}`);
  return unwrap(res);
}

export async function sendReportNow(id, payload = undefined) {
  const res = await api.post(`${BASE}/${id}/send-now`, payload);
  return unwrap(res);
}

/* ─── UI form ⇄ API payload ─── */

const DAY_TO_NUM = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const NUM_TO_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const isoDate = (d) => (d ? String(d).slice(0, 10) : ''); // YYYY-MM-DD

/** Schedule modal form -> POST/PUT body. */
export function formToPayload(form) {
  const schedule = {
    frequency: form.freq,
    time: form.time || '07:00',
    weekday: DAY_TO_NUM[form.day] ?? 1,
    dayOfMonth: Math.min(Math.max(parseInt(form.dom, 10) || 1, 1), 28),
  };
  if (form.freq === 'custom') {
    // Preserve the selected calendar date across browser/server timezones.
    // Midnight can cross into the previous date when converted to UTC; noon
    // UTC remains on the same calendar date for the supported plant zones.
    schedule.startDate = form.startDate
      ? `${form.startDate}T12:00:00.000Z`
      : null;
    schedule.endDate = form.endDate
      ? `${form.endDate}T12:00:00.000Z`
      : null;
  }
  return {
    title: form.name.trim(),
    recipients: form.recipients,
    reportType: form.report,
    recordStatus: form.recordStatus || 'all',
    includeSnapshots: !!form.includeSnaps,
    formats: form.formats,
    schedule,
    target:
      form.scope === 'all'
        ? { scope: 'all', stations: [] }
        : { scope: 'stations', stations: [form.scope] },
  };
}

/** Saved schedule from the API -> modal form shape. */
export function reportToForm(r) {
  return {
    id: r._id,
    name: r.title || '',
    report: r.reportType || 'full',
    recordStatus: r.recordStatus || 'all',
    freq: r.schedule?.frequency || 'daily',
    time: r.schedule?.time || '07:00',
    day: NUM_TO_DAY[r.schedule?.weekday ?? 1] || 'mon',
    dom: String(r.schedule?.dayOfMonth ?? 1),
    startDate: isoDate(r.schedule?.startDate),
    endDate: isoDate(r.schedule?.endDate),
    scope: r.target?.scope === 'stations' ? r.target.stations?.[0] || 'all' : 'all',
    formats: r.formats?.length ? r.formats : ['pdf'],
    includeSnaps: r.includeSnapshots !== false,
    recipients: r.recipients || [],
  };
}
