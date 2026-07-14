import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";
const Api_url = import.meta.env.VITE_BACKEND;

export const fetchDepartments = async (skip = 0, limit = 10, search = "") => {
  const token = getAccessToken();
  return await axios.post(
    `${Api_url}/departments/get`,
    { skip, limit, search },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};

export const createDepartment = async (data) => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/departments/create`, data, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    }
  });
};

export const updateDepartment = async (id, data) => {
  const token = getAccessToken();
  return await axios.put(`${Api_url}/departments/update?departmentId=${id}`, data, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    }
  });
};

export const deleteDepartment = async (id) => {
  const token = getAccessToken();
  return await axios.delete(`${Api_url}/departments/delete?departmentId=${id}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    }
  });
};
