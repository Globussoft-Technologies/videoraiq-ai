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

// V1's real route only accepts userId as a query param, not a path segment
// (server/core/v1/users/users.routes.js — DELETE /users/delete uses req.query.userId).
export async function deleteUser(id) {
  const res = await api.delete(`/users/delete?userId=${id}`);
  return unwrap(res);
}

export async function bulkDeleteUsers(userIds) {
  const res = await api.delete('/users/bulk-delete', { data: { userIds } });
  return unwrap(res);
}

/* ---- Add/Edit User form: cascading camera-access pickers ----
 * V1's NewPermissionForm.jsx cascades Location -> NVR -> Channels -> Department
 * (Employee Access also feeds into Department). Each picker re-fetches its
 * downstream options on change, scoped by whatever's currently selected
 * upstream — these mirror that exact contract. */

export async function getNvrsForUserAccess(selectedLocations = []) {
  const res = await api.post('/authorizedChannels/getNVRS', { selectedLocations });
  const data = unwrap(res);
  return Array.isArray(data) ? data : (data?.nvrs ?? []);
}

export async function getChannelsForUserAccess({ selectedLocations = [], nvrIds = [] } = {}) {
  const res = await api.post('/authorizedChannels/getChannels', { selectedLocations, nvrIds, isUserRegFilter: true });
  const data = unwrap(res);
  const list = Array.isArray(data) ? data : (data?.channels ?? []);
  // isUserRegFilter makes every branch of the server handler group the results
  // by NVR — [{ nvrId, nvrName, brand, channels: [...] }] — rather than return
  // channels. Flatten to a channel list but carry the parent NVR down onto each
  // channel, so callers can regroup them under NVR headings (V1's
  // NewPermissionForm does exactly this). Items without a `channels` array are
  // already channels.
  return list.flatMap((nvr) => {
    if (!Array.isArray(nvr?.channels)) return [nvr];
    return nvr.channels.map((ch) => ({
      ...ch,
      nvrId: ch.nvrId || nvr.nvrId || nvr._id,
      nvrName: nvr.nvrName || ch.nvrName || nvr.name || 'Unknown NVR',
    }));
  });
}

export async function getDepartmentsForUserAccess({ channelsIds = [], employeeLocations = [] } = {}) {
  const res = await api.post('/authorizedChannels/departments', { channelsIds, employeeLocations });
  const data = unwrap(res);
  return Array.isArray(data) ? data : (data?.departments ?? []);
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

// Bulk-creates one or more role names in a single call (V1's real contract —
// POST /roles/create accepts a `roles` array, not a single roleName).
export async function createRole(roleName) {
  const res = await api.post('/roles/create', { roles: [roleName] });
  return unwrap(res);
}

// Rename a role — blocked server-side (400) if the role is_default.
export async function renameRole(roleId, roleName) {
  const res = await api.put(`/roles/update?roleId=${roleId}`, { roleName });
  return unwrap(res);
}

// Toggle one of the 4 flat permission columns. V1 cascades whichever of
// {roleView,roleCreate,roleEdit,roleDelete} is supplied across every module
// in the role's linked permission matrix, so this is a full round-trip per
// click, matching how V1's own table checkboxes behave.
export async function updateRolePermission(roleId, field, value) {
  const key = { view: 'roleView', create: 'roleCreate', edit: 'roleEdit', delete: 'roleDelete' }[field];
  const res = await api.put(`/roles/update?roleId=${roleId}`, { [key]: value });
  return unwrap(res);
}

export async function deleteRole(roleId) {
  const res = await api.delete(`/roles/delete?roleId=${roleId}`);
  return unwrap(res);
}

// Granular per-module permission matrix ("Configure") — partial patch, merged
// module-by-module server-side. permissionConfig: { [module]: {view,create,edit,delete} }.
export async function updatePermissionConfig(permissionId, permissionConfig) {
  const res = await api.put(`/permissions/update?permissionId=${permissionId}`, { permissionConfig });
  return unwrap(res);
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
