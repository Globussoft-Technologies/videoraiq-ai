import React from "react";
import getAccessToken from "@/utils/getAccessToken";
import { jwtDecode } from 'jwt-decode';
import axios from "axios";
import { waitForToken } from "@/utils/waitForToken";
const apiUrl = import.meta.env.VITE_BACKEND;

// const token = getAccessToken();

export const getCriticalityStats = async(skip,limit=5)=>{
     const token = await waitForToken();
     const response = await axios.post(`${apiUrl}/api/v1/dashboard/criticalityStats?skip=${skip}&limit=${limit}`,{},{
      headers:{
         'Content-Type':'application/json',
         'x-access-token':token
       }
     })
    return response?.data?.body
     
}

export const getDetectionData =async ()=>{
        const token = await waitForToken();
        const response =await axios.post(`${apiUrl}/api/v1/dashboard/detectionChart`,{},{
        headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
    })

     return response;
}

export const getIncidentData =async (data,nvrId,cameraId,searchTerm,skip,limit)=>{
        const token = await waitForToken();
        const response =await axios.post(`${apiUrl}/api/v1/incidents/getIncidentsDetails?search=${searchTerm}&nvrId=${nvrId}&channelId=${cameraId}&skip=${skip}&limit=${limit}`,data,{
        headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
    })
     return response?.data;
}