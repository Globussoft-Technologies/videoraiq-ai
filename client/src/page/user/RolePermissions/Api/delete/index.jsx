import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const deleteRoleById = async (roleId) => {
    const token = getAccessToken();
    const response = await axios.delete(`${HOST}/api/v1/roles/delete?roleId=${roleId}`, {
        headers: {
            'Content-Type': 'application/json',
            'x-access-token': token
        }
    })

    return response;
}