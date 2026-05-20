import getAccessToken from "@/utils/getAccessToken";
import axios from "axios";
const apiUrl = import.meta.env.VITE_BACKEND;

export const updateUserDetails = async (employeeId, data) => {
  const token = await getAccessToken();
  const response = await axios.put(`${apiUrl}/api/v1/authorizedUsers/update?userId=${employeeId}`, data, {
    headers: {
      'x-access-token': token
    }
  });
  return response?.data;
}