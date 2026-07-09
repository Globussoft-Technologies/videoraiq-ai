import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const getAllDetectionTypes = async function () {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/detection-settings/types`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

// List of IANA timezone strings for the Time Zone picker.
export const getTimezones = async function () {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/admin/timezones`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

// The admin's currently-saved (global) timezone. Returns body.data.timezone.
export const getSavedTimezone = async function () {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/admin/timezone`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

export const getNvrWithChannels = async function (settingType) {
  const token = getAccessToken();
  return axios.get(
    `${HOST}/api/v1/nvr/with-channels?settingType=${settingType}`,
    {
      headers: {
        Accept: 'application/json',
        'x-access-token': token,
      },
    }
  );
};
export const getRecipientsData = async function (skipRecipients = 0, limitRecipients = 10) {
  const token = getAccessToken();
  return axios.get(
    `${HOST}/api/v1/recipients/fetch?alertType=''&skip=${skipRecipients}&limit=${limitRecipients}`,
    {
      headers: {
        Accept: 'application/json',
        'x-access-token': token,
      },
    }
  );
};

export const getVerifiedRecipients = async function (skipRecipients = 0, limitRecipients = 10) {
  const token = getAccessToken();
  return axios.get(
    `${HOST}/api/v1/recipients/fetch?alertType=email&skip=${skipRecipients}&limit=${limitRecipients}&filterByStatus=verified`,
    {
      headers: {
        Accept: 'application/json',
        'x-access-token': token,
      },
    }
  );
};

export const getAllDetectionDetails = async function (searchTermValue, nvrNameValue, cameraIdValue, skip = 0, limit = 50) {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/detection-settings/?nvrIds=${nvrNameValue}&channelIds=${cameraIdValue}&name=${searchTermValue}&skip=${skip}&limit=${limit}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

export const getAllNVRs = async function (skip = 0, limit = 100) {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/nvr?skip=${skip}&limit=${limit}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
export const getChannelsWithDetections = async function (nvrId, search = '', skip = 0, limit = 10) {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/channel/?nvrId=${nvrId}&search=${search}&skip=${skip}&limit=${limit}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

export const getAppliedProfile = async function (cameraId) {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/channel/${cameraId}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

export const getDetectionSettingType = async function (settingType,channelId) {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/detection-settings/?settingType=${settingType}&channelIds=${channelId}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};