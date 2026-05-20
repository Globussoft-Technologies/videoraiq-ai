import React from "react";
import getAccessToken from "@/utils/getAccessToken";
import { jwtDecode } from 'jwt-decode';
import axios from "axios";
import { waitForToken } from "@/utils/waitForToken";
const apiUrl = import.meta.env.VITE_BACKEND;

export const getSideBarConfig=async()=>{
  const token = await waitForToken();
  const response =await axios.get(`${apiUrl}/api/v1/dashboard/getSidebarConfig`,{
    headers:{
      'Content-Type':'application/json',
      'x-access-token':token
    }
  })
  return response.data;
}