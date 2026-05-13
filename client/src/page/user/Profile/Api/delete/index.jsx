// getProfileDetails.js

import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

const HOST = import.meta.env.VITE_BACKEND;

export const deleteProfile = async function (profileId) {
  const token = getAccessToken();

  return axios.delete(`${HOST}/api/v1/profiles/${profileId}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
