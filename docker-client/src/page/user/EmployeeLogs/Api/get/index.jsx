import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const getAttendanceLogs = async function (searchInput, nvrId, cameraId, startDate, endDate, page = 1, limit = 10,sortField = 'name',
  sortOrder = 'asc',departmentIds,fromTime,toTime,timeType,isExport,employeeLocations) {
  const token = getAccessToken();
  const skip = (page - 1) * limit;
  const body = {
    employeeLocations: Array.isArray(employeeLocations) ? employeeLocations : [],
  };
  return axios.post(
    `${HOST}/api/v1/attendance/get`,
    body,
    {
      params: {
        name: searchInput || '',
        channelId: cameraId,
        nvrId: nvrId,
        startDate: startDate || '',
        endDate: endDate || '',
        skip,
        limit,
        sortOrder,
        sortField,
        departmentIds,
        fromTime,
        toTime,
        timeType,
        export: isExport ? true : '',
      },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};



export const getAttendanceUserLogs = async function (employeeId, date) {
  const token = getAccessToken();
  return axios.post(
    `${HOST}/api/v1/attendance/user-logs`,
    { employeeId, date },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};

export const getTrackUsers = async function (search = '') {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/entry/users?search=${search}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

export const getTrackLogs = async function (userId = '', startDate = '') {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/entry/user/${userId}?startDate=${startDate}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

export const getVehicleList = async function (search = '') {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/vehicle/vehicles?search=${search}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

export const getVehicleLogs = async function (vehicleId = '', startDate = '') {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/vehicle/vehicle/${vehicleId}?startDate=${startDate}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};