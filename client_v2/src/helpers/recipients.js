import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

export const getRecipients = async (alertType = 'email', search = '', filterByStatus = 'All', skip = 0, limit = 100) => {
  const token = getAccessToken();
  const params = { alertType, search: String(search || '').trim(), filterByStatus, skip, limit };
  const request = (requestParams) => axios.get(`${Api_url}/recipients/fetch`, {
    params: requestParams,
    headers: { 'x-access-token': token },
  });
  const extract = (res) => res?.data?.body?.data?.alerts ?? [];
  const requested = extract(await request(params));
  const term = params.search.toLowerCase();
  if (!term) return requested;

  // Older API deployments accepted the query but did not apply it to
  // fullName. Filter the returned rows locally as a compatibility guard, and
  // retry without the search when that deployment returns an empty page.
  const matches = (recipient) => [recipient?.fullName, recipient?.value]
    .some((value) => String(value || '').toLowerCase().includes(term));
  const filtered = requested.filter(matches);
  if (filtered.length || requested.length) return filtered;

  const fallback = extract(await request({ ...params, search: '', skip: 0, limit: Math.max(limit, 1000) }));
  return fallback.filter(matches);
};

export const createRecipient = async ({ type, value, fullName, incidentTypes, departmentIds, severityByType }) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/recipients/create?alertType=${type}`,
    { [type]: value, fullName, incidentTypes: incidentTypes || [], departmentIds: departmentIds || [], severityByType: severityByType || {} },
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

// The link mailed when an admin adds a user (…/verify?…&kind=user). Public: the
// person clicking is not logged in.
export const verifyUserEmail = async ({ value, tokenData }) => {
  const res = await axios.post(
    `${Api_url}/users/email-verification/verify?token=${encodeURIComponent(tokenData)}`,
    { email: value },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return res?.data;
};

export const verifyRecipientOtp = async ({ type, value, tokenData }) => {
  const res = await axios.post(
    `${Api_url}/recipients/verify?alertType=${type}&otp=${encodeURIComponent(tokenData)}`,
    { [type]: value },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return res?.data;
};
