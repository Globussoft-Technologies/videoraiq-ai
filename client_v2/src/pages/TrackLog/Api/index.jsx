import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const authHeaders = () => ({
  Accept: 'application/json',
  'x-access-token': getAccessToken(),
});

export const getTrackUsers = (search = '') =>
  axios.get(`${HOST}/entry/users?search=${search}`, { headers: authHeaders() });

export const getTrackLogs = (userId = '', startDate = '') =>
  axios.get(`${HOST}/entry/user/${userId}?startDate=${startDate}`, { headers: authHeaders() });

export const getVehicleList = (search = '') =>
  axios.get(`${HOST}/vehicle/vehicles?search=${search}`, { headers: authHeaders() });

export const getVehicleLogs = (vehicleId = '', startDate = '') =>
  axios.get(`${HOST}/vehicle/vehicle/${vehicleId}?startDate=${startDate}`, { headers: authHeaders() });
