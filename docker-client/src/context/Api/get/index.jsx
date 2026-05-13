import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const getAllUsesrPermissions = async function () {
    const token = getAccessToken();
    return axios.get(`${HOST}/api/v1/permissions/user-permissions`, {
        headers: {
            Accept: 'application/json',
            'x-access-token': token,
        },
    });
};

export const fetchLogsSound = async function () {
    const token = getAccessToken();
    return axios.get(`${HOST}/api/v1/admin/fetch-logs-sound`, {
        headers: {
            Accept: 'application/json',
            'x-access-token': token,
        },
    });
};
