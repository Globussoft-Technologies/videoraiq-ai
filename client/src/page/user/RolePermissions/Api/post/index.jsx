const HOST = import.meta.env.VITE_BACKEND;
import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";


export const createRole = async (data) => {
    const token = await getAccessToken();
    const response = await axios.post(`${HOST}/api/v1/roles/create`, data, {
        headers: {
            'Content-Type': 'application/json',
            'x-access-token': token
        }
    })
    return response?.data;
}