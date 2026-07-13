import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const authHeaders = (extra = {}) => ({
  Accept: 'application/json',
  'x-access-token': getAccessToken(),
  ...extra,
});

// Fetch face images grouped by dsId (paginated). Each group has the dsId, the
// linked authorizedUser (populated when tagged, else null), and an images array
// whose `image` field is a relative path. `search` filters by dsId or the tagged
// user's name (case-insensitive, partial). `startDate`/`endDate` (YYYY-MM-DD)
// filter groups by their latestCreatedAt date. Response data is
// { totalCount, skip, limit, groups: [...] }.
export const getGroupedFaceImages = async (
  skip = 0,
  limit = 40,
  search = '',
  startDate = '',
  endDate = ''
) => {
  const params = { skip, limit };
  if (search) params.search = search;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  return axios.get(`${HOST}/api/v1/faceImages/grouped`, {
    params,
    headers: authHeaders(),
  });
};

// Delete one or more face images by their ids.
export const deleteFaceImages = async (imageIds) =>
  axios.delete(`${HOST}/api/v1/faceImages/delete`, {
    data: { imageIds },
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });

// Tag every image of a dsId with an authorized user.
export const tagFaceImages = async (dsId, authorizedUserId) =>
  axios.patch(
    `${HOST}/api/v1/faceImages/tag`,
    { dsId, authorizedUserId },
    { headers: authHeaders({ 'Content-Type': 'application/json' }) }
  );

// Create an authorized user so a dsId folder can be tagged immediately.
export const quickCreateFaceUser = async (payload) =>
  axios.post(`${HOST}/api/v1/faceImages/quick-create-user`, payload, {
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });

// Register-form metadata + authorized-user listing are shared with the
// RegisterUser flow — reuse them rather than duplicating the endpoints.
export {
  authorizedUsers,
  fetchDepartments,
  getEmployeeLocations,
} from '@/pages/RegisterUser/Api';
