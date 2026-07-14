import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";

const Api_url = import.meta.env.VITE_BACKEND;

export const deleteDepartment = async (id) => {
  const token = getAccessToken();
  return await axios.delete(`${Api_url}/departments/delete?departmentId=${id}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    }
  });
};
