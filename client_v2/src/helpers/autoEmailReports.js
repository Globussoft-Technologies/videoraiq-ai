import api, { unwrap } from './client';

const BASE = '/attendance-auto-email-reports';

const listData = (res) => {
  const data = unwrap(res) || {};
  const reports = data?.reports ?? data?.data ?? data?.items ?? (Array.isArray(data) ? data : []);
  return {
    reports,
    total: data?.total ?? data?.totalCount ?? data?.count ?? reports.length,
  };
};

export async function getAutoEmailReports({ page = 1, limit = 10, search = '' } = {}) {
  const res = await api.get(BASE, { params: { page, limit, search } });
  return listData(res);
}

export async function getAutoEmailReport(id) {
  const res = await api.get(`${BASE}/${id}`);
  return unwrap(res);
}

export async function createAutoEmailReport(payload) {
  const res = await api.post(BASE, payload);
  return unwrap(res);
}

export async function updateAutoEmailReport(id, payload) {
  const res = await api.put(`${BASE}/${id}`, payload);
  return unwrap(res);
}

export async function deleteAutoEmailReport(id) {
  const res = await api.delete(`${BASE}/${id}`);
  return unwrap(res);
}

export async function getAttendanceAudienceOptions({ search = '' } = {}) {
  const res = await api.get(`${BASE}/audience-options`, { params: { search } });
  const data = unwrap(res) || {};
  return {
    employees: data?.employees ?? [],
    departments: data?.departments ?? [],
  };
}

export async function previewAutoEmailReport(id) {
  const res = await api.post(`${BASE}/${id}/preview`);
  return unwrap(res);
}

export async function sendAutoEmailReportNow(id, payload = undefined) {
  const res = await api.post(`${BASE}/${id}/send-now`, payload);
  return unwrap(res);
}
