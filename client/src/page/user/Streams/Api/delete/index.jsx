import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

const HOST = import.meta.env.VITE_BACKEND;

export const deleteNVR = async function (nvrId) {
    const token = getAccessToken();

    return axios.delete(`${HOST}/api/v1/nvr/${nvrId}`, {
        headers: {
            Accept: 'application/json',
            'x-access-token': token,
        },
    });
};
