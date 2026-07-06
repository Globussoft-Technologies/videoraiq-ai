import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

const HOST = import.meta.env.VITE_BACKEND;

// Fetch face images grouped by dsId (paginated). Each group has the dsId, the
// linked authorizedUser (populated when tagged, else null), and an images array
// whose `image` field is a full URL. `search` filters by dsId or the tagged
// user's first/last/full name (case-insensitive, partial). `startDate`/`endDate`
// (YYYY-MM-DD) filter groups by their latestCreatedAt date. Response data is
// { totalCount, skip, limit, groups: [...] }.
export const getGroupedFaceImages = async function (
  skip = 0,
  limit = 40,
  search = '',
  startDate = '',
  endDate = ''
) {
  const token = getAccessToken();
  const params = { skip, limit };
  if (search) params.search = search;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  return axios.get(`${HOST}/api/v1/faceImages/grouped`, {
    params,
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

// Create an authorized user so a dsId folder can be tagged immediately.
// `payload` carries only the fields the caller wants to send (blanks omitted);
// see TagFlaggedUserModal for how it's built.
export const quickCreateFaceUser = async function (payload) {
  const token = getAccessToken();
  return axios.post(
    `${HOST}/api/v1/faceImages/quick-create-user`,
    payload,
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};

// Tag every image of a dsId with an authorized user.
export const tagFaceImages = async function (dsId, authorizedUserId) {
  const token = getAccessToken();
  return axios.patch(
    `${HOST}/api/v1/faceImages/tag`,
    { dsId, authorizedUserId },
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};

// Delete one or more face images by their ids.
export const deleteFaceImages = async function (imageIds) {
  const token = getAccessToken();
  return axios.delete(`${HOST}/api/v1/faceImages/delete`, {
    data: { imageIds },
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};
