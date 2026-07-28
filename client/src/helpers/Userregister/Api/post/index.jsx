import getAccessToken from "@/utils/getAccessToken";
import axios from "axios";
const apiUrl = import.meta.env.VITE_BACKEND;

export const bulkUploadUsers = async (data) => {
  const token = await getAccessToken();
  const response = await axios.post(`${apiUrl}/api/v1/authorizedUsers/bulk-import`, data, {
    headers: {
      'x-access-token': token
    }
  });
  return response?.data;
}

export const generateAdminToken = async ({ adminId, days }) => {
  const token = await getAccessToken();
  const response = await axios.post(`${apiUrl}/api/v1/auth/generate-admin-token`, { adminId, days, userRegistrByLink: true }, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token
    }
  });
  return response?.data;
}

export const verifyUser = async (data) => {
  const token = await getAccessToken();
  const response = await axios.post(`${apiUrl}/api/v1/authorizedUsers/verifyUser`, data, {
    headers: {
      'x-access-token': token
    }
  });
  return response?.data;
}

export const isEmpAdminApi = async (data) => {
  const token = await getAccessToken();
  const response = await axios.post(`${apiUrl}/api/v1/users/check-emp-admin`, data, {
    headers: {
      'x-access-token': token
    }
  });
  return response?.data;
}

export const getEmpUsers = async (data) => {
  const token = await getAccessToken();
  const response = await axios.post(`${apiUrl}/api/v1/users/allOrgEmployee`, data, {
    headers: {
      'x-access-token': token
    }
  });
  return response?.data;
}

export const addempUsers = async (data) => {
  const token = await getAccessToken();
  const response = await axios.post(`${apiUrl}/api/v1/users/import-users`, data, {
    headers: {
      'x-access-token': token
    }
  });
  return response?.data;
}

export const addEmpEmails = async (data) => {
  const token = await getAccessToken();
  const response = await axios.post(`${apiUrl}/api/v1/admin/add-emp-emails`, data, {
    headers: {
      'x-access-token': token
    }
  });
  return response?.data;
}

export const getEmpEmails = async () => {
  const token = await getAccessToken();
  const response = await axios.get(`${apiUrl}/api/v1/admin/get-emp-emails`, {
    headers: {
      'x-access-token': token
    }
  });
  return response?.data;
}

export const deleteEmpEmail = async (data) => {
  const token = await getAccessToken();
  const response = await axios.delete(`${apiUrl}/api/v1/admin/delete-emp-email`, {
    headers: {
      'x-access-token': token,
      'Content-Type': 'application/json'
    },
    data
  });
  return response?.data;
}

export const getLocationByEmpEmail = async () => {
  const token = await getAccessToken();
  const response = await axios.get(`${apiUrl}/api/v1/admin/get-location-by-emp-email`, {
    headers: {
      'x-access-token': token
    }
  });
  return response?.data;
}


export const importUsersProgress = async () => {
  const token = await getAccessToken();
  const response = await axios.get(`${apiUrl}/api/v1/users/import-users-progress`, {
    headers: {
      'x-access-token': token,
      'accept': 'application/json'
    }
  });
  return response?.data;
}



export const fetchUniqueLocations = async (skip = 0, limit = 200, search = "") => {
  const token = await getAccessToken();
  const response = await axios.post(`${apiUrl}/api/v1/locations/employee-location?skip=${skip}&limit=${limit}&search=${search}`, {}, {
    headers: {
      'x-access-token': token,
      'accept': 'application/json'
    }
  });
  return response?.data;
}
