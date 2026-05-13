import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const deleteUser = async (id) => {
  const token = getAccessToken();
  const response = await axios.delete(`${HOST}/api/v1/users/delete?userId=${id}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });

  return response;
};

export const deleteBulkUser = async (selectedUsers) => {
  const token = getAccessToken();

  const response = await axios.delete(`${HOST}/api/v1/users/bulk-delete`, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
    data: {
      userIds: selectedUsers,
    },
  });

  return response;
};
