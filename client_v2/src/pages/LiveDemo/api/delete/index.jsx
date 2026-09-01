import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

export const deleteDemoMedia = async (mediaPath) => {
  return axios.delete(`${HOST}/uploads/deleteMedia`, {
    params: { mediaPath },
    headers: { 'x-access-token': getAccessToken() },
  });
};
