import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const getAllStorageDetails = async function () {
    const token = getAccessToken();
    return axios.get(`${HOST}/api/v1/storage/`, {
        headers: {           
            "Content-Type":"application/json",
            'x-access-token': token,
        },
    });
};
