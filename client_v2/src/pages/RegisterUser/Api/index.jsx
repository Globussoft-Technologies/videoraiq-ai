import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const authHeaders = (extra = {}) => ({
  'x-access-token': getAccessToken(),
  ...extra,
});

/* ─────────────── Authorized users (employees) ─────────────── */

/** Paginated employee list with optional location/department filters. */
export const authorizedUsers = async (skip = 0, limit = 10, search = '', data = {}) => {
  const response = await axios.post(
    `${Api_url}/authorizedUsers/fetch?skip=${skip}&limit=${limit}&search=${search}`,
    data,
    { headers: authHeaders({ 'Content-Type': 'application/json' }) }
  );
  return response.data;
};

/**
 * Create an authorized user with profile images. `payload` is FormData;
 * Content-Type is intentionally omitted so the browser sets the multipart boundary.
 */
export const createAuthorizedUser = async (payload, token) => {
  const response = await axios.post(`${Api_url}/authorizedUsers/create`, payload, {
    headers: { 'x-access-token': token || getAccessToken() },
  });
  return response.data;
};

/** Update an existing authorized user (FormData). */
export const updateUserDetails = async (employeeId, payload) => {
  const response = await axios.put(
    `${Api_url}/authorizedUsers/update?userId=${employeeId}`,
    payload,
    { headers: authHeaders() }
  );
  return response.data;
};

/** Delete a single authorized user. */
export const delete_user = async (userId) => {
  return axios.delete(`${Api_url}/authorizedUsers/delete`, {
    params: { userId },
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
};

/** Delete all authorized users. */
export const delete_all_users = async () => {
  return axios.delete(`${Api_url}/authorizedUsers/delete-all`, {
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
};

/** Verify a face image against enrolled users (FormData). */
export const verifyUser = async (payload) => {
  const response = await axios.post(`${Api_url}/authorizedUsers/verifyUser`, payload, {
    headers: authHeaders(),
  });
  return response.data;
};

/** Bulk import employees from a parsed spreadsheet (JSON). */
export const bulkUploadUsers = async (data) => {
  const response = await axios.post(`${Api_url}/authorizedUsers/bulk-import`, data, {
    headers: authHeaders(),
  });
  return response.data;
};

/** Generate a time-limited admin token used to build a self-registration link. */
export const generateAdminToken = async ({ adminId, days }) => {
  const response = await axios.post(
    `${Api_url}/auth/generate-admin-token`,
    { adminId, days },
    { headers: authHeaders({ 'Content-Type': 'application/json' }) }
  );
  return response?.data;
};

/* ─────────────── Register form metadata ─────────────── */

/**
 * Departments for the register form dropdown.
 * `token` overrides the session token — used by the public employee portal,
 * which has no login cookie and must pass an explicit onboarding token.
 */
export const fetchDepartments = async (skip = 0, limit = 100, search = '', token) => {
  return axios.post(
    `${Api_url}/departments/get`,
    { skip, limit, search },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token || getAccessToken() } }
  );
};

/** Employee locations (raw axios response). `token` overrides the session token (see fetchDepartments).
 * The endpoint paginates and defaults to limit=10 when no query params are sent — passing a large
 * limit here keeps dropdowns (Register User's Location select, etc.) from silently truncating. */
export const getEmployeeLocations = async (token) => {
  return axios.post(
    `${Api_url}/locations/employee-location?skip=0&limit=1000`,
    {},
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token || getAccessToken() } }
  );
};

/** Departments for the filter (authorizedChannels), returns response.data.body. */
export const getFilterDepartments = async (data = {}) => {
  const response = await axios.post(`${Api_url}/authorizedChannels/departments`, data, {
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
  return response?.data?.body;
};

/** Check whether an email is already registered. `token` overrides the session token (public portal). */
export const isEmailExist = async (email, token) => {
  return axios.get(`${Api_url}/users/isEmailExist/`, {
    params: { email },
    headers: { 'Content-Type': 'application/json', 'x-access-token': token || getAccessToken() },
  });
};

/* ─────────────── Import employees by organization email ─────────────── */

export const isEmpAdminApi = async (data) => {
  const response = await axios.post(`${Api_url}/users/check-emp-admin`, data, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const getEmpUsers = async (data) => {
  const response = await axios.post(`${Api_url}/users/allOrgEmployee`, data, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const addempUsers = async (data) => {
  const response = await axios.post(`${Api_url}/users/import-users`, data, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const addEmpEmails = async (data) => {
  const response = await axios.post(`${Api_url}/admin/add-emp-emails`, data, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const getEmpEmails = async () => {
  const response = await axios.get(`${Api_url}/admin/get-emp-emails`, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const deleteEmpEmail = async (data) => {
  const response = await axios.delete(`${Api_url}/admin/delete-emp-email`, {
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    data,
  });
  return response?.data;
};

export const getLocationByEmpEmail = async () => {
  const response = await axios.get(`${Api_url}/admin/get-location-by-emp-email`, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const importUsersProgress = async () => {
  const response = await axios.get(`${Api_url}/users/import-users-progress`, {
    headers: authHeaders({ accept: 'application/json' }),
  });
  return response?.data;
};
