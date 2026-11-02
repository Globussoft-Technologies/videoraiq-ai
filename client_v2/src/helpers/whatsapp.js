import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';
export async function whatsappRequest(path, method = 'get', data) {
  const response = await axios({ method, url: `${import.meta.env.VITE_BACKEND}/whatsapp/${path}`, data,
    headers: { 'x-access-token': getAccessToken() }, timeout: 60000 });
  return response.data;
}
