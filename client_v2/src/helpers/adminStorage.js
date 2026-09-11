import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const baseUrl = import.meta.env.VITE_BACKEND;
const headers = () => ({ 'x-access-token': getAccessToken(), 'Content-Type': 'application/json' });

export const getAdminStorage = async () => {
  const { data } = await axios.get(`${baseUrl}/admin-storage`, { headers: headers() });
  return data;
};

export const testAdminStorage = async (payload, logo) => {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  form.append('logo', logo, 'videoraiq-storage-test.png');
  const { data } = await axios.post(`${baseUrl}/admin-storage/test`, form, {
    headers: { 'x-access-token': getAccessToken() },
  });
  return data;
};

export const saveAdminStorage = async (payload) => {
  const { data } = await axios.put(`${baseUrl}/admin-storage`, payload, { headers: headers() });
  return data;
};
