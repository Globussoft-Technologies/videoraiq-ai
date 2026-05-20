import axios from "axios";
const HOST = import.meta.env.VITE_BACKEND;

export const adminLoginLocal = async (data) => {
    const response = await axios.post(`${HOST}/api/v1/auth/by-login-pass`, data, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    })

    return response.data;
}