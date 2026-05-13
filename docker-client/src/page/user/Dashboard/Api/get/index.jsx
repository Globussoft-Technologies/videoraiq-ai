import React from "react";
import getAccessToken from "@/utils/getAccessToken";
import { jwtDecode } from 'jwt-decode';
import axios from "axios";
import { waitForToken } from "@/utils/waitForToken";
import moment from 'moment';
const apiUrl = import.meta.env.VITE_BACKEND;
//  const token = getAccessToken();

export const getNvrNames = async (skip = 0, limit = 100) => {
    const token = await waitForToken();
    const response = await fetch(`${apiUrl}/api/v1/nvr?skip=${skip}&limit=${limit}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        'x-access-token': token,
      },
    });
    const data = await response.json();
    
    return data;
  } 

  export const getFiltersNvrNames = async (filterData) => {
    const token = await waitForToken();
    const response = await fetch(`${apiUrl}/api/v1/authorizedChannels/getNVRS`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        'x-access-token': token,
      },
      body:JSON.stringify(filterData)
    });
    const data = await response.json();
    
    return data;
  } 

export const getCamerasBasedOnNvr = async (id,selectedDepartment='',selectedLocation='',skip=0,limit=50,selectedcameratype='') => {
    const token = await waitForToken();
    const response = await axios.get(
     `${apiUrl}/api/v1/channel/?nvrId=${id}&skip=${skip}&limit=${limit}&department=${selectedDepartment}&location=${selectedLocation}&camType=${selectedcameratype}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token,
          
        },
      }
    );

    return response.data;
  } 


export const getAlertsData = async (nvrId, location, department) => {
    const token = await waitForToken();
    const today = moment().format('YYYY-MM-DD');
    const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');
    const data={
      startDate: today,
      endDate: today,
      nvrId: nvrId,
      location: location,
      department: department
    }
    const response = await fetch(`${apiUrl}/api/v1/dashboard/headerStats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        'x-access-token': token,
      },
      body: JSON.stringify(data)
    });

    const result= await response.json();
    return result;
  
}



export const comparisonChart=async()=>{
  const token = await waitForToken();
  const response =await axios.post(`${apiUrl}/api/v1/dashboard/dashboardWeeklyComparisonChart`,{},{
    headers:{
      'Content-Type':'application/json',
      'x-access-token':token
    }
  })
   
  return response.data;
}

export const authorizedUsers = async (skip, limit, search, data = {}) => {
  const token = await waitForToken();

  const response = await axios.post(
    `${apiUrl}/api/v1/authorizedUsers/fetch?skip=${skip}&limit=${limit}&search=${search}`,
    data, // ✅ send actual payload here
    {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    }
  );

  return response.data;
};

export const getRecentIncidents = async () => {
    const token = await waitForToken();
    const response = await axios.get(
     `${apiUrl}/api/v1/dashboard/recentIncidents`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token,
          
        },
      }
    );

    return response;
  } 

  export const getDepartments =async(data)=>{
    const token = await waitForToken();
    const response =await axios.post(`${apiUrl}/api/v1/authorizedChannels/departments`,data,{
      headers:{
        "Content-Type":'application/json',
         "x-access-token":token
      }
    })
    return response?.data?.body;
  }

    export const getLocations =async(data)=>{
    const token = await waitForToken();
    const response =await axios.post(`${apiUrl}/api/v1/authorizedChannels/locations`,data,{
      headers:{
        "Content-Type":'application/json',
         "x-access-token":token
      }
    })
    return response?.data?.body;
  }