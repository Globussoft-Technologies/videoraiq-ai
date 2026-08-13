import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";
const Api_url = import.meta.env.VITE_BACKEND;

export const fetchLocations = async (skip = 0, limit = 10, search = "", signal) => {
  const token = getAccessToken();
  return await axios.post(
    `${Api_url}/locations/fetch?skip=${skip}&limit=${limit}&search=${search}`,
    {},
    {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
      signal,
    }
  );
};

export const createLocation = async (data) => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/locations/create`, data, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    }
  });
};

export const updateLocation = async (id, data) => {
  const token = getAccessToken();
  return await axios.put(`${Api_url}/locations/update?id=${id}`, data, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    }
  });
};

export const deleteLocation = async (id) => {
  const token = getAccessToken();
  return await axios.delete(`${Api_url}/locations/delete?id=${id}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    }
  });
};
