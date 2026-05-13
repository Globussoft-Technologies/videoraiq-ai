import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";
const Api_url = import.meta.env.VITE_BACKEND;

export const getUserDetails = async (debouncedSearch, limit, page, data = {}) => {
  const token = getAccessToken();

  // Correct skip calculation
  const skip = (page - 1) * limit;


  return await axios.post(
    `${Api_url}/api/v1/users/fetch?skip=${skip}&limit=${limit}&searchQuery=${debouncedSearch}&orderBy=${data.sortField}&sort=${data.sortOrder}`,
    data,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};


export const createUser = async (data) => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/api/v1/users/create`, data, {
      headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
  });
};
export const updateUser = async (id, data) => {
  const token = getAccessToken();
  return await axios.put(`${Api_url}/api/v1/users/update?userId=${id}`, data, {
     headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
  });
};

export const getLocations = async ( data) => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/api/v1/authorizedChannels/fetchChannels`, data, {
     headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
  });
};

export const getLocation= async ( data) => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/api/v1/authorizedChannels/locations`, data, {
     headers:{
            'Content-Type':'application/json',
            'x-access-token':token
    }
  });
};

export const getNvrs= async ( data) => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/api/v1/authorizedChannels/getNVRS`, data, {
     headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
  });
};

export const getDepartment= async ( data) => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/api/v1/authorizedChannels/departments`, data, {
     headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
  });
};

export const getChannels= async ( data) => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/api/v1/authorizedChannels/getChannels`, data, {
     headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
  });
};

export const getUserById = async (userId) => {
  const token = getAccessToken();
  return await axios.get(`${Api_url}/api/v1/users/fetch/${userId}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};

export const getEmployeeLocations = async () => {
  const token = getAccessToken();
  return await axios.post(`${Api_url}/api/v1/locations/employee-location`, {},{
     headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
  });
};