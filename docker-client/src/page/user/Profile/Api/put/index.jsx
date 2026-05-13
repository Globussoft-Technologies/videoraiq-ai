import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";
const Api_url =import.meta.env.VITE_BACKEND


export const updateProfile =async(profilId,data)=>{
  const token=getAccessToken();
  const response =await axios.put(`${Api_url}/api/v1/profiles/${profilId?._id}`,data,{
    headers:{
        'Content-Type':'application/json',
        'x-access-token':token
    },
   
  })
   return response?.data?.body;
} 
