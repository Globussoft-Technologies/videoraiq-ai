import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

export const getRecipients = async (alertType = 'email', search = '', filterByStatus = 'All', skip = 0, limit = 100) => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/recipients/fetch?alertType=${alertType}&search=${encodeURIComponent(search)}&filterByStatus=${filterByStatus}&skip=${skip}&limit=${limit}`,
    { headers: { 'x-access-token': token } }
  );
  return res?.data?.body?.data?.alerts ?? [];
};

export const createRecipient = async ({ type, value, fullName, incidentTypes }) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/recipients/create?alertType=${type}`,
    { [type]: value, fullName, incidentTypes: incidentTypes || [] },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return res?.data;
};

export const updateRecipient = async (id, data) => {
  const token = getAccessToken();
  const res = await axios.put(
    `${Api_url}/recipients/update?id=${id}`,
    data,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return res?.data?.body ?? res?.data;
};

export const removeRecipient = async (data) => {
  const token = getAccessToken();
  const res = await axios.delete(`${Api_url}/recipients/delete`, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
    data,
  });
  return res?.data?.body;
};

export const resendVerification = async ({ id, type, value }) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/recipients/resendMailOrSMS?alertType=${type}&id=${id}`,
    { [type]: value },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return res?.data?.body;
};
