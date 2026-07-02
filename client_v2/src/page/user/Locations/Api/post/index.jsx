import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";

const Api_url = import.meta.env.VITE_BACKEND;

export const fetchLocations = async (skip = 0, limit = 10, search = "") => {
  const token = getAccessToken();
  return await axios.post(
    `${Api_url}/api/v1/locations/fetch?skip=${skip}&limit=${limit}&search=${search}`,
    {},
    {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};

export const createLocation = async (data) => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/api/v1/locations/create`, data, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    }
  });
};
