import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const getAllRolesAndPermissionDetails = async function (skip, limit,searchQuery='') {
    const token = getAccessToken();
    return axios.post(
        `${HOST}/api/v1/permissions/roles_permissions?searchQuery=${searchQuery}&skip=${skip}&limit=${limit}`, {},
        {
            headers: {
                Accept: 'application/json',
                'x-access-token': token,
            },
        }
    );
};