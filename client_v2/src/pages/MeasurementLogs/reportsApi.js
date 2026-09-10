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
    // Backend Joi wants full ISO datetimes.
    schedule.startDate = form.startDate
      ? new Date(`${form.startDate}T00:00:00`).toISOString()
      : null;
    schedule.endDate = form.endDate
      ? new Date(`${form.endDate}T23:59:59`).toISOString()
      : null;
  }
  return {
    title: form.name.trim(),
    recipients: form.recipients,
    reportType: form.report,
    includeSnapshots: !!form.includeSnaps,
    mismatchOnly: !!form.mismatchOnly,
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
    freq: r.schedule?.frequency || 'daily',
    time: r.schedule?.time || '07:00',
    day: NUM_TO_DAY[r.schedule?.weekday ?? 1] || 'mon',
    dom: String(r.schedule?.dayOfMonth ?? 1),
    startDate: isoDate(r.schedule?.startDate),
    endDate: isoDate(r.schedule?.endDate),
    scope: r.target?.scope === 'stations' ? r.target.stations?.[0] || 'all' : 'all',
    formats: r.formats?.length ? r.formats : ['pdf'],
    mismatchOnly: !!r.mismatchOnly,
    includeSnaps: r.includeSnapshots !== false,
    recipients: r.recipients || [],
  };
}
