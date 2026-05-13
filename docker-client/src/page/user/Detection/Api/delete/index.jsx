import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const deleteDetectionSettings = async(id)=>{
    const token =getAccessToken();
    const response =await axios.delete(`${HOST}/api/v1/detection-settings/${id}`,{
        headers:{
            'Content-Type':'application/json',
            'x-access-token':token
        }
    })

    return response;
}