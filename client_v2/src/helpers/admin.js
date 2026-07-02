import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

export const fetchLogsSound = async () => {
  const token = getAccessToken();
  return await axios.get(`${Api_url}/api/v1/admin/fetch-logs-sound`, { headers: { 'x-access-token': token } });
};

export const updateLogsSound = async (logsSound) => {
  const token = getAccessToken();
  return await axios.put(
    `${Api_url}/api/v1/admin/update-logs-sound`,
    { logsSound },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
};
