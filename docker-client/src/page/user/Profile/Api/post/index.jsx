import axios from "axios";
import getAccessToken from "@/utils/getAccessToken";
const Api_url =import.meta.env.VITE_BACKEND


export const getEmployees =async()=>{ 
  const token=getAccessToken();
    const response =await axios.post(`${Api_url}/api/v1/admin/get-emp-employees-by-organization?skip=0&limit=10`,{},{
        headers:{
            "Content-Type":"application/json",
            "x-access-token":token
        }
    });
    
    return response?.data;
}

export const importEmployeeProfile =async(data)=>{
  const token=getAccessToken();
  const response =await axios.post(`${Api_url}/api/v1/admin/import-emp-users`,{"usersData" :data},{
    headers:{
        'Content-Type':'application/json',
        'x-access-token':token
    },
   
  })
   return response?.data?.body;
} 

export const addProfile =async(data)=>{
  const token=getAccessToken();
  const response =await axios.post(`${Api_url}/api/v1/profiles/`,data,{
    headers:{
        'Content-Type':'application/json',
        'x-access-token':token
    },
   
  })
   return response?.data?.body;
} 

export const deleteBulkProfiles =async(selectedProfileIds)=>{
  const token=getAccessToken();
 const data={
  "ids": selectedProfileIds
 }
  const response =await axios.post(`${Api_url}/api/v1/profiles/bulk-delete`,data,{
    headers:{
        'Content-Type':'application/json',
        'x-access-token':token
    },
   
  })
   return response?.data?.body;
} 

export const profileBulkExport = async (selectedProfileIds) => {
  const token=getAccessToken();
  try {
    const data = {
      ids: selectedProfileIds
    };

    const response = await axios.post(
      `${Api_url}/api/v1/profiles/bulk-export`, // Replace with your actual export endpoint
      data,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token
        },
        responseType: 'blob' // Important: tells axios to treat response as binary
      }
    );

    // Create a URL for the blob
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;

    // Set the download file name
    link.setAttribute('download', 'profiles.zip');
    document.body.appendChild(link);
    link.click();

    // Cleanup
    link.remove();
    window.URL.revokeObjectURL(url);

    // Return the response if needed
    return response;

  } catch (error) {
    console.error('Error downloading ZIP:', error);
    return null; // or throw error if you want to handle it upstream
  }
};



