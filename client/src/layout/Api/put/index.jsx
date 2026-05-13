import React from "react";
import getAccessToken from "@/utils/getAccessToken";
import { jwtDecode } from 'jwt-decode';
import axios from "axios";
import { waitForToken } from "@/utils/waitForToken";
const apiUrl = import.meta.env.VITE_BACKEND;

export const updateSidebarConfig=async(detectionData)=>{
  const token = await waitForToken();
  const response =await axios.put(`${apiUrl}/api/v1/dashboard/updateSidebarConfig`,detectionData,{
    headers:{
      'Content-Type':'application/json',
      'x-access-token':token
    }
  })
  return response.data;
}