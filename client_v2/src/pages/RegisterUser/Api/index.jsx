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
    `${Api_url}/api/v1/authorizedUsers/fetch?skip=${skip}&limit=${limit}&search=${search}`,
    data,
    { headers: authHeaders({ 'Content-Type': 'application/json' }) }
  );
  return response.data;
};

/**
 * Create an authorized user with profile images. `payload` is FormData;
 * Content-Type is intentionally omitted so the browser sets the multipart boundary.
 */
export const createAuthorizedUser = async (payload) => {
  const response = await axios.post(`${Api_url}/api/v1/authorizedUsers/create`, payload, {
    headers: authHeaders(),
  });
  return response.data;
};

/** Update an existing authorized user (FormData). */
export const updateUserDetails = async (employeeId, payload) => {
  const response = await axios.put(
    `${Api_url}/api/v1/authorizedUsers/update?userId=${employeeId}`,
    payload,
    { headers: authHeaders() }
  );
  return response.data;
};

/** Delete a single authorized user. */
export const delete_user = async (userId) => {
  return axios.delete(`${Api_url}/api/v1/authorizedUsers/delete`, {
    params: { userId },
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
};

/** Delete all authorized users. */
export const delete_all_users = async () => {
  return axios.delete(`${Api_url}/api/v1/authorizedUsers/delete-all`, {
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
};

/** Verify a face image against enrolled users (FormData). */
export const verifyUser = async (payload) => {
  const response = await axios.post(`${Api_url}/api/v1/authorizedUsers/verifyUser`, payload, {
    headers: authHeaders(),
  });
  return response.data;
};

/** Bulk import employees from a parsed spreadsheet (JSON). */
export const bulkUploadUsers = async (data) => {
  const response = await axios.post(`${Api_url}/api/v1/authorizedUsers/bulk-import`, data, {
    headers: authHeaders(),
  });
  return response.data;
};

/* ─────────────── Register form metadata ─────────────── */

/** Departments for the register form dropdown. */
export const fetchDepartments = async (skip = 0, limit = 100, search = '') => {
  return axios.post(
    `${Api_url}/api/v1/departments/get`,
    { skip, limit, search },
    { headers: authHeaders({ 'Content-Type': 'application/json' }) }
  );
};

/** Employee locations (raw axios response). */
export const getEmployeeLocations = async () => {
  return axios.post(
    `${Api_url}/api/v1/locations/employee-location`,
    {},
    { headers: authHeaders({ 'Content-Type': 'application/json' }) }
  );
};

/** Departments for the filter (authorizedChannels), returns response.data.body. */
export const getFilterDepartments = async (data = {}) => {
  const response = await axios.post(`${Api_url}/api/v1/authorizedChannels/departments`, data, {
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
  return response?.data?.body;
};

/** Check whether an email is already registered. */
export const isEmailExist = async (email) => {
  return axios.get(`${Api_url}/api/v1/users/isEmailExist/`, {
    params: { email },
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
};

/* ─────────────── Import employees by organization email ─────────────── */

export const isEmpAdminApi = async (data) => {
  const response = await axios.post(`${Api_url}/api/v1/users/check-emp-admin`, data, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const getEmpUsers = async (data) => {
  const response = await axios.post(`${Api_url}/api/v1/users/allOrgEmployee`, data, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const addempUsers = async (data) => {
  const response = await axios.post(`${Api_url}/api/v1/users/import-users`, data, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const addEmpEmails = async (data) => {
  const response = await axios.post(`${Api_url}/api/v1/admin/add-emp-emails`, data, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const getEmpEmails = async () => {
  const response = await axios.get(`${Api_url}/api/v1/admin/get-emp-emails`, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const deleteEmpEmail = async (data) => {
  const response = await axios.delete(`${Api_url}/api/v1/admin/delete-emp-email`, {
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    data,
  });
  return response?.data;
};

export const getLocationByEmpEmail = async () => {
  const response = await axios.get(`${Api_url}/api/v1/admin/get-location-by-emp-email`, {
    headers: authHeaders(),
  });
  return response?.data;
};

export const importUsersProgress = async () => {
  const response = await axios.get(`${Api_url}/api/v1/users/import-users-progress`, {
    headers: authHeaders({ accept: 'application/json' }),
  });
  return response?.data;
};
