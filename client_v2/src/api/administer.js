import api, { unwrap } from '../helpers/client';

/* ---- Users ---- */

export async function getUsers({ skip = 0, limit = 10, searchQuery = '', sortField = 'userName', sortOrder = 'asc' } = {}) {
  const res = await api.post(
    `/users/fetch?skip=${skip}&limit=${limit}&searchQuery=${searchQuery}&orderBy=${sortField}&sort=${sortOrder}`,
    { sortField, sortOrder }
  );
  const data = unwrap(res);
  const users = data?.users ?? data?.data ?? (Array.isArray(data) ? data : []);
  const total = data?.total ?? data?.totalCount ?? data?.count ?? users.length;
  return { users, total };
}

export async function createUser(payload) {
  const res = await api.post('/users/create', payload);
  return unwrap(res);
}

export async function createAuthorizedUser(payload) {
  const res = await api.post('/authorizedUsers/create', payload);
  return unwrap(res);
}

export async function getDepartments({ skip = 0, limit = 100 } = {}) {
  const res = await api.post('/departments/get', { skip, limit });
  const data = unwrap(res);
  const departments = data?.data?.data ?? data?.departments ?? data?.data ?? (Array.isArray(data) ? data : []);
  return { departments, total: data?.total ?? data?.totalCount ?? departments.length };
}

export async function getEmployeeLocations({ skip = 0, limit = 100, search = '' } = {}) {
  const res = await api.post(`/locations/employee-location?skip=${skip}&limit=${limit}&search=${search}`, {});
  const data = unwrap(res);
  if (Array.isArray(data)) return data;
  return data?.locations ?? data?.data?.locations ?? [];
}

export async function isEmailExist(email) {
  const res = await api.get('/users/isEmailExist', { params: { email } });
  return res;
}

export async function updateUser(id, payload) {
  const res = await api.put(`/users/update?userId=${id}`, payload);
  return unwrap(res);
}

export async function deleteUser(id) {
  const res = await api.delete(`/users/delete/${id}`);
  return unwrap(res);
}

/* ---- Roles ---- */

export async function getRoles({ skip = 0, limit = 50, searchQuery = '' } = {}) {
  const res = await api.post(`/permissions/roles_permissions?searchQuery=${searchQuery}&skip=${skip}&limit=${limit}`, {});
  // V1 confirmed: body.data = { rolesWithPermissions: [...], totalLength: N }
  const data = unwrap(res);
  const roles = data?.rolesWithPermissions ?? data?.roles ?? data?.data ?? (Array.isArray(data) ? data : []);
  const total = data?.totalLength ?? data?.total ?? data?.totalCount ?? roles.length;
  return { roles, total };
}

/* ---- Org / Admin settings ---- */

export async function fetchAdmin() {
  const res = await api.get('/admin/fetch');
  return unwrap(res) || {};
}

export async function fetchLogsSound() {
  const res = await api.get('/admin/fetch-logs-sound');
  const data = unwrap(res);
  return typeof data === 'boolean' ? data : data?.logsSound ?? false;
}

export async function updateLogsSound(logsSound) {
  const res = await api.put('/admin/update-logs-sound', { logsSound });
  return unwrap(res);
}

/* ---- Notification recipients ---- */

export async function getRecipients({ alertType = '', search = '', filterByStatus = '', skip = 0, limit = 20 } = {}) {
  const res = await api.get('/recipients/fetch', {
    params: { alertType, search, filterByStatus, skip, limit },
  });
  const data = unwrap(res);
  const alerts = data?.alerts ?? data?.data ?? (Array.isArray(data) ? data : []);
  return { recipients: alerts, total: data?.total ?? data?.totalCount ?? alerts.length };
}
