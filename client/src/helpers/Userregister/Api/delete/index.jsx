import getAccessToken from "@/utils/getAccessToken";
import axios from "axios";
const HOST = import.meta.env.VITE_BACKEND;
export const delete_user = async function (userId) {
    const token = getAccessToken();
  return await axios.delete(`${HOST}/api/v1/authorizedUsers/delete`, {
    params:
    {
        userId
    }
  , 
    headers: {
      'Content-Type': 'application/json',
        'x-access-token': token,
    },
});
};

export const remove_image=async function (mediaPath ) {
  const token=getAccessToken();
  return await axios.delete(`${HOST}/api/v1/uploads/deleteMedia`,{
    params:{
      mediaPath 
    },
      headers:{
         'Content-Type': 'application/json',
        'x-access-token': token,
      },
  });
}



export const remove_image_edit=async function (mediaPath,userId ) {
  const token=getAccessToken();
  return await axios.delete(`${HOST}/api/v1/uploads/deleteUserMedia`,{
    params:{
      mediaPath,
      userId
    },
      headers:{
         'Content-Type': 'application/json',
        'x-access-token': token,
      },
  });
}

export const delete_all_users = async function () {
  const token = getAccessToken();
  return await axios.delete(`${HOST}/api/v1/authorizedUsers/delete-all`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};