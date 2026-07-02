import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";

const Api_url = import.meta.env.VITE_BACKEND;

export const updateLocation = async (id, data) => {
  const token = getAccessToken();
  return await axios.put(`${Api_url}/api/v1/locations/update?id=${id}`, data, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    }
  });
};
