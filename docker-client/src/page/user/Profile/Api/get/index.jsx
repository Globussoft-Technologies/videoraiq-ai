// getProfileDetails.js

import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

const HOST = import.meta.env.VITE_BACKEND;

export const getProfileDetails = async function ({
  page = 1,
  limit = 10,
  search = '',
  orderBy = 'basics.profileName',
  sort = 'asc',
}) {
  const token = getAccessToken();
  const skip = (page - 1) * limit;
  return axios.get(`${HOST}/api/v1/profiles`, {
    params: {
      skip,
      limit,
      orderBy,
      sort,
      name: search,
    },
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};


// export const getProfileExport = async function (profileId) {
//   const token = getAccessToken();
//   return axios.get(`${HOST}/api/v1/profiles/export/${profileId}`, {
 
//     headers: {
//       Accept: 'application/json',
//       'x-access-token': token,
//     },
//   });
// };

export const getProfileExport = async (id) => {
  try {
    const response = await axios.get(
      `${HOST}/api/v1/profiles/export/${id}`,
      {
        responseType: "blob",
        headers: {
      // Accept: 'application/json',  
      'x-access-token': getAccessToken(),
    },
      }
    );

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `profile_${id}.enc`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    console.error("Download failed", err);
  }
};

export const getObjectDetectionList = async function () {
    const token = getAccessToken();
    return axios.get(
        `${HOST}/api/v1/detection-objects/`,
        {
            headers: {
                Accept: 'application/json',
                'x-access-token': token,
            },
        }
    );
};

export const getStorage = async function () {
    const token = getAccessToken();
    return axios.get(
        `${HOST}/api/v1/storage/`,
        {
            headers: {
                Accept: 'application/json',
                'x-access-token': token,
            },
        }
    );
};