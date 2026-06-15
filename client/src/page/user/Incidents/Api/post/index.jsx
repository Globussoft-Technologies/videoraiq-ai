const HOST = import.meta.env.VITE_BACKEND;
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

export const fetchAllIncidents = async function (skip, limit, data) {
  const token = getAccessToken();
  return await axios.post(
    `${HOST}/api/v1/incidents?skip=${skip}&limit=${limit}`,
    data,
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};
export const fetchIncidentsStats = async function (data) {
  const token = getAccessToken();
  return await axios.post(`${HOST}/api/v1/dashboard/headerStats`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};
export const updateIncidentReportStatus = async (data) => {
    const token = getAccessToken();
    const response = await axios.post(`${HOST}/api/v1/incidents/update-report-status`, data, {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    });
    return response?.data?.body;
};

export const deleteIncidentsByIds = async (selectedForDelete) => {
  const token = getAccessToken();
  const response = await axios.delete(`${HOST}/api/v1/incidents/delete-by-incidentIds`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
    data: {
      incidentIds: selectedForDelete,
    },
  });
  return response?.data;
};