const HOST = import.meta.env.VITE_BACKEND;
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

export const getAllAccessLogsDetails = async function (data) {
  const token = getAccessToken();
  const { sortField, sortOrder, ...bodyData } = data;
  const url = `${HOST}/api/v1/accessLogs/get?sortField=${sortField}&sortOrder=${sortOrder}`;
  return await axios.post(url, bodyData, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};

export const filterByDepartment=async function (data) {
   const token = getAccessToken();   
    return await axios.post(`${HOST}/api/v1/departments/get`,data,{
      headers:{
        "Content-Type":'application/json',
         "x-access-token":token
      }
    })
    
}

export const getNVRs= async function () {
  const token=getAccessToken()
  return axios.post(`${HOST}/api/v1/authorizedChannels/getNVRS`,{},{
    headers:{
      "Content-Type":"application/json",
      "x-access-token":token
    }
  })
}

export const getchannels= async function (data) {
  const token=getAccessToken()
  return axios.post(`${HOST}/api/v1/authorizedChannels/getChannels`,data,{
    headers:{
      "Content-Type":"application/json",
      "x-access-token":token
    }
  })
}

export const getEmployeeLocations = async function ({ skip = 0, limit = 100, search = '' } = {}) {
  const token = getAccessToken();
  const params = new URLSearchParams();
  params.append('skip', skip);
  params.append('limit', limit);
  if (search) params.append('search', search);
  return axios.post(
    `${HOST}/api/v1/locations/employee-location?${params.toString()}`,
    {},
    {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};

export const getDeskChannelGraph= async function (searchQuery,skip, limit,data) {
  const token=getAccessToken()
  return axios.post(`${HOST}/api/v1/incidents/deskAbsenceData?search=${searchQuery}&skip=${skip}&limit=${limit}`,data,{
    headers:{
      "Content-Type":"application/json",
      "x-access-token":token
    }
  })
}

export const getGuardChannelGraph= async function (searchQuery,skip, limit,data) {
  const token=getAccessToken()
  return axios.post(`${HOST}/api/v1/incidents/guardAbsenceData?search=${searchQuery}&skip=${skip}&limit=${limit}`,data,{
    headers:{
      "Content-Type":"application/json",
      "x-access-token":token
    }
  })
}