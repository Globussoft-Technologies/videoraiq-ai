import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";

const Api_url = import.meta.env.VITE_BACKEND;

const headers = () => ({
  "Content-Type": "application/json",
  "x-access-token": getAccessToken(),
});

/** Paginated shifts for the management table. */
export const fetchShifts = async (skip = 0, limit = 10, name = "") => {
  const params = new URLSearchParams({ skip, limit });
  if (name) params.append("name", name);
  return axios.get(`${Api_url}/shifts?${params.toString()}`, { headers: headers() });
};

export const createShift = async (data) =>
  axios.post(`${Api_url}/shifts`, data, { headers: headers() });

export const updateShift = async (id, data) =>
  axios.put(`${Api_url}/shifts/${id}`, data, { headers: headers() });

export const deleteShift = async (id) =>
  axios.delete(`${Api_url}/shifts/${id}`, { headers: headers() });

/** Lightweight active-shift list for the Bulk Assign picker. */
export const fetchShiftList = async () =>
  axios.get(`${Api_url}/shifts/list`, { headers: headers() });

/**
 * Which employees a set of filters matches. Read-only, so the Bulk Assign
 * modal can call it on every filter change to show a running count.
 */
export const previewAssignment = async (filters) =>
  axios.post(`${Api_url}/shifts/assignments/preview`, filters, { headers: headers() });

/**
 * Employee search for the "specific employees" picker.
 *
 * Reuses the preview endpoint because it already applies the same tenant and
 * per-member location scoping the assign call will — a separate employee
 * lookup could offer someone the assign call would then silently skip.
 */
export const searchAssignableEmployees = async (search = '', limit = 50) =>
  axios.post(
    `${Api_url}/shifts/assignments/preview`,
    { search, limit, includeSuspended: true },
    { headers: headers() },
  );

/**
 * Assign a shift. `employeeIds` for one person, `locations`/`departmentIds`
 * for a group — the same endpoint backs both.
 */
export const assignShift = async (shiftId, filters) =>
  axios.post(`${Api_url}/shifts/${shiftId}/assign`, filters, { headers: headers() });

export const unassignShift = async (employeeIds) =>
  axios.patch(
    `${Api_url}/shifts/assignments/unassign`,
    { employeeIds },
    { headers: headers() },
  );

/** Roster behind a shift's assigned-employee count. */
export const fetchShiftEmployees = async (shiftId, { skip = 0, limit = 10, search = "" } = {}) => {
  const params = new URLSearchParams({ skip, limit });
  if (search) params.append("search", search);
  return axios.get(`${Api_url}/shifts/${shiftId}/employees?${params.toString()}`, {
    headers: headers(),
  });
};

/** Departments for the bulk-assign filter. */
export const fetchDepartments = async (skip = 0, limit = 200) =>
  axios.post(`${Api_url}/departments/get`, { skip, limit }, { headers: headers() });

/**
 * Locations for the bulk-assign filter.
 *
 * Deliberately the employee-location endpoint rather than /locations/fetch:
 * assignment filters on the employee's own `location` string, so the options
 * have to come from the same source or a site with no staff would offer a
 * filter that always matches nobody.
 */
export const fetchEmployeeLocations = async ({ skip = 0, limit = 200, search = "" } = {}) => {
  const params = new URLSearchParams({ skip, limit });
  if (search) params.append("search", search);
  return axios.post(
    `${Api_url}/locations/employee-location?${params.toString()}`,
    {},
    { headers: headers() },
  );
};
